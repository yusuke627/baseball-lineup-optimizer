"""
scripts/build_lahman_presets.py のテスト。
ここで使う成績・選手ID・球団は、集計の動作を確かめるための合成データで、実在の選手・球団の記録ではない。
"""
import csv
import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "build_lahman_presets.py"

_spec = importlib.util.spec_from_file_location("build_lahman_presets", SCRIPT_PATH)
assert _spec is not None and _spec.loader is not None
lahman = importlib.util.module_from_spec(_spec)
# dataclass は実行中のモジュールを sys.modules から探すので、実行前に登録しておく
sys.modules[_spec.name] = lahman
_spec.loader.exec_module(lahman)

COLUMNS = ["playerID", "yearID", "stint", "teamID", "lgID", *lahman.SUM_COLUMNS]


def _row(player_id: str, stint: int, team: str, year: int = 2025, **values) -> dict[str, str]:
    """Batting.csv の1行 (文字列)。指定しない列は "0"、None を渡した列は空欄"""
    row = {"playerID": player_id, "yearID": str(year), "stint": str(stint), "teamID": team, "lgID": "XX"}
    for col in lahman.SUM_COLUMNS:
        value = values.get(col, 0)
        row[col] = "" if value is None else str(value)
    return row


# ---- stint の合算 ----

def test_stints_of_the_same_player_are_summed():
    rows = [
        _row("aaa01", 1, "T1", G=50, AB=200, H=60, HR=10, BB=20, SO=40, SB=3, CS=1, GIDP=4),
        _row("aaa01", 2, "T2", G=60, AB=250, H=70, HR=12, BB=25, SO=50, SB=2, CS=0, GIDP=5),
    ]
    totals = lahman.aggregate_batting(rows, 2025)["aaa01"].totals
    assert totals["G"] == 110
    assert totals["AB"] == 450
    assert totals["H"] == 130
    assert totals["HR"] == 22
    assert totals["BB"] == 45
    assert totals["SO"] == 90
    assert totals["SB"] == 5
    assert totals["CS"] == 1
    assert totals["GIDP"] == 9


def test_other_seasons_and_other_players_are_not_mixed():
    rows = [
        _row("aaa01", 1, "T1", AB=100),
        _row("aaa01", 1, "T1", year=2024, AB=999),
        _row("bbb01", 1, "T1", AB=50),
    ]
    players = lahman.aggregate_batting(rows, 2025)
    assert set(players) == {"aaa01", "bbb01"}
    assert players["aaa01"].totals["AB"] == 100


def test_blank_cell_makes_the_total_missing_instead_of_zero():
    rows = [
        _row("aaa01", 1, "T1", AB=100, GIDP=3),
        _row("aaa01", 2, "T2", AB=100, GIDP=None),  # この stint だけ空欄
    ]
    player = lahman.aggregate_batting(rows, 2025)["aaa01"]
    assert player.totals["GIDP"] is None
    assert player.missing_columns == ["GIDP"]
    assert lahman.preset_stats(player) is None  # 必要な項目が欠けているのでプリセットにしない


def test_blank_in_a_column_not_used_by_presets_does_not_block():
    # IBB はプリセットの項目に無い
    player = lahman.aggregate_batting([_row("aaa01", 1, "T1", AB=100, IBB=None)], 2025)["aaa01"]
    assert player.missing_columns == ["IBB"]
    assert lahman.preset_stats(player) is not None


# ---- PA の算出 ----

def test_pa_is_ab_plus_bb_hbp_sf_sh():
    rows = [
        _row("aaa01", 1, "T1", AB=300, BB=30, HBP=5, SF=4, SH=2),
        _row("aaa01", 2, "T2", AB=200, BB=20, HBP=1, SF=3, SH=0),
    ]
    player = lahman.aggregate_batting(rows, 2025)["aaa01"]
    assert player.pa == 500 + 50 + 6 + 7 + 2
    assert lahman.preset_stats(player)["PA"] == 565


def test_pa_is_none_when_a_component_is_missing():
    player = lahman.aggregate_batting([_row("aaa01", 1, "T1", AB=100, SF=None)], 2025)["aaa01"]
    assert player.pa is None


def test_preset_stats_have_the_14_keys():
    player = lahman.aggregate_batting([_row("aaa01", 1, "T1", AB=100, H=30)], 2025)["aaa01"]
    assert list(lahman.preset_stats(player)) == list(lahman.PRESET_STAT_KEYS)


# ---- 最終所属の球団 ----

def test_final_team_is_the_team_of_the_last_stint():
    # CSV の行の順番ではなく、stint の番号で決める
    rows = [_row("aaa01", 2, "T2"), _row("aaa01", 1, "T1"), _row("aaa01", 3, "T3")]
    player = lahman.aggregate_batting(rows, 2025)["aaa01"]
    assert player.final_team == "T3"
    assert player.teams_played == ["T1", "T2", "T3"]


def test_single_team_player():
    player = lahman.aggregate_batting([_row("aaa01", 1, "T1")], 2025)["aaa01"]
    assert player.final_team == "T1"
    assert player.teams_played == ["T1"]


def test_returning_to_the_first_team_is_listed_again():
    rows = [_row("aaa01", 1, "T1"), _row("aaa01", 2, "T2"), _row("aaa01", 3, "T1")]
    player = lahman.aggregate_batting(rows, 2025)["aaa01"]
    assert player.final_team == "T1"
    assert player.teams_played == ["T1", "T2", "T1"]


def test_final_team_requires_a_stint():
    with pytest.raises(ValueError):
        lahman.final_team([])


# ---- 入力検証・比較・dry-run ----

def test_validation_uses_the_api_rules():
    good = {"PA": 100, "AB": 90, "H": 20, "2B": 5, "3B": 0, "HR": 3, "BB": 8, "HBP": 1,
            "SO": 20, "SF": 1, "SH": 0, "GIDP": 2, "SB": 1, "CS": 0}
    assert lahman.validation_errors(good) == []
    assert lahman.validation_errors(dict(good, H=91)) != []  # 安打が打数より多い


def _write_csv(path: Path, header: list[str], rows: list[dict[str, str]]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(rows)


def test_dry_run_reports_without_writing_files(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    batting = [
        _row("aaa01", 1, "T1", AB=180, H=50, BB=20, SO=30),           # PA 200、1球団
        _row("bbb01", 1, "T1", AB=100, H=30, BB=10),
        _row("bbb01", 2, "T2", AB=100, H=30, BB=10),                  # PA 220、2球団
        _row("ccc01", 1, "T2", AB=50, H=10),                          # PA 50 (対象外)
    ]
    _write_csv(raw / "Batting.csv", COLUMNS, batting)
    _write_csv(raw / "People.csv", ["playerID", "nameFirst", "nameLast"], [
        {"playerID": "aaa01", "nameFirst": "Test", "nameLast": "One"},
        {"playerID": "bbb01", "nameFirst": "Test", "nameLast": "Two"},
        {"playerID": "ccc01", "nameFirst": "Test", "nameLast": "Three"},
    ])
    _write_csv(raw / "Teams.csv", ["yearID", "teamID", "name"], [
        {"yearID": "2025", "teamID": "T1", "name": "Test Team One"},
        {"yearID": "2025", "teamID": "T2", "name": "Test Team Two"},
    ])
    preset_dir = tmp_path / "presets"
    preset_dir.mkdir()
    before = sorted(p.name for p in tmp_path.rglob("*"))

    report = lahman.dry_run(raw, 2025, 200, preset_dir)

    assert "PA >= 200 の選手: 2人" in report
    assert "複数の球団に在籍した選手: 1人" in report
    assert "T1 Test Team One: 1" in report
    assert "T2 Test Team Two: 1" in report  # 移籍した選手は最終所属の球団に数える
    assert sorted(p.name for p in tmp_path.rglob("*")) == before  # ファイルは作らない


def test_main_refuses_to_run_without_dry_run(capsys):
    assert lahman.main(["--raw", "nowhere"]) == 2
    assert "--dry-run" in capsys.readouterr().err


def test_main_reports_missing_raw_files(tmp_path, capsys):
    assert lahman.main(["--raw", str(tmp_path), "--dry-run"]) == 1
    assert "Batting.csv" in capsys.readouterr().err
