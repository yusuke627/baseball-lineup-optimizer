import random

from app.core.optimizer import evaluate_lineup, multi_restart_hill_climb

BASE_PROBS = {
    "BB": 0.085, "HBP": 0.010, "1B": 0.145, "2B": 0.043, "3B": 0.004,
    "HR": 0.030, "SO": 0.225, "OUT": 0.429, "SF": 0.006, "SH": 0.003, "GIDP": 0.020,
}


def _diverse_batters():
    rng = random.Random(7)
    batters = {}
    for i in range(9):
        p = dict(BASE_PROBS)
        p["HR"] = max(0.005, p["HR"] + rng.uniform(-0.02, 0.03))
        p["1B"] = max(0.05, p["1B"] + rng.uniform(-0.03, 0.03))
        p["OUT"] = max(0.05, p["OUT"] + rng.uniform(-0.03, 0.03))
        total = sum(p.values())
        batters[f"p{i}"] = {k: v / total for k, v in p.items()}
    return batters


def test_respects_min_restarts():
    batters = _diverse_batters()
    # patience=0だと理論上は初回のno_improve_streak>=patience(0)が即成立しうるが、
    # min_restartsが優先されることを確認する
    result = multi_restart_hill_climb(batters, min_restarts=10, max_restarts=50, patience=0, rng=random.Random(1))
    assert result["n_restarts"] >= 10


def test_respects_max_restarts_cap():
    batters = _diverse_batters()
    result = multi_restart_hill_climb(batters, min_restarts=10, max_restarts=15, patience=1000, rng=random.Random(1))
    assert result["n_restarts"] <= 15


def test_result_is_at_least_as_good_as_single_hill_climb_from_input_order():
    batters = _diverse_batters()
    order = list(batters.keys())
    single = evaluate_lineup(batters, order)
    result = multi_restart_hill_climb(batters, start_order=order, rng=random.Random(3))
    assert result["best_runs"] >= single
