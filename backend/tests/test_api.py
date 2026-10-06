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
    for key in ("OBP", "SLG", "wOBA", "wRC_plus"):
        assert key in judge
