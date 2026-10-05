from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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
