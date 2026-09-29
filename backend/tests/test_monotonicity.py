import copy

from app.core.markov import expected_runs_per_game

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


def _lineup_of(probs):
    return [dict(probs) for _ in range(9)]


def test_more_home_runs_increase_expected_runs():
    baseline = expected_runs_per_game(_lineup_of(BASE_PROBS))

    boosted = copy.deepcopy(BASE_PROBS)
    delta = 0.05
    boosted["HR"] += delta
    boosted["OUT"] -= delta

    boosted_runs = expected_runs_per_game(_lineup_of(boosted))
    assert boosted_runs > baseline


def test_more_walks_increase_expected_runs():
    baseline = expected_runs_per_game(_lineup_of(BASE_PROBS))

    boosted = copy.deepcopy(BASE_PROBS)
    delta = 0.05
    boosted["BB"] += delta
    boosted["OUT"] -= delta

    boosted_runs = expected_runs_per_game(_lineup_of(boosted))
    assert boosted_runs > baseline


def test_more_strikeouts_decrease_expected_runs():
    baseline = expected_runs_per_game(_lineup_of(BASE_PROBS))

    worsened = copy.deepcopy(BASE_PROBS)
    delta = 0.05
    worsened["SO"] += delta
    worsened["1B"] -= delta

    worsened_runs = expected_runs_per_game(_lineup_of(worsened))
    assert worsened_runs < baseline
