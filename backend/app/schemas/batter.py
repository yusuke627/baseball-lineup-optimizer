from __future__ import annotations

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

# 各成績の上限。統計的な根拠のある値ではなく、誤入力や悪用を防ぐための安全上の上限。
MAX_STAT_VALUE = 20000
# リクエストの n_games の上限（同上、安全上の上限）
MAX_N_GAMES = 200
# レスポンスで常に返す試合数換算（totals_by_games）
TOTALS_GAMES = (143, 162)
# 打席数(PA)がこの値未満の打者には「標本が小さい」という注意を出す。
# 本プロジェクトの目安であり、出典・統計的根拠のある値ではない。
LOW_PA_THRESHOLD = 200
# 打者の表示名の最大文字数（前後の空白を除いたあとの文字数。画面の表示が崩れないための上限）
MAX_DISPLAY_NAME_LENGTH = 40

Stat = Annotated[int, Field(ge=0, le=MAX_STAT_VALUE)]
BatterId = Annotated[str, StringConstraints(min_length=1, max_length=64)]


def _is_control_character(ch: str) -> bool:
    """制御文字 (改行・タブなど。U+0000〜U+001F と U+007F〜U+009F) かどうか"""
    code = ord(ch)
    return code <= 0x1F or 0x7F <= code <= 0x9F


def normalize_display_name(value: str) -> str:
    """
    打者の表示名を検証し、前後の空白を除いて返す。フロントエンドの入力検証と同じルール
    (schemas/display_name_validation_cases.json の例で両者の一致をテストしている)。
    """
    if any(_is_control_character(ch) for ch in value):
        raise ValueError("display name must not contain control characters")
    name = value.strip()
    if not name:
        raise ValueError("display name must not be empty")
    if len(name) > MAX_DISPLAY_NAME_LENGTH:
        raise ValueError(f"display name must be at most {MAX_DISPLAY_NAME_LENGTH} characters")
    return name


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


# 注意の種類 (API の warning_items の code)
WarningCode = Literal["PA_SUM_MISMATCH", "LOW_PA"]


def stats_warning_items(batter_id: str, stats: BatterCountStats) -> list[tuple[WarningCode, str]]:
    """
    エラーにはしないが利用者に知らせる点を、(種類, 文) の組で返す。batter_id は文頭に出す名前
    (表示名が指定されていれば表示名、なければ打者ID)。

    - PA_SUM_MISMATCH: PA と内訳の合計が合わない。合わなくても計算はできる(イベント確率は合計1に
      正規化される)が、入力ミスの可能性やモデルの前提との関係があるため警告にとどめる。
    - LOW_PA: 打席数が少ない (LOW_PA_THRESHOLD 未満)。成績の標本が小さいことを知らせる。
    """
    items: list[tuple[WarningCode, str]] = []
    component_sum = stats.pa_component_sum()
    if component_sum != stats.PA:
        items.append((
            "PA_SUM_MISMATCH",
            f"{batter_id}: 打席数(PA)={stats.PA} が、打数+四球+死球+犠飛+犠打の合計={component_sum} と一致しません。"
            "入力値はそのまま使い、イベント確率は合計が1になるよう正規化して計算します。",
        ))
    if stats.PA < LOW_PA_THRESHOLD:
        items.append((
            "LOW_PA",
            f"{batter_id}: 打席数(PA)={stats.PA} は少なめです（目安：{LOW_PA_THRESHOLD}未満）。"
            "成績の標本が小さいため、確率の見積もりが実力からずれやすく、打順の結果も変わりやすくなります。"
            "計算はそのまま行います。",
        ))
    return items


def stats_warnings(batter_id: str, stats: BatterCountStats) -> list[str]:
    """stats_warning_items の文だけを返す (API の warnings に入れる形)"""
    return [message for _, message in stats_warning_items(batter_id, stats)]


class _WithDisplayNames(BaseModel):
    """打者の表示名 (任意) を受け取るリクエストの共通部分"""

    # 打者ID → 画面に出す表示名。指定すると warnings の文に打者IDではなく表示名を使う。省略可
    display_names: dict[BatterId, str] | None = None

    @field_validator("display_names")
    @classmethod
    def _normalize_display_names(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return None
        return {batter_id: normalize_display_name(name) for batter_id, name in value.items()}


class LineupEvaluationRequest(_WithDisplayNames):
    batters: dict[BatterId, BatterCountStats]  # key: 任意の打者ID
    input_order: list[BatterId]
    n_games: int = Field(143, ge=1, le=MAX_N_GAMES)


class BatterMetricsRequest(_WithDisplayNames):
    """打者ごとの表示用の指標を求めるリクエスト (1〜9人)"""

    batters: dict[BatterId, BatterCountStats] = Field(min_length=1, max_length=9)


class WarningItem(BaseModel):
    """種類つきの注意。code で種類を区別し、message は画面にそのまま出す文"""

    # PA_SUM_MISMATCH: 打席数と内訳 (打数+四球+死球+犠飛+犠打) の合計が合わない
    # LOW_PA: 打席数が少ない (LOW_PA_THRESHOLD 未満)
    code: WarningCode
    message: str


class BatterMetrics(BaseModel):
    """
    打者1人分の表示用の指標。分母が0で計算できない指標は null (None) を返す。
    率は丸めずに返す (桁をそろえるのは表示する側)。
    """

    PA: int
    H: int
    HR: int
    SB: int
    CS: int
    AVG: float | None  # 打率 = H / AB
    OBP: float | None  # 出塁率 = (H + BB + HBP) / (AB + BB + HBP + SF)
    SLG: float | None  # 長打率 = 総塁打 / AB
    OPS: float | None  # OPS = 出塁率 + 長打率
    BB_pct: float  # 四球率 = BB / PA
    SO_pct: float  # 三振率 = SO / PA
    # この打者についての注意 (LineupEvaluationResponse.warnings と同じ文)。
    # 以前からの互換のために残している欄で、warning_items の message を同じ順に並べたもの
    warnings: list[str] = []
    # 種類つきの注意。画面で「打席数が少ない打者」だけを選ぶときなどに使う
    warning_items: list[WarningItem] = []


class BatterMetricsResponse(BaseModel):
    batters: dict[str, BatterMetrics]


class GamesTotal(BaseModel):
    """ある試合数に換算した期待得点 (1試合あたりの期待得点 × 試合数)"""
    n_games: int
    input_order_runs: float
    best_order_runs: float
    # 推奨打順に対する入力打順の損失点 (best_order_runs - input_order_runs)
    runs_lost: float


class LineupEvaluationResponse(BaseModel):
    input_order: list[str]
    input_order_runs_per_game: float
    input_order_runs_n_games: float
    best_order: list[str]
    best_order_runs_per_game: float
    best_order_runs_n_games: float
    inefficiency_percent: float
    # 1試合あたりの損失点 (best_order_runs_per_game - input_order_runs_per_game)
    runs_lost_per_game: float
    n_games: int
    monte_carlo: dict | None = None
    # 143試合・162試合に換算した値。画面側で試合数を切り替えても再計算が要らないよう常に返す
    totals_by_games: list[GamesTotal] = []
    warnings: list[str] = []
