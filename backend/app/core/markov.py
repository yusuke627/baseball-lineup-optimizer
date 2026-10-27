"""
案A: マルコフ連鎖（吸収連鎖）による厳密な得点期待値計算。

設計方針 (docs/DESIGN.md 3-5):
  1. 打者ごとに 25x25 の1打席遷移行列 T_k と 報酬ベクトル reward_k を作る
  2. (base_out_state 0-23, 打者index 1-9) の 216 状態からなる
     「1イニング分」の吸収マルコフ連鎖を組み、
       - 状態(0/0アウト, k)から吸収されるまでの期待得点 V[k]
       - 吸収時に次の先頭打者が j になる確率 M[k][j]
     を基本行列 N=(I-Q)^-1 で厳密に求める (必要な9行だけを線形方程式で解く)
  3. 9イニング分、先頭打者の分布を M で遷移させながら V を足し合わせることで
     1試合(9イニング)の期待得点を求める

これによりイニングをまたいで打順が継続する(イニングごとに1番打者へ戻らない)
という実際のルールを正しく反映する。
"""
from __future__ import annotations

import numpy as np

from .states import NUM_TRANSIENT_STATES, TERMINAL_STATE
from .transitions import build_batter_transition, build_steal_transition

NUM_BATTERS = 9


def _half_inning_chain(
    batter_transitions: list[np.ndarray],
    batter_rewards: list[np.ndarray],
    steal_transitions: list[np.ndarray] | None = None,
):
    """
    1イニング分の合成状態 (base_out 0-23, batter 0-8) からなる
    吸収マルコフ連鎖を構築し、以下を返す:
      V: shape (9,)  各打者が先頭に立った場合の、そのイニングの期待得点
      M: shape (9,9) 先頭打者kのとき、次のイニングの先頭打者がjになる確率

    steal_transitions[k] は打者kの打席「前」に挟む盗塁ステップの遷移行列 (25x25)。
    盗塁死で3アウトになった場合、打者kは打席を完了していないため次イニングの先頭は打者kになる。
    """
    n_transient = NUM_TRANSIENT_STATES * NUM_BATTERS  # 24 * 9 = 216
    Q = np.zeros((n_transient, n_transient))
    R_absorb = np.zeros((n_transient, NUM_BATTERS))  # 吸収時にどの打者が次の先頭になるか
    reward_vec = np.zeros(n_transient)
    # 合成状態 (bo, batter) の番号は bo * 9 + batter (bo: 0-23, batter: 0-8)。
    # 最適打順の探索で何度も呼ばれるため、Python のループではなく、打者ごとのブロックを配列の操作で置く
    base_outs = np.arange(NUM_TRANSIENT_STATES)

    for batter in range(NUM_BATTERS):
        T = batter_transitions[batter]
        reward = batter_rewards[batter]
        next_batter = (batter + 1) % NUM_BATTERS
        rows = base_outs * NUM_BATTERS + batter
        if steal_transitions is not None:
            S = steal_transitions[batter]
            S_transient = S[:NUM_TRANSIENT_STATES, :NUM_TRANSIENT_STATES]
            # 盗塁ステップ → 打席 の順に合成する (盗塁自体では得点は入らない)
            T = S_transient @ T[:NUM_TRANSIENT_STATES, :]
            reward = S_transient @ reward
            R_absorb[rows, batter] += S[:NUM_TRANSIENT_STATES, TERMINAL_STATE]
        reward_vec[rows] = reward[:NUM_TRANSIENT_STATES]
        # 3アウトにならない遷移は、次の打者の合成状態へ。3アウトの遷移は、次のイニングの先頭が次の打者になる
        Q[np.ix_(rows, base_outs * NUM_BATTERS + next_batter)] = T[:NUM_TRANSIENT_STATES, :NUM_TRANSIENT_STATES]
        R_absorb[rows, next_batter] += T[:NUM_TRANSIENT_STATES, TERMINAL_STATE]

    # 基本行列 N = (I-Q)^-1 のうち、各打者が先頭 (走者なし・0アウト。番号は 0 * 9 + batter) の9行だけを使う。
    # 逆行列を全部求める代わりに、N[s, :] = e_s^T (I-Q)^-1 を (I-Q)^T x = e_s の線形方程式で解く
    starts = np.arange(NUM_BATTERS)
    rhs = np.zeros((n_transient, NUM_BATTERS))
    rhs[starts, starts] = 1.0
    N_rows = np.linalg.solve((np.eye(n_transient) - Q).T, rhs).T  # (9, 216)
    V = N_rows @ reward_vec   # (9,)
    M = N_rows @ R_absorb     # (9, 9)
    return V, M


def expected_runs_per_game(
    lineup_event_probs: list[dict],
    innings: int = 9,
    adv: dict | None = None,
    steal_probs: list[dict] | None = None,
) -> float:
    """
    打順(9人分のイベント確率のリスト、1番から9番の順)から
    1試合(デフォルト9イニング)の期待得点を計算する。

    steal_probs (打順順、metrics.steal_probabilities の戻り値) を渡すと盗塁を反映する。
    案Aは走者個人を状態に持たないため、打者kの打席前の一塁走者は
    「直前の打者 k-1」とみなして、その打者の盗塁確率を使う近似を行う (docs/DESIGN.md 3-4)。
    steal_probs が None なら盗塁なし (従来と同一の厳密計算)。
    """
    if len(lineup_event_probs) != NUM_BATTERS:
        raise ValueError("lineup must contain exactly 9 batters")
    if steal_probs is not None and len(steal_probs) != NUM_BATTERS:
        raise ValueError("steal_probs must contain exactly 9 entries")

    batter_transitions = []
    batter_rewards = []
    for probs in lineup_event_probs:
        T, reward = build_batter_transition(probs, adv)
        batter_transitions.append(T)
        batter_rewards.append(reward)

    steal_transitions = None
    if steal_probs is not None:
        steal_transitions = []
        for batter in range(NUM_BATTERS):
            runner = steal_probs[(batter - 1) % NUM_BATTERS]
            steal_transitions.append(
                build_steal_transition(runner["sb_prob"], runner["cs_prob_given_attempt"])
            )

    V, M = _half_inning_chain(batter_transitions, batter_rewards, steal_transitions)

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
