import numpy as np
import pytest

from app.core.states import NUM_TRANSIENT_STATES
from app.core.transitions import build_batter_transition

SAMPLE_EVENT_PROBS = {
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


def test_event_probs_sum_to_one():
    assert sum(SAMPLE_EVENT_PROBS.values()) == pytest.approx(1.0, abs=1e-9)


def test_transition_rows_sum_to_one():
    T, _reward = build_batter_transition(SAMPLE_EVENT_PROBS)
    for i in range(NUM_TRANSIENT_STATES):
        row_sum = T[i].sum()
        assert row_sum == pytest.approx(1.0, abs=1e-9), f"state {i} row sum = {row_sum}"


def test_reward_non_negative():
    _T, reward = build_batter_transition(SAMPLE_EVENT_PROBS)
    assert np.all(reward >= 0)
