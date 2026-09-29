"""
案B: モンテカルロシミュレーションによる得点期待値の推定。

案Aと同じ resolve_event ロジックを共有しているため、
試行回数を増やしたときに案Aの厳密値へ収束することを検証に利用できる
(tests/test_ab_convergence.py)。
"""
from __future__ import annotations

import random

import numpy as np

from .states import Bases
from .transitions import DEFAULT_ADVANCE_PROBS, EVENT_KEYS, apply_steal_step, resolve_event

NUM_BATTERS = 9


def _sample_event(event_probs: dict, rng: random.Random) -> str:
    events = list(event_probs.keys())
    weights = list(event_probs.values())
    return rng.choices(events, weights=weights, k=1)[0]


def _apply_branches(branches, rng: random.Random):
    probs = [b.prob for b in branches]
    chosen = rng.choices(branches, weights=probs, k=1)[0]
    return chosen


def simulate_one_game(
    lineup_event_probs: list[dict],
    steal_probs: list[dict] | None = None,
    adv: dict | None = None,
    rng: random.Random | None = None,
) -> int:
    """1試合(9イニング)をシミュレートし、総得点を返す"""
    rng = rng or random.Random()
    adv = adv or DEFAULT_ADVANCE_PROBS
    steal_probs = steal_probs or [{"sb_prob": 0.0, "cs_prob_given_attempt": 0.0} for _ in range(NUM_BATTERS)]

    batter_idx = 0
    total_runs = 0
    for _inning in range(9):
        bases = Bases(False, False, False)
        outs = 0
        while outs < 3:
            # 盗塁ステップ(一塁のみ走者がいる場合のみ対象)
            # 簡略化のため、走者個人を追跡せず「現在打席に立つ打者」の盗塁確率を暫定使用している。
            # 本来は走者(=前の打者)の盗塁能力を使うべきであり、既知の簡略化点として
            # docs/DESIGN.md に追記が必要。
            sp = steal_probs[batter_idx]
            steal_results = apply_steal_step(
                bases.code, outs, sp.get("sb_prob", 0.0), sp.get("cs_prob_given_attempt", 0.0), adv
            )
            new_code, new_outs, _p = _weighted_choice(steal_results, rng)
            bases = Bases.from_code(new_code)
            outs = new_outs
            if outs >= 3:
                break

            event_probs = lineup_event_probs[batter_idx]
            event = _sample_event(event_probs, rng)
            branches = resolve_event(event, bases.code, outs, adv)
            branch = _apply_branches(branches, rng)
            total_runs += branch.runs
            bases = branch.new_bases
            outs = branch.new_outs
            batter_idx = (batter_idx + 1) % NUM_BATTERS
    return total_runs


def _weighted_choice(options, rng: random.Random):
    values = [o for o in options]
    weights = [o[2] for o in options]
    return rng.choices(values, weights=weights, k=1)[0]


def estimate_expected_runs(
    lineup_event_probs: list[dict],
    steal_probs: list[dict] | None = None,
    adv: dict | None = None,
    n_trials: int = 20000,
    seed: int | None = None,
) -> dict:
    """
    N回試行し、1試合あたりの得点の平均・標準偏差・分布の要約を返す。
    """
    rng = random.Random(seed)
    runs_list = [
        simulate_one_game(lineup_event_probs, steal_probs, adv, rng) for _ in range(n_trials)
    ]
    arr = np.array(runs_list)
    return {
        "mean": float(arr.mean()),
        "std": float(arr.std()),
        "min": int(arr.min()),
        "max": int(arr.max()),
        "n_trials": n_trials,
    }
