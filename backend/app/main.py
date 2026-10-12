from __future__ import annotations

from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.core.metrics import (
    BasicStats,
    batting_average,
    event_probabilities,
    on_base_percentage,
    slugging_percentage,
    steal_probabilities,
)
from app.core.monte_carlo import estimate_expected_runs
from app.core.optimizer import (
    evaluate_lineup,
    inefficiency_percent,
    multi_restart_hill_climb,
)
from app.data_loader import list_presets
from app.schemas.batter import (
    TOTALS_GAMES,
    BatterCountStats,
    BatterMetrics,
    BatterMetricsRequest,
    BatterMetricsResponse,
    GamesTotal,
    LineupEvaluationRequest,
    LineupEvaluationResponse,
    stats_warnings,
)

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
def get_presets(
    # league はプリセットのフォルダ名 (data/presets/<league>/) に使うため、英小文字のみ許可する
    league: Annotated[str, Query(pattern="^[a-z]+$", max_length=20)] = "mlb",
    season: int = 2025,
):
    """
    プリセット一覧。各プリセットに表示用指標 (summary) をアプリ側で計算して付与する。
    wOBA・wRC+ はアプリでは計算しない。プリセットのJSONに公表値 (reference_metrics) があれば
    そのまま返し、無ければ null を返す。この値はモデルの計算には使わない。
    """
    presets = list_presets(league=league, season=season)
    for preset in presets:
        stats = _to_basic_stats(BatterCountStats.model_validate(preset["stats"]))
        preset["summary"] = _stats_to_summary(stats)
        preset.setdefault("reference_metrics", None)
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
        "SB": stats.SB,
        "CS": stats.CS,
        "SB_pct": round(stats.SB / (stats.SB + stats.CS), 3) if (stats.SB + stats.CS) else None,
    }


def _display_names(
    batters: dict[str, BatterCountStats], display_names: dict[str, str] | None
) -> dict[str, str]:
    """warnings の文頭に出す名前 (打者ID → 名前)。表示名の指定が無ければ打者IDを使う"""
    if display_names is None:
        return {bid: bid for bid in batters}
    if set(display_names.keys()) != set(batters.keys()):
        raise HTTPException(400, "display_names must contain exactly the given batter ids")
    if len(set(display_names.values())) != len(display_names):
        raise HTTPException(400, "display_names must not contain duplicate names")
    return display_names


@app.post("/batters/metrics", response_model=BatterMetricsResponse)
def batter_metrics(req: BatterMetricsRequest):
    """
    打者ごとの表示用の指標 (打率・出塁率・長打率・OPS など) と、その打者についての注意を返す。
    画面で打順を並べ替えるときの参考に使う。得点期待値の計算は行わない。
    """
    names = _display_names(req.batters, req.display_names)
    result = {}
    for bid, stats_model in req.batters.items():
        stats = _to_basic_stats(stats_model)
        # 分母が0の指標は「計算できない」として null を返す (0 と区別するため)
        has_ab = stats.AB > 0
        has_obp_denominator = stats.AB + stats.BB + stats.HBP + stats.SF > 0
        avg = batting_average(stats) if has_ab else None
        obp = on_base_percentage(stats) if has_obp_denominator else None
        slg = slugging_percentage(stats) if has_ab else None
        result[bid] = BatterMetrics(
            PA=stats.PA,
            HR=stats.HR,
            SB=stats.SB,
            CS=stats.CS,
            AVG=avg,
            OBP=obp,
            SLG=slg,
            OPS=obp + slg if obp is not None and slg is not None else None,
            BB_pct=stats.BB / stats.PA,  # PA は検証で1以上
            SO_pct=stats.SO / stats.PA,
            warnings=stats_warnings(names[bid], stats_model),
        )
    return BatterMetricsResponse(batters=result)


@app.post("/lineup/evaluate", response_model=LineupEvaluationResponse)
def evaluate(req: LineupEvaluationRequest):
    if set(req.input_order) != set(req.batters.keys()):
        raise HTTPException(400, "input_order must contain exactly the given batter ids")
    if len(req.input_order) != 9:
        raise HTTPException(400, "exactly 9 batters are required")
    if len(set(req.input_order)) != len(req.input_order):
        raise HTTPException(400, "input_order must not contain duplicate batter ids")
    names = _display_names(req.batters, req.display_names)

    event_probs_by_id = {}
    steal_probs_by_id = {}
    warnings: list[str] = []
    for bid, stats_model in req.batters.items():
        stats = _to_basic_stats(stats_model)
        event_probs_by_id[bid] = event_probabilities(stats)
        steal_probs_by_id[bid] = steal_probabilities(stats)
        warnings.extend(stats_warnings(names[bid], stats_model))

    input_runs = evaluate_lineup(event_probs_by_id, req.input_order, steal_probs_by_id)

    # 全探索(362,880通り)は同期APIには重すぎるため、複数回のランダム再スタートによる
    # 山登り法(適応的停止: 最低10回・最大50回、連続10回改善なしで打ち切り)を使用する。
    # 厳密解が必要な場合は別途バックグラウンドジョブでの全探索エンドポイントを用意する想定。
    optimized = multi_restart_hill_climb(
        event_probs_by_id, start_order=req.input_order, steals=steal_probs_by_id
    )
    best_order = optimized["best_order"]
    best_runs = optimized["best_runs"]

    lineup = [event_probs_by_id[bid] for bid in req.input_order]
    lineup_steals = [steal_probs_by_id[bid] for bid in req.input_order]
    mc = estimate_expected_runs(lineup, steal_probs=lineup_steals, n_trials=5000)

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
        totals_by_games=[
            GamesTotal(n_games=n, input_order_runs=input_runs * n, best_order_runs=best_runs * n)
            for n in TOTALS_GAMES
        ],
        warnings=warnings,
    )
