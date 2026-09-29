from __future__ import annotations

from pydantic import BaseModel, Field


class BatterCountStats(BaseModel):
    PA: int = Field(ge=0)
    AB: int = Field(ge=0)
    H: int = Field(ge=0)
    doubles: int = Field(ge=0, alias="2B")
    triples: int = Field(ge=0, alias="3B")
    HR: int = Field(ge=0)
    BB: int = Field(ge=0)
    HBP: int = Field(ge=0)
    SO: int = Field(ge=0)
    SF: int = Field(ge=0)
    SH: int = Field(0, ge=0)
    GIDP: int = Field(ge=0)
    SB: int = Field(ge=0)
    CS: int = Field(ge=0)

    class Config:
        populate_by_name = True


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
    batters: dict[str, BatterCountStats]  # key: 任意の打者ID
    input_order: list[str]
    n_games: int = 143


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
