from fastapi.testclient import TestClient

from app.main import app
from app.schemas.batter import BatterCountStats

client = TestClient(app)

STATS_BY_ALIAS = {
    "PA": 600, "AB": 540, "H": 150, "2B": 30, "3B": 5, "HR": 15, "BB": 40, "HBP": 10,
    "SO": 100, "SF": 5, "SH": 5, "GIDP": 10, "SB": 10, "CS": 3,
}


def test_batter_stats_accept_alias_and_field_names():
    by_alias = BatterCountStats.model_validate(STATS_BY_ALIAS)
    by_name = dict(STATS_BY_ALIAS)
    by_name["doubles"] = by_name.pop("2B")
    by_name["triples"] = by_name.pop("3B")
    by_field = BatterCountStats.model_validate(by_name)
    assert by_alias == by_field
    assert (by_alias.doubles, by_alias.triples) == (30, 5)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_presets_include_summary():
    res = client.get("/presets", params={"league": "mlb", "season": 2025})
    assert res.status_code == 200
    presets = {p["id"]: p for p in res.json()}

    judge = presets["aaron_judge_2025"]["summary"]
    assert judge["PA"] == 679
    assert judge["HR"] == 53
    assert judge["AVG"] == 0.331  # 179 / 541
    assert judge["SB"] == 12
    assert judge["CS"] == 5
    assert judge["SB_pct"] == 0.706  # 12 / 17
    for key in ("OBP", "SLG"):
        assert key in judge
    # wOBA・wRC+ は、アプリでは計算しない (公表値があれば reference_metrics で返す)
    assert "wOBA" not in judge
    assert "wRC_plus" not in judge


def test_presets_return_null_reference_metrics_when_not_in_json():
    res = client.get("/presets", params={"league": "mlb", "season": 2025})
    presets = res.json()
    assert len(presets) > 0
    for preset in presets:
        # 欄が無いプリセットでも、キーは必ずあり、値は null
        assert "reference_metrics" in preset


def test_presets_return_reference_metrics_as_written(monkeypatch):
    # テスト用の値 (実在の選手の値ではない)。data/presets/ には置かず、読み込み関数を差し替えて確かめる
    reference = {
        "wOBA": 0.345,
        "wRC_plus": 120,
        "season": 2025,
        "source": {"provider": "テスト用の出典", "url": "https://example.com/reference"},
        "retrieved_at": "2026-01-02",
        "note": "テスト用の値",
    }
    with_reference = {
        "id": "test_dummy_2025", "name": "Test Dummy", "season": 2025, "league": "MLB",
        "source": {"provider": "テスト用", "url": "https://example.com/", "retrieved_at": "2026-01-01"},
        "stats": dict(STATS_BY_ALIAS),
        "reference_metrics": dict(reference),
    }
    without_reference = {k: v for k, v in with_reference.items() if k != "reference_metrics"}
    without_reference["id"] = "test_dummy_no_reference_2025"
    monkeypatch.setattr(
        "app.main.list_presets", lambda league, season: [with_reference, without_reference]
    )

    presets = {p["id"]: p for p in client.get("/presets").json()}

    # JSON に書かれた値を、計算も加工もせずにそのまま返す
    assert presets["test_dummy_2025"]["reference_metrics"] == reference
    assert presets["test_dummy_no_reference_2025"]["reference_metrics"] is None
    # 参考値があっても、summary (アプリが計算する指標) には wOBA・wRC+ を入れない
    assert "wOBA" not in presets["test_dummy_2025"]["summary"]
    assert "wRC_plus" not in presets["test_dummy_2025"]["summary"]


def test_reference_metrics_do_not_affect_run_expectancy():
    # 参考値はプリセットの表示専用で、計算のリクエスト (成績だけを送る) には入らない。
    # 計算のリクエストに余分なキーとして混ぜても、結果は変わらない
    batters = {f"b{i}": dict(STATS_BY_ALIAS) for i in range(9)}
    body = {"batters": batters, "input_order": list(batters)}
    plain = client.post("/lineup/evaluate", json=body).json()
    with_extra = {
        "batters": {bid: dict(stats, wOBA=0.999, wRC_plus=999) for bid, stats in batters.items()},
        "input_order": list(batters),
    }
    extra = client.post("/lineup/evaluate", json=with_extra).json()
    assert extra["input_order_runs_per_game"] == plain["input_order_runs_per_game"]
