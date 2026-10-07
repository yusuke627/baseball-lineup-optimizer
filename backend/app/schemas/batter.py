from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

# 各成績の上限。統計的な根拠のある値ではなく、誤入力や悪用を防ぐための安全上の上限。
MAX_STAT_VALUE = 20000
# リクエストの n_games の上限（同上、安全上の上限）
MAX_N_GAMES = 200
# レスポンスで常に返す試合数換算（totals_by_games）
TOTALS_GAMES = (143, 162)

Stat = Annotated[int, Field(ge=0, le=MAX_STAT_VALUE)]
BatterId = Annotated[str, StringConstraints(min_length=1, max_length=64)]


class BatterCountStats(BaseModel):
    # "2B"/"3B"(別名) と "doubles"/"triples"(フィールド名) のどちらでも入力できるようにする
    model_config = ConfigDict(validate_by_name=True, validate_by_alias=True)

    PA: int = Field(ge=1, le=MAX_STAT_VALUE)
    AB: Stat
    H: Stat
    doubles: Stat = Field(alias="2B")
    triples: Stat = Field(alias="3B")
    HR: Stat
    BB: Stat
    HBP: Stat
    SO: Stat
    SF: Stat
    SH: Stat = 0
    GIDP: Stat
    SB: Stat
    CS: Stat

    @model_validator(mode="after")
    def _check_consistency(self) -> BatterCountStats:
        """成績同士の矛盾を検出する。フロントエンドの入力検証と同じルール
        (schemas/batter_stats_validation_cases.json の例で両者の一致をテストしている)。"""
        if self.AB > self.PA:
            raise ValueError("AB must be less than or equal to PA")
        if self.H > self.AB:
            raise ValueError("H must be less than or equal to AB")
        if self.doubles + self.triples + self.HR > self.H:
            raise ValueError("2B + 3B + HR must be less than or equal to H")
        if self.SO + self.GIDP > self.AB - self.H:
            raise ValueError("SO + GIDP must be less than or equal to AB - H")
        return self

    def pa_component_sum(self) -> int:
        """打席数の内訳として入力された項目の合計 (打数+四球+死球+犠飛+犠打)"""
        return self.AB + self.BB + self.HBP + self.SF + self.SH


def stats_warnings(batter_id: str, stats: BatterCountStats) -> list[str]:
    """
    エラーにはしないが利用者に知らせる点を返す。
    PA と内訳の合計が合わなくても計算はできる(イベント確率は合計1に正規化される)が、
    入力ミスの可能性やモデルの前提との関係があるため警告にとどめる。
    """
    warnings = []
    component_sum = stats.pa_component_sum()
    if component_sum != stats.PA:
        warnings.append(
            f"{batter_id}: 打席数(PA)={stats.PA} が、打数+四球+死球+犠飛+犠打の合計={component_sum} と一致しません。"
            "入力値はそのまま使い、イベント確率は合計が1になるよう正規化して計算しています。"
        )
    return warnings


class SourceInfo(BaseModel):
    provider: str
    url: str
    retrieved_at: str


class BatterPreset(BaseModel):
    id: str
    name: str
    team: str | None = None
    season: int
    league: str = "MLB"
    source: SourceInfo
    stats: BatterCountStats


class ManualBatterInput(BaseModel):
    """手入力モード用のリクエストボディ(基本はBatterCountStatsと同一項目)"""
    stats: BatterCountStats


class LineupEvaluationRequest(BaseModel):
    batters: dict[BatterId, BatterCountStats]  # key: 任意の打者ID
    input_order: list[BatterId]
    n_games: int = Field(143, ge=1, le=MAX_N_GAMES)


class GamesTotal(BaseModel):
    """ある試合数に換算した期待得点 (1試合あたりの期待得点 × 試合数)"""
    n_games: int
    input_order_runs: float
    best_order_runs: float


class LineupEvaluationResponse(BaseModel):
    input_order: list[str]
    input_order_runs_per_game: float
    input_order_runs_n_games: float
    best_order: list[str]
    best_order_runs_per_game: float
    best_order_runs_n_games: float
    inefficiency_percent: float
    n_games: int
    monte_carlo: dict | None = None
    # 143試合・162試合に換算した値。画面側で試合数を切り替えても再計算が要らないよう常に返す
    totals_by_games: list[GamesTotal] = []
    warnings: list[str] = []
