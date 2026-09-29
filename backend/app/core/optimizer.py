"""
全打順探索(9! = 362,880通り)による最適打順の探索。

計算量の観点から、探索には案A(マルコフ連鎖、行列演算のみで高速)を使用する。
docs/DESIGN.md 9章「使い分けの推奨」を参照。

【パフォーマンス上の既知の課題】
1打順あたりの計算は約0.01秒程度だが、362,880通りを愚直に全探索すると
概算で1時間程度かかる。API経由での同期的なリアルタイム応答には不向きなため、
実運用では以下のいずれかの対応が必要になる(docs/DESIGN.md に追記予定):
  - バックグラウンドジョブ化し、ポーリング/WebSocketで結果を返す
  - numpyでの一括ベクトル化によるさらなる高速化
  - 山登り法・焼きなまし法等のヒューリスティック探索による近似解の高速算出
    (厳密解ではなくなる点はREADMEに明記する)
"""
from __future__ import annotations

import itertools
import random

from .markov import expected_runs_per_game


def find_optimal_lineup(batters: dict[str, dict]) -> dict:
    """
    batters: {batter_id: event_probs} の9人分の辞書。
    戻り値: {"best_order": [...], "best_runs": float,
             "input_order_runs": float (呼び出し側で別途計算する想定のためここでは含めない)}
    """
    ids = list(batters.keys())
    if len(ids) != 9:
        raise ValueError("exactly 9 batters are required")

    best_order = None
    best_runs = -1.0
    for order in itertools.permutations(ids):
        lineup = [batters[i] for i in order]
        runs = expected_runs_per_game(lineup)
        if runs > best_runs:
            best_runs = runs
            best_order = order
    return {"best_order": list(best_order), "best_runs": best_runs}


def evaluate_lineup(batters: dict[str, dict], order: list[str]) -> float:
    lineup = [batters[i] for i in order]
    return expected_runs_per_game(lineup)


def inefficiency_percent(input_runs: float, best_runs: float) -> float:
    if best_runs == 0:
        return 0.0
    return (best_runs - input_runs) / best_runs * 100


def hill_climb_lineup(batters: dict[str, dict], start_order: list[str] | None = None, max_iterations: int = 200) -> dict:
    """
    全探索(362,880通り)が重すぎる場合の近似解を高速に求めるヒューリスティック。
    2人の打順を入れ替える近傍探索を、改善が見られなくなるまで繰り返す(山登り法)。
    厳密な最適解を保証するものではない点に注意(README上に明記すること)。
    """
    ids = list(batters.keys())
    if len(ids) != 9:
        raise ValueError("exactly 9 batters are required")

    order = list(start_order) if start_order else list(ids)
    best_runs = evaluate_lineup(batters, order)

    for _ in range(max_iterations):
        improved = False
        for i, j in itertools.combinations(range(9), 2):
            candidate = order.copy()
            candidate[i], candidate[j] = candidate[j], candidate[i]
            runs = evaluate_lineup(batters, candidate)
            if runs > best_runs:
                order, best_runs = candidate, runs
                improved = True
        if not improved:
            break

    return {"best_order": order, "best_runs": best_runs, "method": "hill_climb (approximate)"}


def multi_restart_hill_climb(
    batters: dict[str, dict],
    start_order: list[str] | None = None,
    min_restarts: int = 10,
    max_restarts: int = 50,
    patience: int = 10,
    rng: random.Random | None = None,
) -> dict:
    """
    複数回のランダム再スタートで山登り法を行い、局所最適解に捕まるリスクを下げる。

    適応的停止ルール:
      - 最低 min_restarts 回は必ず試行する
      - 連続 patience 回、最良値が更新されなければ打ち切る
      - ただし最大でも max_restarts 回で打ち切る

    1回目の試行は、指定があれば start_order（ユーザーが入力した打順）から、
    2回目以降はランダムな初期打順から開始する。
    """
    ids = list(batters.keys())
    if len(ids) != 9:
        raise ValueError("exactly 9 batters are required")
    rng = rng or random.Random()

    best_order = None
    best_runs = -1.0
    no_improve_streak = 0
    n_restarts = 0

    first_start = list(start_order) if start_order else list(ids)

    while n_restarts < max_restarts:
        if n_restarts == 0:
            init = first_start
        else:
            init = ids.copy()
            rng.shuffle(init)

        result = hill_climb_lineup(batters, start_order=init)
        n_restarts += 1

        if result["best_runs"] > best_runs:
            best_runs = result["best_runs"]
            best_order = result["best_order"]
            no_improve_streak = 0
        else:
            no_improve_streak += 1

        if n_restarts >= min_restarts and no_improve_streak >= patience:
            break

    return {
        "best_order": best_order,
        "best_runs": best_runs,
        "method": "multi_restart_hill_climb (approximate)",
        "n_restarts": n_restarts,
    }
