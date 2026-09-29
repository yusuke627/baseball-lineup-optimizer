from app.core.markov import expected_runs_per_game

# 概算のMLB平均的な打者のイベント確率(検証用のベンチマーク値であり、
# 特定年度の正確なリーグ平均そのものではない点に注意)
LEAGUE_AVERAGE_PROBS = {
    "BB": 0.085,
    "HBP": 0.010,
    "1B": 0.145,
    "2B": 0.043,
    "3B": 0.004,
    "HR": 0.030,
    "SO": 0.225,
    "OUT": 0.429,
    "SF": 0.006,
    "SH": 0.003,
    "GIDP": 0.020,
}


def test_average_lineup_runs_within_plausible_mlb_range():
    lineup = [dict(LEAGUE_AVERAGE_PROBS) for _ in range(9)]
    runs = expected_runs_per_game(lineup)
    # 近年のMLB平均得点はおよそ4.0〜5.0点/試合の範囲に収まることが多い
    assert 3.5 <= runs <= 5.5, f"unexpected expected runs: {runs}"
