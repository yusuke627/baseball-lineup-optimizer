from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.markov import expected_runs_per_game
from app.core.metrics import (
    BasicStats,
    batting_average,
    event_probabilities,
    on_base_percentage,
    slugging_percentage,
    steal_probabilities,
    woba,
    wrc_plus,
)
from app.core.monte_carlo import estimate_expected_runs
from app.core.optimizer import evaluate_lineup, inefficiency_percent, multi_restart_hill_climb
from app.data_loader import list_presets
from app.schemas.batter import BatterCountStats, LineupEvaluationRequest, LineupEvaluationResponse

app = FastAPI(
    title="Baseball Lineup Run-Expectancy API",
    description="打順から得点期待値を算出するAPI（詳細は docs/DESIGN.md を参照）",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # フロントエンド実装時に適切なオリジンへ絞り込む
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/presets")
def get_presets(league: str = "mlb", season: int = 2025):
    """プリセット一覧。各プリセットに表示用指標 (summary) をアプリ側で計算して付与する"""
    presets = list_presets(league=league, season=season)
    for preset in presets:
        stats = _to_basic_stats(BatterCountStats.model_validate(preset["stats"]))
        preset["summary"] = _stats_to_summary(stats)
    return presets


def _to_basic_stats(stats_model: BatterCountStats) -> BasicStats:
    return BasicStats(
        PA=stats_model.PA, AB=stats_model.AB, H=stats_model.H,
        doubles=stats_model.doubles, triples=stats_model.triples, HR=stats_model.HR,
        BB=stats_model.BB, HBP=stats_model.HBP, SO=stats_model.SO, SF=stats_model.SF,
        SH=stats_model.SH, GIDP=stats_model.GIDP, SB=stats_model.SB, CS=stats_model.CS,
    )


def _stats_to_summary(stats: BasicStats) -> dict:
    return {
        "PA": stats.PA,
        "HR": stats.HR,
        "AVG": round(batting_average(stats), 3),
        "OBP": round(on_base_percentage(stats), 3),
        "SLG": round(slugging_percentage(stats), 3),
        "wOBA": round(woba(stats), 3),
        "wRC_plus": round(wrc_plus(stats), 1),
        "SB": stats.SB,
        "CS": stats.CS,
        "SB_pct": round(stats.SB / (stats.SB + stats.CS), 3) if (stats.SB + stats.CS) else None,
    }


@app.post("/lineup/evaluate", response_model=LineupEvaluationResponse)
def evaluate(req: LineupEvaluationRequest):
    if set(req.input_order) != set(req.batters.keys()):
        raise HTTPException(400, "input_order must contain exactly the given batter ids")
    if len(req.input_order) != 9:
        raise HTTPException(400, "exactly 9 batters are required")

    event_probs_by_id = {}
    for bid, stats_model in req.batters.items():
        stats = _to_basic_stats(stats_model)
        event_probs_by_id[bid] = event_probabilities(stats)

    input_runs = evaluate_lineup(event_probs_by_id, req.input_order)

    # 全探索(362,880通り)は同期APIには重すぎるため、複数回のランダム再スタートによる
    # 山登り法(適応的停止: 最低10回・最大50回、連続10回改善なしで打ち切り)を使用する。
    # 厳密解が必要な場合は別途バックグラウンドジョブでの全探索エンドポイントを用意する想定。
    optimized = multi_restart_hill_climb(event_probs_by_id, start_order=req.input_order)
    best_order = optimized["best_order"]
    best_runs = optimized["best_runs"]

    lineup = [event_probs_by_id[bid] for bid in req.input_order]
    mc = estimate_expected_runs(lineup, n_trials=5000)

    return LineupEvaluationResponse(
        input_order=req.input_order,
        input_order_runs_per_game=input_runs,
        input_order_runs_n_games=input_runs * req.n_games,
        best_order=best_order,
        best_order_runs_per_game=best_runs,
        best_order_runs_n_games=best_runs * req.n_games,
        inefficiency_percent=inefficiency_percent(input_runs, best_runs),
        n_games=req.n_games,
        monte_carlo=mc,
    )
