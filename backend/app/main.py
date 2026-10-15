from __future__ import annotations

import unicodedata
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
from app.data_loader import list_presets, list_seasons
from app.schemas.batter import (
    TOTALS_GAMES,
    BatterCountStats,
    BatterMetrics,
    BatterMetricsRequest,
    BatterMetricsResponse,
    GamesTotal,
    LineupEvaluationRequest,
    LineupEvaluationResponse,
    WarningItem,
    stats_warning_items,
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


# league はプリセットのフォルダ名 (data/presets/<league>/) に使うため、英小文字のみ許可する
League = Annotated[str, Query(pattern="^[a-z]+$", max_length=20)]
# 球団コードは team_info.code と同じ形 (英大文字2〜3文字)
TeamCode = Annotated[str | None, Query(pattern="^[A-Z]{2,3}$")]
SearchText = Annotated[str | None, Query(max_length=40)]
# 名前で検索したときに返す最大件数。総数は total で返す
MAX_SEARCH_RESULTS = 50
LEAGUE_ORDER = ("AL", "NL")
# 球団の一覧での地区の並び (東・中・西)。地区の無い球団は最後
DIVISION_ORDER = {"E": 0, "C": 1, "W": 2}


def _with_summary(preset: dict) -> dict:
    """
    プリセットに表示用指標 (summary) をアプリ側で計算して付与する。
    wOBA・wRC+ はアプリでは計算しない。プリセットのJSONに公表値 (reference_metrics) があれば
    そのまま返し、無ければ null を返す。この値はモデルの計算には使わない。
    """
    stats = _to_basic_stats(BatterCountStats.model_validate(preset["stats"]))
    preset["summary"] = _stats_to_summary(stats)
    preset.setdefault("reference_metrics", None)
    return preset


def _fold(text: str) -> str:
    """検索用に、大文字・小文字とアクセント記号の違いをなくす (例: "José" と "jose" を同じにする)"""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).casefold()


def _name_sort_key(preset: dict) -> tuple[str, str]:
    return (_fold(preset["name"]), preset["id"])


@app.get("/presets")
def get_presets(
    league: League = "mlb",
    season: int = 2025,
    team: TeamCode = None,
    q: SearchText = None,
):
    """
    プリセット一覧。

    - team も q も無いときは、従来どおり全件を配列で返す (互換のため)
    - team (球団コード) か q (名前の一部) があるときは、{"total": 総数, "items": [...]} を返す。
      items は名前順。team は最終所属の球団 (team_info.code) で絞り込み、移籍前の球団では見つからない。
      q は球団に関係なく、名前の一部で探す (大文字・小文字とアクセント記号は区別しない)。
      q があるときは最大 MAX_SEARCH_RESULTS 件を返す
    """
    presets = list_presets(league=league, season=season)
    query = _fold(q.strip()) if q is not None else ""
    if team is None and query == "":
        return [_with_summary(preset) for preset in presets]

    matched = [
        preset for preset in presets
        if (team is None or (preset.get("team_info") or {}).get("code") == team)
        and (query == "" or query in _fold(preset["name"]))
    ]
    matched.sort(key=_name_sort_key)
    items = matched[:MAX_SEARCH_RESULTS] if query else matched
    return {"total": len(matched), "items": [_with_summary(preset) for preset in items]}


@app.get("/presets/seasons")
def get_preset_seasons(league: League = "mlb"):
    """プリセットのあるシーズンの一覧 (古い順)"""
    return {"league": league, "seasons": list_seasons(league)}


@app.get("/presets/teams")
def get_preset_teams(league: League = "mlb", season: int = 2025):
    """
    球団の一覧。リーグ (AL・NL) ごとに分け、リーグの中は地区 (division。東 E・中 C・西 W の順) ごと、
    地区の中は球団名順に並べる。地区の情報が無い球団は division を null にして、リーグの最後に並べる。
    count は、その球団を最終所属 (team_info.code) とする選手の数。移籍した選手は最終所属の球団だけで数える。
    team_info の無いプリセットは、どの球団にも数えず without_team に数を返す
    """
    team_info: dict[str, dict[str, str]] = {}
    counts: dict[str, int] = {}
    without_team = 0
    for preset in list_presets(league=league, season=season):
        info = preset.get("team_info")
        if info is None:
            without_team += 1
            continue
        team_info.setdefault(info["code"], info)
        counts[info["code"]] = counts.get(info["code"], 0) + 1
    leagues = [
        {
            "league": league_id,
            "teams": [
                {
                    "code": code,
                    "name": info["name"],
                    "league": info["league"],
                    "division": info.get("division"),
                    "count": counts[code],
                }
                for code, info in sorted(
                    team_info.items(),
                    key=lambda item: (
                        DIVISION_ORDER.get(item[1].get("division", ""), len(DIVISION_ORDER)),
                        _fold(item[1]["name"]),
                        item[0],
                    ),
                )
                if info["league"] == league_id
            ],
        }
        for league_id in LEAGUE_ORDER
    ]
    return {"season": season, "leagues": leagues, "without_team": without_team}


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
        # OPS = 出塁率 + 長打率。丸める前の値を足してから丸める (丸めた2つを足すと1桁ずれることがあるため)
        "OPS": round(on_base_percentage(stats) + slugging_percentage(stats), 3),
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
        # 種類つきの注意を1回だけ作り、warnings はその message から作る (2つの欄がずれないように)
        items = [
            WarningItem(code=code, message=message)
            for code, message in stats_warning_items(names[bid], stats_model)
        ]
        result[bid] = BatterMetrics(
            PA=stats.PA,
            H=stats.H,
            HR=stats.HR,
            SB=stats.SB,
            CS=stats.CS,
            AVG=avg,
            OBP=obp,
            SLG=slg,
            OPS=obp + slg if obp is not None and slg is not None else None,
            BB_pct=stats.BB / stats.PA,  # PA は検証で1以上
            SO_pct=stats.SO / stats.PA,
            warnings=[item.message for item in items],
            warning_items=items,
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
