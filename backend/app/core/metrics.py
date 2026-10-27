"""
表示用の打撃指標 (打率・出塁率・長打率) と、モデルの入力となるイベント確率・盗塁確率の算出。

wOBA・wRC+ は、このアプリでは計算しない (docs/DESIGN.md 7-5 を参照)。
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BasicStats:
    PA: int
    AB: int
    H: int
    doubles: int
    triples: int
    HR: int
    BB: int
    HBP: int
    SO: int
    SF: int
    SH: int = 0
    GIDP: int = 0
    SB: int = 0
    CS: int = 0

    @property
    def singles(self) -> int:
        return self.H - self.doubles - self.triples - self.HR


def batting_average(s: BasicStats) -> float:
    return s.H / s.AB if s.AB else 0.0


def on_base_percentage(s: BasicStats) -> float:
    denom = s.AB + s.BB + s.HBP + s.SF
    numer = s.H + s.BB + s.HBP
    return numer / denom if denom else 0.0


def slugging_percentage(s: BasicStats) -> float:
    total_bases = s.singles + 2 * s.doubles + 3 * s.triples + 4 * s.HR
    return total_bases / s.AB if s.AB else 0.0


def event_probabilities(s: BasicStats) -> dict:
    """
    生のカウント統計からマルコフ連鎖/モンテカルロの入力となる
    イベント別確率 (EVENT_KEYS に対応) を算出する。
    """
    # PA は入力必須 (API で 1 以上を検証)。以前あった「PA=0 なら内訳から自動計算」は廃止した
    pa = s.PA
    if pa <= 0:
        raise ValueError("PA must be greater than 0")

    other_out = s.AB - s.H - s.SO - s.GIDP
    if other_out < 0:
        other_out = 0  # データ不整合時のフォールバック

    probs = {
        "BB": s.BB / pa,
        "HBP": s.HBP / pa,
        "1B": s.singles / pa,
        "2B": s.doubles / pa,
        "3B": s.triples / pa,
        "HR": s.HR / pa,
        "SO": s.SO / pa,
        "OUT": other_out / pa,
        "SF": s.SF / pa,
        "SH": s.SH / pa,
        "GIDP": s.GIDP / pa,
    }
    total = sum(probs.values())
    if total > 0:
        probs = {k: v / total for k, v in probs.items()}  # 端数調整で合計を1に正規化
    return probs


def steal_probabilities(s: BasicStats) -> dict:
    """
    盗塁企図率・盗塁死率を算出する。

    企図率は「一塁に出塁した回数」を盗塁機会とみなし、(SB+CS) / (単打+四球+死球) で近似する。
    モデルではこの確率を「一塁走者がいて二塁が空いている打席」ごとに適用するため、
    一塁に滞在したまま複数打席を迎える場合はやや過大になりうる (docs/DESIGN.md 3-4)。
    """
    attempts = s.SB + s.CS
    opportunities = s.singles + s.BB + s.HBP
    if attempts == 0 or opportunities <= 0:
        return {"sb_prob": 0.0, "cs_prob_given_attempt": 0.0}
    sb_prob = min(attempts / opportunities, 1.0)
    cs_prob_given_attempt = s.CS / attempts
    return {"sb_prob": sb_prob, "cs_prob_given_attempt": cs_prob_given_attempt}
