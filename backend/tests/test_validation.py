import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.batter import (
    MAX_DISPLAY_NAME_LENGTH,
    MAX_STAT_VALUE,
    BatterCountStats,
    normalize_display_name,
    stats_warning_items,
    stats_warnings,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_PATH = REPO_ROOT / "schemas" / "batter_stats_validation_cases.json"
NAME_CASES_PATH = REPO_ROOT / "schemas" / "display_name_validation_cases.json"
PRESET_DIR = REPO_ROOT / "data" / "presets"

with open(CASES_PATH, encoding="utf-8") as f:
    CASES_FILE = json.load(f)
with open(NAME_CASES_PATH, encoding="utf-8") as f:
    NAME_CASES_FILE = json.load(f)

client = TestClient(app)


def _stats_for(case: dict) -> dict:
    stats = dict(CASES_FILE["base"])
    for key, value in case["override"].items():
        if value is None:
            stats.pop(key)  # null は「項目を省略する」ことを表す
        else:
            stats[key] = value
    return stats


def _lineup_body(stats_by_id: dict[str, dict], **extra) -> dict:
    return {"batters": stats_by_id, "input_order": list(stats_by_id), **extra}


def _nine(stats: dict) -> dict[str, dict]:
    return {f"b{i}": dict(stats) for i in range(9)}


def test_max_stat_value_matches_cases_file():
    assert CASES_FILE["max_stat_value"] == MAX_STAT_VALUE


@pytest.mark.parametrize("case", CASES_FILE["cases"], ids=lambda c: c["name"])
def test_shared_validation_cases(case):
    stats = _stats_for(case)
    if not case["valid"]:
        with pytest.raises(ValidationError):
            BatterCountStats.model_validate(stats)
        return
    model = BatterCountStats.model_validate(stats)
    # 共通の例の warning は「PA と内訳の不一致」の有無を表す (フロントエンドの入力検証と照合する対象)。
    # 打席数が少ないことの注意 (LOW_PA) は API だけが出すので、ここでは数えない
    kinds = [kind for kind, _ in stats_warning_items("b0", model)]
    assert ("PA_SUM_MISMATCH" in kinds) == case["warning"]


@pytest.mark.parametrize("preset_path", sorted(PRESET_DIR.rglob("*.json")), ids=lambda p: p.name)
def test_all_presets_pass_validation_without_warnings(preset_path):
    with open(preset_path, encoding="utf-8") as f:
        preset = json.load(f)
    model = BatterCountStats.model_validate(preset["stats"])
    assert stats_warnings(preset["id"], model) == []


def test_evaluate_rejects_inconsistent_stats_with_422():
    bad = dict(CASES_FILE["base"], H=541, SO=0, GIDP=0)  # 安打が打数より多い
    res = client.post("/lineup/evaluate", json=_lineup_body(_nine(bad)))
    assert res.status_code == 422


def test_evaluate_rejects_zero_pa_with_422():
    zero = {k: 0 for k in CASES_FILE["base"]}
    res = client.post("/lineup/evaluate", json=_lineup_body(_nine(zero)))
    assert res.status_code == 422


def test_evaluate_rejects_duplicate_ids_in_input_order():
    batters = {f"b{i}": dict(CASES_FILE["base"]) for i in range(8)}
    body = {"batters": batters, "input_order": [*batters, "b0"]}  # 8人 + 重複1件 = 9件
    res = client.post("/lineup/evaluate", json=body)
    assert res.status_code == 400


@pytest.mark.parametrize("n_games", [0, -1, 201])
def test_evaluate_rejects_out_of_range_n_games(n_games):
    res = client.post("/lineup/evaluate", json=_lineup_body(_nine(CASES_FILE["base"]), n_games=n_games))
    assert res.status_code == 422


def test_evaluate_returns_totals_for_143_and_162_games():
    res = client.post("/lineup/evaluate", json=_lineup_body(_nine(CASES_FILE["base"])))
    assert res.status_code == 200
    data = res.json()
    assert data["warnings"] == []
    assert data["n_games"] == 143
    assert [t["n_games"] for t in data["totals_by_games"]] == [143, 162]
    for total in data["totals_by_games"]:
        n = total["n_games"]
        assert total["input_order_runs"] == data["input_order_runs_per_game"] * n
        assert total["best_order_runs"] == data["best_order_runs_per_game"] * n
    # 既存フィールドは従来どおり (n_games=143 での換算)
    assert data["input_order_runs_n_games"] == data["input_order_runs_per_game"] * 143
    assert data["best_order_runs_n_games"] == data["best_order_runs_per_game"] * 143


def test_evaluate_returns_warning_when_pa_does_not_match_components():
    batters = _nine(CASES_FILE["base"])
    batters["b3"] = dict(CASES_FILE["base"], PA=610)  # 内訳の合計は600
    res = client.post("/lineup/evaluate", json=_lineup_body(batters))
    assert res.status_code == 200
    warnings = res.json()["warnings"]
    assert len(warnings) == 1
    assert warnings[0].startswith("b3:")


def test_max_display_name_length_matches_cases_file():
    assert NAME_CASES_FILE["max_length"] == MAX_DISPLAY_NAME_LENGTH


@pytest.mark.parametrize("case", NAME_CASES_FILE["cases"], ids=lambda c: c["name"])
def test_shared_display_name_cases(case):
    if not case["valid"]:
        with pytest.raises(ValueError):
            normalize_display_name(case["value"])
        return
    assert normalize_display_name(case["value"]) == case["normalized"]


def _names(batters: dict[str, dict]) -> dict[str, str]:
    return {bid: f"選手{i + 1}" for i, bid in enumerate(batters)}


def test_evaluate_uses_display_name_in_warnings():
    batters = _nine(CASES_FILE["base"])
    batters["b3"] = dict(CASES_FILE["base"], PA=610)  # 内訳の合計は600
    names = _names(batters)
    names["b3"] = "  Aaron Judge "  # 前後の空白は除かれる
    res = client.post("/lineup/evaluate", json=_lineup_body(batters, display_names=names))
    assert res.status_code == 200
    data = res.json()
    assert len(data["warnings"]) == 1
    assert data["warnings"][0].startswith("Aaron Judge: 打席数(PA)=610 ")
    # 打順は表示名ではなく打者IDで返す
    assert data["input_order"] == list(batters)
    assert set(data["best_order"]) == set(batters)


def test_evaluate_result_does_not_depend_on_display_names():
    batters = _nine(CASES_FILE["base"])
    batters["b0"] = dict(CASES_FILE["base"], HR=40, H=170)
    without = client.post("/lineup/evaluate", json=_lineup_body(batters)).json()
    with_names = client.post(
        "/lineup/evaluate", json=_lineup_body(batters, display_names=_names(batters))
    ).json()
    assert with_names["input_order_runs_per_game"] == without["input_order_runs_per_game"]
    assert with_names["best_order_runs_per_game"] == without["best_order_runs_per_game"]


@pytest.mark.parametrize("bad_name", ["", "   ", "あ" * (MAX_DISPLAY_NAME_LENGTH + 1), "打者\nA", "打者\tA"])
def test_evaluate_rejects_invalid_display_name_with_422(bad_name):
    batters = _nine(CASES_FILE["base"])
    names = _names(batters)
    names["b0"] = bad_name
    res = client.post("/lineup/evaluate", json=_lineup_body(batters, display_names=names))
    assert res.status_code == 422


def test_evaluate_rejects_display_names_not_matching_batter_ids():
    batters = _nine(CASES_FILE["base"])
    names = _names(batters)
    del names["b0"]
    res = client.post("/lineup/evaluate", json=_lineup_body(batters, display_names=names))
    assert res.status_code == 400
    assert res.json()["detail"] == "display_names must contain exactly the given batter ids"


def test_evaluate_rejects_duplicate_display_names():
    batters = _nine(CASES_FILE["base"])
    names = _names(batters)
    names["b1"] = f" {names['b0']} "  # 前後の空白を除くと b0 と同じ名前
    res = client.post("/lineup/evaluate", json=_lineup_body(batters, display_names=names))
    assert res.status_code == 400
    assert res.json()["detail"] == "display_names must not contain duplicate names"


@pytest.mark.parametrize("league", ["../..", "MLB", "mlb/2025", ""])
def test_presets_rejects_invalid_league(league):
    res = client.get("/presets", params={"league": league, "season": 2025})
    assert res.status_code == 422


def test_presets_unknown_league_returns_empty_list():
    res = client.get("/presets", params={"league": "npb", "season": 2025})
    assert res.status_code == 200
    assert res.json() == []
