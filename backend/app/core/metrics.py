"""
表示用の打撃指標 (打率・出塁率・長打率・wOBA・wRC+ 等) の算出。

wOBA/wRC+ の係数は FanGraphs "Guts!" テーブル (2025年シーズン) を使用する。
出典: https://www.fangraphs.com/guts.aspx
docs/DESIGN.md 3-2章を参照。
"""
from __future__ import annotations

from dataclasses import dataclass

# 2025年シーズンの Guts! 係数
GUTS_2025 = {
    "wOBA_league": 0.313,
    "wOBAScale": 1.232,
    "wBB": 0.691,
    "wHBP": 0.722,
    "w1B": 0.882,
    "w2B": 1.252,
    "w3B": 1.584,
    "wHR": 2.037,
    "runSB": 0.200,
    "runCS": -0.410,
    "R_PA_league": 0.118,
}


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


def woba(s: BasicStats, guts: dict = GUTS_2025) -> float:
    denom = s.AB + s.BB + s.SF + s.HBP
    numer = (
        guts["wBB"] * s.BB
        + guts["wHBP"] * s.HBP
        + guts["w1B"] * s.singles
        + guts["w2B"] * s.doubles
        + guts["w3B"] * s.triples
        + guts["wHR"] * s.HR
    )
    return numer / denom if denom else 0.0


def wrc_plus(s: BasicStats, guts: dict = GUTS_2025, park_factor: float = 1.0) -> float:
    """
    簡易版 wRC+。パークファクターは指定がなければ 1.0 (未補正) として扱う。
    wRC/PA = ((wOBA - リーグ平均wOBA) / wOBAScale + リーグ平均R/PA)
    wRC+ = wRC/PA を park_factor で補正した上でリーグ平均を100として指数化したもの
    """
    if s.PA == 0:
        return 0.0
    w = woba(s, guts)
    wrc_per_pa = (w - guts["wOBA_league"]) / guts["wOBAScale"] + guts["R_PA_league"]
    league_wrc_per_pa = guts["R_PA_league"]
    adjusted = wrc_per_pa / park_factor
    return 100 * adjusted / league_wrc_per_pa if league_wrc_per_pa else 0.0


def event_probabilities(s: BasicStats) -> dict:
    """
    生のカウント統計からマルコフ連鎖/モンテカルロの入力となる
    イベント別確率 (EVENT_KEYS に対応) を算出する。
    """
    pa = s.PA if s.PA else (s.AB + s.BB + s.HBP + s.SF + s.SH)
    if pa == 0:
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
    attempts = s.SB + s.CS
    if attempts == 0:
        return {"sb_prob": 0.0, "cs_prob_given_attempt": 0.0}
    # 簡易的に「一塁に単独で出塁した機会のうち、どれくらいの割合で盗塁企図するか」を
    # PA に対する比率として近似する(厳密な盗塁企図機会数の算出は未実装)。
    sb_prob = attempts / s.PA if s.PA else 0.0
    cs_prob_given_attempt = s.CS / attempts
    return {"sb_prob": sb_prob, "cs_prob_given_attempt": cs_prob_given_attempt}
