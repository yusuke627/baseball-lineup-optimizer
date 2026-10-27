"""
打撃イベント別の遷移ルール (resolve_event) と、
打者1人分の「1打席あたりの状態遷移行列 T」「報酬ベクトル reward」の構築。

設計 (docs/DESIGN.md) の 3章「計算モデル」に対応する実装。
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from .states import (
    NUM_TRANSIENT_STATES,
    TERMINAL_STATE,
    Bases,
    base_out_index,
    decode_base_out_index,
    outs_bucket,
)

# デフォルトの進塁確率（出典: James Click, Baseball Prospectus, 2004年掲載の記事（2003年シーズンの数値））。
# 打者データ年度(2025年)とは異なる年度の値を暫定使用している点に注意。
# docs/DESIGN.md 10章「モデル全般の限界」を参照。
DEFAULT_ADVANCE_PROBS = {
    # 単打で一塁走者が三塁まで進む確率
    "first_to_third_on_single": {"less_than_two_outs": 0.251, "two_outs": 0.306},
    # 単打で二塁走者が生還する確率
    "second_scores_on_single": {"less_than_two_outs": 0.492, "two_outs": 0.755},
    # 二塁打で一塁走者が生還する確率
    "first_scores_on_double": {"less_than_two_outs": 0.367, "two_outs": 0.561},
}


@dataclass
class Branch:
    """1つのイベントが分岐しうる遷移先の1つ"""
    new_bases: Bases
    new_outs: int
    runs: int
    prob: float  # このイベントが起きた「条件下」での分岐確率


def _walk_advance(bases: Bases) -> tuple[Bases, int]:
    """四球・死球の強制進塁ロジック"""
    runs = 0
    on1, on2, on3 = True, bases.on2, bases.on3
    if bases.on1:
        if bases.on2:
            on3 = True
            if bases.on3:
                runs = 1
            on2 = True
        else:
            on2 = True
            on3 = bases.on3
    return Bases(on1=on1, on2=on2, on3=on3), runs


def _single_branches(bases: Bases, outs: int, adv: dict) -> list[tuple[Bases, int, float]]:
    """単打の分岐 (走者配置, 得点, 条件付き確率) のリストを返す"""
    bucket = outs_bucket(outs)
    branches: list[tuple[Bases, int, float]] = []

    # 走者がいない塁は分岐しない (確率1.0の選択肢1つ)
    case2_options: list[tuple[bool | None, float]] = [(None, 1.0)]
    case1_options: list[tuple[bool | None, float]] = [(None, 1.0)]
    if bases.on2:
        # runner on 2nd: scores or stops at 3rd (依存: 2アウト有無)
        p2_scores: float = adv["second_scores_on_single"][bucket]
        case2_options = [(True, p2_scores), (False, 1 - p2_scores)]
    if bases.on1:
        # runner on 1st: advances to 3rd or stops at 2nd
        p1_to_3: float = adv["first_to_third_on_single"][bucket]
        case1_options = [(True, p1_to_3), (False, 1 - p1_to_3)]

    on3_scores = bases.on3  # 三塁走者は単打で常に生還する前提

    for r2_scores, p2 in case2_options:
        # 後ろの走者は、前の走者の塁を超えず、同じ塁にも重ならない。
        # 二塁走者が三塁で止まったときは、一塁走者は二塁まで (二塁走者が生還したときは、独立に三塁まで進める)
        r1_options = case1_options
        if bases.on1 and bases.on2 and r2_scores is False:
            r1_options = [(False, 1.0)]
        for r1_to_3, p1 in r1_options:
            prob = p2 * p1
            runs = 1 if on3_scores else 0  # 打者自身は生還しない
            new_on3 = False
            new_on2 = False
            if bases.on2:
                if r2_scores:
                    runs += 1
                else:
                    new_on3 = True
            if bases.on1:
                if r1_to_3:
                    new_on3 = True
                else:
                    new_on2 = True
            new_bases = Bases(on1=True, on2=new_on2, on3=new_on3)
            branches.append((new_bases, runs, prob))
    return branches


def _double_branches(bases: Bases, outs: int, adv: dict) -> list[tuple[Bases, int, float]]:
    bucket = outs_bucket(outs)
    runs = (1 if bases.on2 else 0) + (1 if bases.on3 else 0)
    if not bases.on1:
        return [(Bases(on1=False, on2=True, on3=False), runs, 1.0)]

    p1_scores = adv["first_scores_on_double"][bucket]
    scores_branch = Bases(on1=False, on2=True, on3=False)
    stays_branch = Bases(on1=False, on2=True, on3=True)
    return [
        (scores_branch, runs + 1, p1_scores),
        (stays_branch, runs, 1 - p1_scores),
    ]


def resolve_event(event: str, base_code: int, outs: int, adv: dict) -> list[Branch]:
    """
    1つの打撃イベントが (base_code, outs) の状態で起きたときの遷移先候補を返す。
    複数要素が返る場合は確率的な分岐(単打・二塁打の走者進塁)を意味する。
    """
    bases = Bases.from_code(base_code)

    if event in ("BB", "HBP"):
        new_bases, runs = _walk_advance(bases)
        return [Branch(new_bases, outs, runs, 1.0)]

    if event == "1B":
        return [
            Branch(nb, outs, runs, p)
            for nb, runs, p in _single_branches(bases, outs, adv)
        ]

    if event == "2B":
        return [
            Branch(nb, outs, runs, p)
            for nb, runs, p in _double_branches(bases, outs, adv)
        ]

    if event == "3B":
        runs = int(bases.on1) + int(bases.on2) + int(bases.on3)
        return [Branch(Bases(False, False, True), outs, runs, 1.0)]

    if event == "HR":
        runs = 1 + int(bases.on1) + int(bases.on2) + int(bases.on3)
        return [Branch(Bases(False, False, False), outs, runs, 1.0)]

    if event == "SO":
        return [Branch(bases, outs + 1, 0, 1.0)]

    if event == "OUT":
        return [Branch(bases, outs + 1, 0, 1.0)]

    if event == "SF":
        if bases.on3:
            return [Branch(Bases(bases.on1, bases.on2, False), outs + 1, 1, 1.0)]
        # 三塁に走者がいなければ犠飛は成立しないので通常のアウトとして扱う
        return [Branch(bases, outs + 1, 0, 1.0)]

    if event == "SH":
        # 犠打成功: 打者アウト、走者は全員1つずつ進塁 (成功パターンのみモデル化)。三塁走者は生還して三塁を空ける
        runs = 1 if bases.on3 else 0
        new_bases = Bases(on1=False, on2=bases.on1, on3=bases.on2)
        return [Branch(new_bases, outs + 1, runs, 1.0)]

    if event == "GIDP":
        if not bases.on1:
            # 一塁走者がいなければ併殺は成立しないため通常のアウトとして扱う
            return [Branch(bases, outs + 1, 0, 1.0)]
        new_bases = Bases(on1=False, on2=bases.on2, on3=bases.on3)
        return [Branch(new_bases, outs + 2, 0, 1.0)]

    raise ValueError(f"unknown event: {event}")


def apply_steal_step(base_code: int, outs: int, sb_prob: float, cs_prob_given_attempt: float, adv: dict | None = None):
    """
    盗塁ステップ (一塁のみ走者がいる状態を対象、一・二塁の重走者ケースは今回は未対応)。
    打者の打席を処理する前に適用する。
    returns: list of (new_base_code, new_outs, prob)
    """
    bases = Bases.from_code(base_code)
    if bases.on1 and not bases.on2:
        p_attempt = sb_prob
        p_success = 1 - cs_prob_given_attempt
        results = []
        if p_attempt > 0:
            # 成功: 一塁 -> 二塁
            success_bases = Bases(on1=False, on2=True, on3=bases.on3)
            results.append((success_bases.code, outs, p_attempt * p_success))
            # 失敗(盗塁死): アウト+1, 一塁走者消滅
            fail_bases = Bases(on1=False, on2=False, on3=bases.on3)
            results.append((fail_bases.code, outs + 1, p_attempt * (1 - p_success)))
        if p_attempt < 1.0:
            results.append((base_code, outs, 1 - p_attempt))
        return results
    return [(base_code, outs, 1.0)]


# 遷移行列のキャッシュ上限（打者・盗塁確率の組み合わせ数）。1リクエストの打者は9人なので十分に大きい
_CACHE_SIZE = 1024


@lru_cache(maxsize=_CACHE_SIZE)
def build_steal_transition(sb_prob: float, cs_prob_given_attempt: float) -> np.ndarray:
    """
    打席前の盗塁ステップを表す遷移行列 S (25x25) を構築する。
    各状態に apply_steal_step を適用したもので、盗塁を試みない状態は自己ループになる。
    盗塁死で3アウトになった場合は終端状態 (TERMINAL_STATE) へ遷移する。

    同じ確率の組で繰り返し呼ばれる(最適打順探索)ため結果をキャッシュする。
    キャッシュした配列を共有するので、呼び出し側が書き換えられないよう読み取り専用にしている。
    """
    size = NUM_TRANSIENT_STATES + 1
    S = np.zeros((size, size))
    for idx in range(NUM_TRANSIENT_STATES):
        base_code, outs = decode_base_out_index(idx)
        for new_code, new_outs, p in apply_steal_step(base_code, outs, sb_prob, cs_prob_given_attempt):
            j = TERMINAL_STATE if new_outs >= 3 else base_out_index(new_code, new_outs)
            S[idx, j] += p
    S[TERMINAL_STATE, TERMINAL_STATE] = 1.0
    S.setflags(write=False)
    return S


EVENT_KEYS = ["BB", "HBP", "1B", "2B", "3B", "HR", "SO", "OUT", "SF", "SH", "GIDP"]


def build_batter_transition(event_probs: dict, adv: dict | None = None) -> tuple[np.ndarray, np.ndarray]:
    """
    打者1人分の「1打席あたりの遷移行列 T (25x25)」と
    「状態ごとの期待報酬(得点)ベクトル reward (24,)」を構築する。

    event_probs には EVENT_KEYS のキーが確率として入っている前提 (合計は概ね1)。

    最適打順探索では同じ打者の行列を何度も使うため、既定の進塁確率 (adv 未指定) のときに限り
    結果をキャッシュする。キーはイベントの並び順も含めた (イベント, 確率) の組なので、
    行列を足し合わせる順序も含めて毎回構築した場合と同一の値になる。
    キャッシュした配列は共有されるため読み取り専用にしている。
    """
    if adv is None or adv is DEFAULT_ADVANCE_PROBS:
        return _cached_batter_transition(tuple(event_probs.items()))
    return _build_batter_transition(event_probs, adv)


@lru_cache(maxsize=_CACHE_SIZE)
def _cached_batter_transition(event_items: tuple[tuple[str, float], ...]) -> tuple[np.ndarray, np.ndarray]:
    T, reward = _build_batter_transition(dict(event_items), DEFAULT_ADVANCE_PROBS)
    T.setflags(write=False)
    reward.setflags(write=False)
    return T, reward


def _build_batter_transition(event_probs: dict, adv: dict) -> tuple[np.ndarray, np.ndarray]:
    adv = adv or DEFAULT_ADVANCE_PROBS
    size = NUM_TRANSIENT_STATES + 1  # 24 + 終端状態
    T = np.zeros((size, size))
    reward = np.zeros(NUM_TRANSIENT_STATES)

    for idx in range(NUM_TRANSIENT_STATES):
        base_code, outs = decode_base_out_index(idx)
        for event, p_event in event_probs.items():
            if p_event <= 0:
                continue
            for branch in resolve_event(event, base_code, outs, adv):
                p = p_event * branch.prob
                if branch.new_outs >= 3:
                    j = TERMINAL_STATE
                else:
                    j = base_out_index(branch.new_bases.code, branch.new_outs)
                T[idx, j] += p
                reward[idx] += p * branch.runs
    # 終端状態は吸収状態として自己ループさせておく(実際の計算では使用しないが行列を正則にするため)
    T[TERMINAL_STATE, TERMINAL_STATE] = 1.0
    return T, reward
