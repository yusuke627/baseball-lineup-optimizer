import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.batter import MAX_STAT_VALUE, BatterCountStats, stats_warnings

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CASES_PATH = REPO_ROOT / "schemas" / "batter_stats_validation_cases.json"
PRESET_DIR = REPO_ROOT / "data" / "presets"

with open(CASES_PATH, encoding="utf-8") as f:
    CASES_FILE = json.load(f)

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
    assert bool(stats_warnings("b0", model)) == case["warning"]


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


@pytest.mark.parametrize("league", ["../..", "MLB", "mlb/2025", ""])
def test_presets_rejects_invalid_league(league):
    res = client.get("/presets", params={"league": league, "season": 2025})
    assert res.status_code == 422


def test_presets_unknown_league_returns_empty_list():
    res = client.get("/presets", params={"league": "npb", "season": 2025})
    assert res.status_code == 200
    assert res.json() == []
