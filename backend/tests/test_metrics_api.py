"""POST /batters/metrics (表示用の指標) と、打席数が少ない打者への注意のテスト"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.batter import (
    LOW_PA_THRESHOLD,
    MAX_DISPLAY_NAME_LENGTH,
    BatterCountStats,
    stats_warning_items,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PRESET_DIR = REPO_ROOT / "data" / "presets"

client = TestClient(app)

# PA 600 = AB 540 + BB 40 + HBP 10 + SF 5 + SH 5。単打 = 150 - 30 - 5 - 15 = 100
BASE = {
    "PA": 600, "AB": 540, "H": 150, "2B": 30, "3B": 5, "HR": 15, "BB": 40, "HBP": 10,
    "SO": 100, "SF": 5, "SH": 5, "GIDP": 10, "SB": 10, "CS": 3,
}


def _metrics(batters: dict[str, dict], **extra) -> dict:
    res = client.post("/batters/metrics", json={"batters": batters, **extra})
    assert res.status_code == 200, res.text
    return res.json()["batters"]


# ---- 指標の定義 ----

def test_metrics_follow_standard_definitions():
    m = _metrics({"b1": BASE})["b1"]
    assert m["PA"] == 600
    assert m["HR"] == 15
    assert m["SB"] == 10
    assert m["CS"] == 3
    assert m["AVG"] == pytest.approx(150 / 540)                       # H / AB
    assert m["OBP"] == pytest.approx((150 + 40 + 10) / (540 + 40 + 10 + 5))  # (H+BB+HBP) / (AB+BB+HBP+SF)
    total_bases = 100 + 2 * 30 + 3 * 5 + 4 * 15
    assert m["SLG"] == pytest.approx(total_bases / 540)               # 総塁打 / AB
    assert m["OPS"] == pytest.approx(m["OBP"] + m["SLG"])             # 出塁率 + 長打率
    assert m["BB_pct"] == pytest.approx(40 / 600)                     # BB / PA
    assert m["SO_pct"] == pytest.approx(100 / 600)                    # SO / PA
    assert m["warnings"] == []


def test_metrics_do_not_include_woba_or_wrc_plus():
    # wOBA・wRC+ は、このアプリでは計算しない (DESIGN 3-2)
    m = _metrics({"b1": BASE})["b1"]
    assert set(m) == {"PA", "HR", "SB", "CS", "AVG", "OBP", "SLG", "OPS", "BB_pct", "SO_pct", "warnings"}


def test_metrics_are_returned_per_batter():
    slugger = dict(BASE, HR=45, H=170)
    result = _metrics({"b1": BASE, "b2": slugger})
    assert set(result) == {"b1", "b2"}
    assert result["b2"]["SLG"] > result["b1"]["SLG"]
    assert result["b2"]["HR"] == 45


# ---- 分母が0のとき ----

def test_metrics_with_zero_at_bats_return_null_for_avg_slg_ops():
    # 四球だけの打者: 打数0なので打率・長打率は計算できない。出塁率は計算できる
    walks_only = {
        "PA": 10, "AB": 0, "H": 0, "2B": 0, "3B": 0, "HR": 0, "BB": 10, "HBP": 0,
        "SO": 0, "SF": 0, "SH": 0, "GIDP": 0, "SB": 0, "CS": 0,
    }
    m = _metrics({"b1": walks_only})["b1"]
    assert m["AVG"] is None
    assert m["SLG"] is None
    assert m["OPS"] is None  # 長打率が計算できないので OPS も計算できない
    assert m["OBP"] == pytest.approx(1.0)
    assert m["BB_pct"] == pytest.approx(1.0)
    assert m["SO_pct"] == 0.0


def test_metrics_with_only_sacrifice_bunts_return_null_for_obp():
    # 犠打だけの打者: 出塁率の分母 (AB+BB+HBP+SF) も0
    bunts_only = {
        "PA": 5, "AB": 0, "H": 0, "2B": 0, "3B": 0, "HR": 0, "BB": 0, "HBP": 0,
        "SO": 0, "SF": 0, "SH": 5, "GIDP": 0, "SB": 0, "CS": 0,
    }
    m = _metrics({"b1": bunts_only})["b1"]
    assert m["AVG"] is None
    assert m["OBP"] is None
    assert m["SLG"] is None
    assert m["OPS"] is None


def test_metrics_zero_hits_is_zero_not_null():
    hitless = dict(BASE, H=0, **{"2B": 0, "3B": 0}, HR=0)
    m = _metrics({"b1": hitless})["b1"]
    assert m["AVG"] == 0.0  # 計算できて0。null (計算できない) とは区別する
    assert m["SLG"] == 0.0


# ---- 入力の検証 ----

def test_metrics_accepts_one_to_nine_batters():
    assert len(_metrics({f"b{i}": BASE for i in range(9)})) == 9
    assert client.post("/batters/metrics", json={"batters": {}}).status_code == 422
    ten = {f"b{i}": BASE for i in range(10)}
    assert client.post("/batters/metrics", json={"batters": ten}).status_code == 422


def test_metrics_rejects_inconsistent_stats_with_422():
    bad = dict(BASE, H=541, SO=0, GIDP=0)  # 安打が打数より多い
    assert client.post("/batters/metrics", json={"batters": {"b1": bad}}).status_code == 422


def test_metrics_validates_display_names_like_evaluate():
    batters = {"b1": BASE, "b2": BASE}

    def post(names: dict[str, str]):
        return client.post("/batters/metrics", json={"batters": batters, "display_names": names})

    assert post({"b1": "あ" * (MAX_DISPLAY_NAME_LENGTH + 1), "b2": "B"}).status_code == 422
    assert post({"b1": "A"}).status_code == 400
    assert post({"b1": "A", "b2": " A "}).status_code == 400
    assert post({"b1": "A", "b2": "B"}).status_code == 200


# ---- 打席数が少ない打者への注意 ----

def test_low_pa_threshold_is_200():
    # 本プロジェクトの目安 (出典・統計的根拠なし)。値を変えるときは README・DESIGN の記載も直す
    assert LOW_PA_THRESHOLD == 200


def _with_pa(pa: int) -> dict:
    # 内訳の合計が PA と合う成績 (PA不一致の警告が混ざらないようにする)
    return {
        "PA": pa, "AB": pa, "H": pa // 4, "2B": 0, "3B": 0, "HR": 0, "BB": 0, "HBP": 0,
        "SO": 0, "SF": 0, "SH": 0, "GIDP": 0, "SB": 0, "CS": 0,
    }


@pytest.mark.parametrize(
    ("pa", "expected"),
    [(1, True), (LOW_PA_THRESHOLD - 1, True), (LOW_PA_THRESHOLD, False), (LOW_PA_THRESHOLD + 1, False)],
)
def test_low_pa_warning_boundary(pa, expected):
    model = BatterCountStats.model_validate(_with_pa(pa))
    kinds = [kind for kind, _ in stats_warning_items("b1", model)]
    assert ("LOW_PA" in kinds) == expected


def test_low_pa_warning_message_names_batter_and_pa():
    m = _metrics({"b1": _with_pa(150)}, display_names={"b1": "Luis Arraez"})["b1"]
    assert len(m["warnings"]) == 1
    message = m["warnings"][0]
    assert message.startswith("Luis Arraez: 打席数(PA)=150 は少なめです（目安：200未満）。")
    assert "標本が小さい" in message
    assert "計算はそのまま行っています" in message


def test_low_pa_and_pa_mismatch_warnings_can_both_appear():
    stats = dict(_with_pa(150), PA=160)  # 内訳の合計は150
    m = _metrics({"b1": stats})["b1"]
    assert len(m["warnings"]) == 2
    assert "一致しません" in m["warnings"][0]
    assert "少なめです" in m["warnings"][1]


def test_evaluate_includes_low_pa_warning_without_stopping():
    batters = {f"b{i}": dict(BASE) for i in range(9)}
    batters["b4"] = _with_pa(120)
    names = {bid: f"選手{i + 1}" for i, bid in enumerate(batters)}
    res = client.post(
        "/lineup/evaluate",
        json={"batters": batters, "input_order": list(batters), "display_names": names},
    )
    assert res.status_code == 200  # エラーにはしない
    data = res.json()
    assert data["warnings"] == [
        "選手5: 打席数(PA)=120 は少なめです（目安：200未満）。"
        "成績の標本が小さいため、確率の見積もりが実力からずれやすく、打順の結果も変わりやすくなります。"
        "計算はそのまま行っています。"
    ]
    assert data["input_order_runs_per_game"] > 0


def test_evaluate_and_metrics_return_the_same_warning_text():
    batters = {f"b{i}": dict(BASE) for i in range(9)}
    batters["b4"] = dict(_with_pa(120), PA=130)  # 2種類の注意が出る
    evaluated = client.post(
        "/lineup/evaluate", json={"batters": batters, "input_order": list(batters)}
    ).json()
    metrics = _metrics(batters)
    assert metrics["b4"]["warnings"] == evaluated["warnings"]


@pytest.mark.parametrize("preset_path", sorted(PRESET_DIR.rglob("*.json")), ids=lambda p: p.name)
def test_presets_have_enough_pa_and_computable_metrics(preset_path):
    with open(preset_path, encoding="utf-8") as f:
        preset = json.load(f)
    assert preset["stats"]["PA"] >= LOW_PA_THRESHOLD
    m = _metrics({preset["id"]: preset["stats"]})[preset["id"]]
    assert m["warnings"] == []
    assert all(m[key] is not None for key in ("AVG", "OBP", "SLG", "OPS"))
