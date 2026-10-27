"""
計算を軽くした変更のテスト。
- 案Aの1イニングの連鎖 (markov._half_inning_chain) を、配列の操作と線形方程式で求める形にした。
  元の形 (Python のループで組み、逆行列を求める) をこのファイルに基準として残し、結果が許容誤差 1e-12 以内で一致することを確かめる
- 推奨打順の探索 (optimizer.multi_restart_hill_climb) で、同じ打順の評価を使い回す。乱数のシードを固定すると、
  元の実装 (使い回さない＋元の連鎖) と同じ推奨打順になることを確かめる
- 案Bの試行回数を、環境変数 MONTE_CARLO_TRIALS で変えられる (未設定なら 5000、不正な値は起動時にエラー)
"""
import json
import os
import random
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app.core.markov as markov
import app.core.optimizer as optimizer
import app.main as main
from app.core.markov import expected_runs_per_game
from app.core.metrics import BasicStats, event_probabilities, steal_probabilities
from app.core.states import NUM_TRANSIENT_STATES, TERMINAL_STATE

PRESET_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "presets" / "mlb" / "2025"
BACKEND_DIR = Path(__file__).resolve().parent.parent
TOL = 1e-12


def reference_half_inning_chain(batter_transitions, batter_rewards, steal_transitions=None):
    """元の形の1イニングの連鎖 (Python のループで Q を組み、逆行列を求める)。テストの基準として残す"""
    n_batters = 9
    n_transient = NUM_TRANSIENT_STATES * n_batters
    Q = np.zeros((n_transient, n_transient))
    R_absorb = np.zeros((n_transient, n_batters))
    reward_vec = np.zeros(n_transient)

    def idx(bo, batter):
        return bo * n_batters + batter

    for batter in range(n_batters):
        T = batter_transitions[batter]
        reward = batter_rewards[batter]
        next_batter = (batter + 1) % n_batters
        if steal_transitions is not None:
            S = steal_transitions[batter]
            S_transient = S[:NUM_TRANSIENT_STATES, :NUM_TRANSIENT_STATES]
            T = S_transient @ T[:NUM_TRANSIENT_STATES, :]
            reward = S_transient @ reward
            for bo in range(NUM_TRANSIENT_STATES):
                R_absorb[idx(bo, batter), batter] += S[bo, TERMINAL_STATE]
        for bo in range(NUM_TRANSIENT_STATES):
            i = idx(bo, batter)
            reward_vec[i] = reward[bo]
            for j_state in range(NUM_TRANSIENT_STATES + 1):
                p = T[bo, j_state]
                if p == 0:
                    continue
                if j_state == TERMINAL_STATE:
                    R_absorb[i, next_batter] += p
                else:
                    Q[i, idx(j_state, next_batter)] += p

    N = np.linalg.inv(np.eye(n_transient) - Q)
    expected = N @ reward_vec
    next_dist = N @ R_absorb
    V = np.array([expected[idx(0, b)] for b in range(n_batters)])
    M = np.array([next_dist[idx(0, b)] for b in range(n_batters)])
    return V, M


def _players(seed):
    """選手データから9人 (seed 0 は Judge・Arraez を含む)。(イベント確率, 盗塁確率) のリスト"""
    ids = sorted(p.stem for p in PRESET_DIR.glob("*.json"))
    if seed == 0:
        rest = [i for i in ids if i not in ("aaron_judge_2025", "luis_arraez_2025")]
        chosen = ["aaron_judge_2025", "luis_arraez_2025"] + random.Random(1).sample(rest, 7)
    else:
        chosen = random.Random(seed).sample(ids, 9)
    players = []
    for pid in chosen:
        s = json.loads((PRESET_DIR / f"{pid}.json").read_text(encoding="utf-8"))["stats"]
        bs = BasicStats(PA=s["PA"], AB=s["AB"], H=s["H"], doubles=s["2B"], triples=s["3B"], HR=s["HR"], BB=s["BB"],
                        HBP=s["HBP"], SO=s["SO"], SF=s["SF"], SH=s["SH"], GIDP=s["GIDP"], SB=s["SB"], CS=s["CS"])
        players.append((event_probabilities(bs), steal_probabilities(bs)))
    return players


@pytest.mark.parametrize("seed", [0, 1, 2, 3, 4, 5])
@pytest.mark.parametrize("with_steals", [False, True])
def test_fast_chain_matches_reference_within_tolerance(monkeypatch, seed, with_steals):
    players = _players(seed)
    rng = random.Random(seed)
    for _ in range(10):
        rng.shuffle(players)
        lineup = [p[0] for p in players]
        steals = [p[1] for p in players] if with_steals else None
        fast = expected_runs_per_game(lineup, steal_probs=steals)
        with monkeypatch.context() as m:
            m.setattr(markov, "_half_inning_chain", reference_half_inning_chain)
            ref = expected_runs_per_game(lineup, steal_probs=steals)
        assert abs(fast - ref) <= TOL


def test_fast_chain_returns_the_same_v_and_m_as_reference():
    players = _players(0)
    T, R = zip(*[markov.build_batter_transition(p[0]) for p in players], strict=True)
    S = [markov.build_steal_transition(p[1]["sb_prob"], p[1]["cs_prob_given_attempt"]) for p in players]
    for steals in (None, S):
        V, M = markov._half_inning_chain(list(T), list(R), steals)
        V_ref, M_ref = reference_half_inning_chain(list(T), list(R), steals)
        assert np.max(np.abs(V - V_ref)) <= TOL
        assert np.max(np.abs(M - M_ref)) <= TOL


@pytest.mark.parametrize("seed", [0, 3, 7])
def test_search_with_fixed_seed_gives_the_same_lineup_as_the_original_implementation(monkeypatch, seed):
    players = _players(seed)
    batters = {f"b{i}": p[0] for i, p in enumerate(players)}
    steals = {f"b{i}": p[1] for i, p in enumerate(players)}
    order = list(batters)
    now = optimizer.multi_restart_hill_climb(batters, start_order=order, steals=steals, rng=random.Random(2025))
    with monkeypatch.context() as m:
        # 元の実装：同じ打順の評価を使い回さず、元の形の連鎖で計算する
        m.setattr(optimizer, "_evaluate_cached", lambda b, o, s, cache: optimizer.evaluate_lineup(b, o, s))
        m.setattr(markov, "_half_inning_chain", reference_half_inning_chain)
        original = optimizer.multi_restart_hill_climb(batters, start_order=order, steals=steals, rng=random.Random(2025))
    assert now["best_order"] == original["best_order"]
    assert now["n_restarts"] == original["n_restarts"]
    assert abs(now["best_runs"] - original["best_runs"]) <= TOL


def test_search_reuses_evaluations_of_the_same_order(monkeypatch):
    players = _players(0)
    batters = {f"b{i}": p[0] for i, p in enumerate(players)}
    steals = {f"b{i}": p[1] for i, p in enumerate(players)}
    calls = []
    original = optimizer.evaluate_lineup

    def counting(b, order, s=None):
        calls.append(tuple(order))
        return original(b, order, s)
    monkeypatch.setattr(optimizer, "evaluate_lineup", counting)
    optimizer.multi_restart_hill_climb(batters, start_order=list(batters), steals=steals, rng=random.Random(2025))
    # 使い回すので、同じ打順は1回しか計算しない
    assert len(calls) == len(set(calls))


def test_monte_carlo_trials_default_and_setting():
    env = main.MONTE_CARLO_TRIALS_ENV
    assert main.monte_carlo_trials_from_env({}) == 5000
    assert main.monte_carlo_trials_from_env({env: ""}) == 5000
    assert main.monte_carlo_trials_from_env({env: "1000"}) == 1000
    assert main.monte_carlo_trials_from_env({env: " 2000 "}) == 2000
    assert main.monte_carlo_trials_from_env({env: "1"}) == 1


@pytest.mark.parametrize("value", ["0", "-5", "abc", "1.5", "1e3"])
def test_invalid_monte_carlo_trials_is_an_error(value):
    with pytest.raises(ValueError, match="MONTE_CARLO_TRIALS"):
        main.monte_carlo_trials_from_env({main.MONTE_CARLO_TRIALS_ENV: value})


def test_invalid_monte_carlo_trials_stops_the_app_at_startup():
    # エラーの文は日本語を含むので、子プロセスの出力を UTF-8 にそろえて読む (Windows の既定の文字コードに依存しない)
    env = {**os.environ, main.MONTE_CARLO_TRIALS_ENV: "0", "PYTHONIOENCODING": "utf-8"}
    res = subprocess.run([sys.executable, "-c", "import app.main"], cwd=BACKEND_DIR, env=env,
                         capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    assert res.returncode != 0
    assert "MONTE_CARLO_TRIALS" in res.stderr


def test_api_uses_the_configured_number_of_trials(monkeypatch):
    monkeypatch.setattr(main, "MONTE_CARLO_TRIALS", 200)
    stats = {"PA": 600, "AB": 540, "H": 150, "2B": 30, "3B": 5, "HR": 15, "BB": 40, "HBP": 10,
             "SO": 100, "SF": 5, "SH": 5, "GIDP": 10, "SB": 10, "CS": 3}
    body = {"batters": {f"b{i}": stats for i in range(9)}, "input_order": [f"b{i}" for i in range(9)]}
    res = TestClient(main.app).post("/lineup/evaluate", json=body)
    assert res.status_code == 200
    # 試行回数はレスポンスの monte_carlo.n_trials に入る (画面はこの値を表示する)
    assert res.json()["monte_carlo"]["n_trials"] == 200


def test_default_number_of_trials_when_not_set():
    if os.environ.get(main.MONTE_CARLO_TRIALS_ENV, "").strip() == "":
        assert main.MONTE_CARLO_TRIALS == 5000
