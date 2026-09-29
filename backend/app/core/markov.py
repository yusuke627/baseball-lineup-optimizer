"""
案A: マルコフ連鎖（吸収連鎖）による厳密な得点期待値計算。

設計方針 (docs/DESIGN.md 9章):
  1. 打者ごとに 25x25 の1打席遷移行列 T_k と 報酬ベクトル reward_k を作る
  2. (base_out_state 0-23, 打者index 1-9) の 216 状態からなる
     「1イニング分」の吸収マルコフ連鎖を組み、
       - 状態(0/0アウト, k)から吸収されるまでの期待得点 V[k]
       - 吸収時に次の先頭打者が j になる確率 M[k][j]
     を基本行列 N=(I-Q)^-1 で厳密に求める
  3. 9イニング分、先頭打者の分布を M で遷移させながら V を足し合わせることで
     1試合(9イニング)の期待得点を求める

これによりイニングをまたいで打順が継続する(イニングごとに1番打者へ戻らない)
という実際のルールを正しく反映する。
"""
from __future__ import annotations

import numpy as np

from .states import NUM_TRANSIENT_STATES, TERMINAL_STATE, base_out_index
from .transitions import build_batter_transition

NUM_BATTERS = 9


def _half_inning_chain(batter_transitions: list[np.ndarray], batter_rewards: list[np.ndarray]):
    """
    1イニング分の合成状態 (base_out 0-23, batter 0-8) からなる
    吸収マルコフ連鎖を構築し、以下を返す:
      V: shape (9,)  各打者が先頭に立った場合の、そのイニングの期待得点
      M: shape (9,9) 先頭打者kのとき、次のイニングの先頭打者がjになる確率
    """
    n_transient = NUM_TRANSIENT_STATES * NUM_BATTERS  # 24 * 9 = 216
    Q = np.zeros((n_transient, n_transient))
    R_absorb = np.zeros((n_transient, NUM_BATTERS))  # 吸収時にどの打者が次の先頭になるか
    reward_vec = np.zeros(n_transient)

    def idx(bo: int, batter: int) -> int:
        # bo: 0-23, batter: 0-8 (0-indexed)
        return bo * NUM_BATTERS + batter

    for batter in range(NUM_BATTERS):
        T = batter_transitions[batter]
        reward = batter_rewards[batter]
        next_batter = (batter + 1) % NUM_BATTERS
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

    I = np.eye(n_transient)
    N = np.linalg.inv(I - Q)
    expected_reward_from_state = N @ reward_vec          # (216,)
    next_batter_dist_from_state = N @ R_absorb            # (216, 9)

    V = np.zeros(NUM_BATTERS)
    M = np.zeros((NUM_BATTERS, NUM_BATTERS))
    for batter in range(NUM_BATTERS):
        start_idx = idx(0, batter)  # base_out=0 は (走者なし, 0アウト)
        V[batter] = expected_reward_from_state[start_idx]
        M[batter] = next_batter_dist_from_state[start_idx]
    return V, M


def expected_runs_per_game(lineup_event_probs: list[dict], innings: int = 9, adv: dict | None = None) -> float:
    """
    打順(9人分のイベント確率のリスト、1番から9番の順)から
    1試合(デフォルト9イニング)の期待得点を厳密計算する。
    """
    if len(lineup_event_probs) != NUM_BATTERS:
        raise ValueError("lineup must contain exactly 9 batters")

    batter_transitions = []
    batter_rewards = []
    for probs in lineup_event_probs:
        T, reward = build_batter_transition(probs, adv)
        batter_transitions.append(T)
        batter_rewards.append(reward)

    V, M = _half_inning_chain(batter_transitions, batter_rewards)

    dist = np.zeros(NUM_BATTERS)
    dist[0] = 1.0  # 1回表は必ず1番打者から
    total_runs = 0.0
    for _ in range(innings):
        total_runs += float(dist @ V)
        dist = dist @ M
    return total_runs


def expected_runs_for_all_orders(batters_event_probs: dict[str, dict], adv: dict | None = None):
    """
    与えられた9人 (id -> event_probs) について、全9!通りの打順の期待得点を計算し、
    (打順のidタプル, 期待得点) のリストを期待得点降順で返す。
    """
    import itertools

    ids = list(batters_event_probs.keys())
    if len(ids) != NUM_BATTERS:
        raise ValueError("exactly 9 batters are required")

    results = []
    for order in itertools.permutations(ids):
        lineup = [batters_event_probs[i] for i in order]
        runs = expected_runs_per_game(lineup, adv=adv)
        results.append((order, runs))
    results.sort(key=lambda x: x[1], reverse=True)
    return results
