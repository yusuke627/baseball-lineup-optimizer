import numpy as np

from app.core.markov import expected_runs_per_game
from app.core.metrics import BasicStats, steal_probabilities
from app.core.monte_carlo import estimate_expected_runs
from app.core.optimizer import evaluate_lineup
from app.core.transitions import build_steal_transition

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

NO_STEAL = {"sb_prob": 0.0, "cs_prob_given_attempt": 0.0}


def _lineup():
    return [dict(BASE_PROBS) for _ in range(9)]


def test_steal_probabilities_use_times_on_first_as_opportunities():
    # 単打 100 + 四球 40 + 死球 10 = 150 回の盗塁機会、企図 30 (成功 24, 失敗 6)
    s = BasicStats(PA=600, AB=540, H=150, doubles=30, triples=5, HR=15, BB=40, HBP=10,
                   SO=100, SF=5, SB=24, CS=6)
    probs = steal_probabilities(s)
    assert abs(probs["sb_prob"] - 30 / 150) < 1e-12
    assert abs(probs["cs_prob_given_attempt"] - 6 / 30) < 1e-12


def test_steal_transition_rows_sum_to_one():
    S = build_steal_transition(0.3, 0.25)
    assert np.allclose(S.sum(axis=1), 1.0)


def test_zero_steal_probs_match_no_steal_model():
    lineup = _lineup()
    without = expected_runs_per_game(lineup)
    with_zero = expected_runs_per_game(lineup, steal_probs=[NO_STEAL] * 9)
    assert abs(without - with_zero) < 1e-12


def test_always_successful_steals_increase_runs():
    lineup = _lineup()
    base = expected_runs_per_game(lineup)
    steals = [{"sb_prob": 0.3, "cs_prob_given_attempt": 0.0}] * 9
    assert expected_runs_per_game(lineup, steal_probs=steals) > base


def test_always_caught_stealing_decreases_runs():
    lineup = _lineup()
    base = expected_runs_per_game(lineup)
    steals = [{"sb_prob": 0.3, "cs_prob_given_attempt": 1.0}] * 9
    assert expected_runs_per_game(lineup, steal_probs=steals) < base


def test_markov_and_monte_carlo_agree_with_steals():
    # 9人とも同じ盗塁確率なら、案Aの「直前の打者を一塁走者とみなす」近似は誤差を生まない
    lineup = _lineup()
    steals = [{"sb_prob": 0.2, "cs_prob_given_attempt": 0.3}] * 9
    exact = expected_runs_per_game(lineup, steal_probs=steals)
    mc_mean = estimate_expected_runs(lineup, steal_probs=steals, n_trials=30000, seed=42)["mean"]
    assert abs(mc_mean - exact) / exact < 0.03, f"exact={exact:.4f}, mc_mean={mc_mean:.4f}"


def test_evaluate_lineup_maps_steals_by_batter_id():
    batters = {f"b{i}": dict(BASE_PROBS) for i in range(9)}
    order = [f"b{i}" for i in range(9)]
    steals = {bid: dict(NO_STEAL) for bid in batters}
    steals["b0"] = {"sb_prob": 0.5, "cs_prob_given_attempt": 1.0}  # b0だけ常に盗塁死

    runs = evaluate_lineup(batters, order, steals)
    # b0の直後(打者index 1)の打席前にだけb0の盗塁確率が適用されることを、打順リストで直接計算した値と比較
    expected_steals = [steals[bid] for bid in order]
    assert abs(runs - expected_runs_per_game(list(batters.values()), steal_probs=expected_steals)) < 1e-12
    assert runs < evaluate_lineup(batters, order)
