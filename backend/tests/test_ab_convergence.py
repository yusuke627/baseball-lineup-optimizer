from app.core.markov import expected_runs_per_game
from app.core.monte_carlo import estimate_expected_runs

BASE_PROBS = {
    "BB": 0.085,
    "HBP": 0.010,
    "1B": 0.145,
    "2B": 0.043,
    "3B": 0.004,
    "HR": 0.030,
    "SO": 0.225,
    "OUT": 0.429,
    "SF": 0.006,
    "SH": 0.003,
    "GIDP": 0.020,
}


def test_monte_carlo_converges_to_markov_chain():
    lineup = [dict(BASE_PROBS) for _ in range(9)]
    exact = expected_runs_per_game(lineup)

    result = estimate_expected_runs(lineup, n_trials=30000, seed=42)
    mc_mean = result["mean"]

    # 3万試行程度であれば概ね数%以内の誤差に収まることを期待する
    assert abs(mc_mean - exact) / exact < 0.03, (
        f"exact={exact:.4f}, mc_mean={mc_mean:.4f}"
    )
