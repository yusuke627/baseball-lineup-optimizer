"""
scripts/build_lahman_presets.py のテスト。
ここで使う成績・選手ID・球団は、集計の動作を確かめるための合成データで、実在の選手・球団の記録ではない。
"""
import csv
import importlib.util
import json
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
        _row("aaa01", 1, "TAA", G=50, AB=200, H=60, HR=10, BB=20, SO=40, SB=3, CS=1, GIDP=4),
        _row("aaa01", 2, "TBB", G=60, AB=250, H=70, HR=12, BB=25, SO=50, SB=2, CS=0, GIDP=5),
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
        _row("aaa01", 1, "TAA", AB=100),
        _row("aaa01", 1, "TAA", year=2024, AB=999),
        _row("bbb01", 1, "TAA", AB=50),
    ]
    players = lahman.aggregate_batting(rows, 2025)
    assert set(players) == {"aaa01", "bbb01"}
    assert players["aaa01"].totals["AB"] == 100


def test_blank_cell_makes_the_total_missing_instead_of_zero():
    rows = [
        _row("aaa01", 1, "TAA", AB=100, GIDP=3),
        _row("aaa01", 2, "TBB", AB=100, GIDP=None),  # この stint だけ空欄
    ]
    player = lahman.aggregate_batting(rows, 2025)["aaa01"]
    assert player.totals["GIDP"] is None
    assert player.missing_columns == ["GIDP"]
    assert lahman.preset_stats(player) is None  # 必要な項目が欠けているのでプリセットにしない


def test_blank_in_a_column_not_used_by_presets_does_not_block():
    # IBB はプリセットの項目に無い
    player = lahman.aggregate_batting([_row("aaa01", 1, "TAA", AB=100, IBB=None)], 2025)["aaa01"]
    assert player.missing_columns == ["IBB"]
    assert lahman.preset_stats(player) is not None


# ---- PA の算出 ----

def test_pa_is_ab_plus_bb_hbp_sf_sh():
    rows = [
        _row("aaa01", 1, "TAA", AB=300, BB=30, HBP=5, SF=4, SH=2),
        _row("aaa01", 2, "TBB", AB=200, BB=20, HBP=1, SF=3, SH=0),
    ]
    player = lahman.aggregate_batting(rows, 2025)["aaa01"]
    assert player.pa == 500 + 50 + 6 + 7 + 2
    assert lahman.preset_stats(player)["PA"] == 565


def test_pa_is_none_when_a_component_is_missing():
    player = lahman.aggregate_batting([_row("aaa01", 1, "TAA", AB=100, SF=None)], 2025)["aaa01"]
    assert player.pa is None


def test_preset_stats_have_the_14_keys():
    player = lahman.aggregate_batting([_row("aaa01", 1, "TAA", AB=100, H=30)], 2025)["aaa01"]
    assert list(lahman.preset_stats(player)) == list(lahman.PRESET_STAT_KEYS)


# ---- 最終所属の球団 ----

def test_final_team_is_the_team_of_the_last_stint():
    # CSV の行の順番ではなく、stint の番号で決める
    rows = [_row("aaa01", 2, "TBB"), _row("aaa01", 1, "TAA"), _row("aaa01", 3, "TCC")]
    player = lahman.aggregate_batting(rows, 2025)["aaa01"]
    assert player.final_team == "TCC"
    assert player.teams_played == ["TAA", "TBB", "TCC"]


def test_single_team_player():
    player = lahman.aggregate_batting([_row("aaa01", 1, "TAA")], 2025)["aaa01"]
    assert player.final_team == "TAA"
    assert player.teams_played == ["TAA"]


def test_returning_to_the_first_team_is_listed_again():
    rows = [_row("aaa01", 1, "TAA"), _row("aaa01", 2, "TBB"), _row("aaa01", 3, "TAA")]
    player = lahman.aggregate_batting(rows, 2025)["aaa01"]
    assert player.final_team == "TAA"
    assert player.teams_played == ["TAA", "TBB", "TAA"]


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
        _row("aaa01", 1, "TAA", AB=180, H=50, BB=20, SO=30),           # PA 200、1球団
        _row("bbb01", 1, "TAA", AB=100, H=30, BB=10),
        _row("bbb01", 2, "TBB", AB=100, H=30, BB=10),                  # PA 220、2球団
        _row("ccc01", 1, "TBB", AB=50, H=10),                          # PA 50 (対象外)
    ]
    _write_csv(raw / "Batting.csv", COLUMNS, batting)
    _write_csv(raw / "People.csv", ["playerID", "nameFirst", "nameLast"], [
        {"playerID": "aaa01", "nameFirst": "Test", "nameLast": "One"},
        {"playerID": "bbb01", "nameFirst": "Test", "nameLast": "Two"},
        {"playerID": "ccc01", "nameFirst": "Test", "nameLast": "Three"},
    ])
    _write_csv(raw / "Teams.csv", ["yearID", "teamID", "name"], [
        {"yearID": "2025", "teamID": "TAA", "name": "Test Team One"},
        {"yearID": "2025", "teamID": "TBB", "name": "Test Team Two"},
    ])
    preset_dir = tmp_path / "presets"
    preset_dir.mkdir()
    before = sorted(p.name for p in tmp_path.rglob("*"))

    report = lahman.dry_run(raw, 2025, 200, preset_dir)

    assert "PA >= 200 の選手: 2人" in report
    assert "複数の球団に在籍した選手: 1人" in report
    assert "TAA Test Team One: 1" in report
    assert "TBB Test Team Two: 1" in report  # 移籍した選手は最終所属の球団に数える
    assert sorted(p.name for p in tmp_path.rglob("*")) == before  # ファイルは作らない


def _write_raw(raw: Path, batting: list[dict[str, str]]) -> None:
    raw.mkdir()
    _write_csv(raw / "Batting.csv", COLUMNS, batting)
    _write_csv(raw / "People.csv", ["playerID", "nameFirst", "nameLast"], [
        {"playerID": "aaa01", "nameFirst": "Test", "nameLast": "One"},
        {"playerID": "bbb01", "nameFirst": "Test", "nameLast": "Two"},
        {"playerID": "ccc01", "nameFirst": "Test", "nameLast": "Two"},  # 同じ名前の別の選手
        {"playerID": "judgeaa01", "nameFirst": "Excluded", "nameLast": "Player"},
    ])
    _write_csv(raw / "Teams.csv", ["yearID", "lgID", "teamID", "name"], [
        {"yearID": "2025", "lgID": "AL", "teamID": "TAA", "name": "Test Team One"},
        {"yearID": "2025", "lgID": "NL", "teamID": "TBB", "name": "Test Team Two"},
    ])
    (raw / "readme2025.txt").write_text("Test Database\nRelease Date: Jan 1, 2026\n", encoding="utf-8")


SYNTHETIC_BATTING = [
    _row("aaa01", 1, "TAA", AB=180, H=50, BB=20, SO=30),       # PA 200、1球団
    _row("bbb01", 1, "TAA", AB=100, H=30, BB=10),
    _row("bbb01", 2, "TBB", AB=100, H=30, BB=10),              # PA 220、TAA → TBB
    _row("ccc01", 1, "TBB", AB=190, H=40, BB=15),              # PA 205
    _row("judgeaa01", 1, "TAA", AB=500, H=150, BB=50),         # 照合済みのプリセットがあるので作らない
    _row("ddd01", 1, "TBB", AB=50, H=10),                      # PA 50、対象外
]


def test_generate_writes_one_file_per_player_named_by_player_id(tmp_path):
    raw = tmp_path / "raw"
    _write_raw(raw, SYNTHETIC_BATTING)
    out = tmp_path / "out"

    paths = lahman.generate(raw, 2025, 200, out, "2026-01-02")

    assert sorted(p.name for p in paths) == ["aaa01_2025.json", "bbb01_2025.json", "ccc01_2025.json"]
    assert sorted(p.name for p in out.iterdir()) == sorted(p.name for p in paths)


def test_generated_preset_contents(tmp_path):
    raw = tmp_path / "raw"
    _write_raw(raw, SYNTHETIC_BATTING)
    out = tmp_path / "out"
    lahman.generate(raw, 2025, 200, out, "2026-01-02")

    single = json.loads((out / "aaa01_2025.json").read_text(encoding="utf-8"))
    assert list(single) == ["id", "name", "team", "season", "league", "verified", "source", "team_info", "stats"]
    assert single["id"] == "aaa01_2025"
    assert single["name"] == "Test One"
    assert single["team"] == "Test Team One"
    assert single["verified"] is False
    assert single["source"]["url"] == "https://sabr.org/lahman-database/"
    assert single["source"]["retrieved_at"] == "2026-01-02"
    assert "独立した第二出典との照合は未実施" in single["source"]["note"]
    assert "Release Date: Jan 1, 2026" in single["source"]["note"]
    # 対応表に無い球団は、Lahman の teamID をそのままコードにする
    assert single["team_info"] == {"code": "TAA", "name": "Test Team One", "league": "AL", "lahman_id": "TAA"}
    assert "teams_played" not in single  # 1球団だけの選手には書かない
    assert single["stats"]["PA"] == 200
    assert list(single["stats"]) == list(lahman.PRESET_STAT_KEYS)

    moved = json.loads((out / "bbb01_2025.json").read_text(encoding="utf-8"))
    assert moved["team_info"]["code"] == "TBB"  # 最終所属
    assert moved["teams_played"] == [
        {"code": "TAA", "name": "Test Team One"},
        {"code": "TBB", "name": "Test Team Two"},
    ]
    assert moved["stats"]["AB"] == 200  # 2球団の合計

    # 同じ名前の別の選手も、ID (playerID) が違うので別のファイルになる
    same_name = json.loads((out / "ccc01_2025.json").read_text(encoding="utf-8"))
    assert same_name["name"] == moved["name"] == "Test Two"
    assert same_name["id"] != moved["id"]


# ---- 球団コードの統一 ----

def test_team_code_table_matches_the_users_choice():
    # 利用者が指定した表記 (2026-10-14)。変えるときは README・DESIGN の記載も直す
    assert lahman.TEAM_CODE_BY_LAHMAN_ID == {
        "ARI": "AZ", "CHA": "CWS", "CHN": "CHC", "KCA": "KC", "LAA": "LAA", "LAN": "LAD",
        "NYA": "NYY", "NYN": "NYM", "SDN": "SD", "SFN": "SF", "SLN": "STL", "TBA": "TB", "WAS": "WSH",
    }


def test_team_codes_in_the_table_do_not_collide():
    codes = list(lahman.TEAM_CODE_BY_LAHMAN_ID.values())
    assert len(codes) == len(set(codes))
    # 変換後のコードが、対応表に無い (そのまま使われる) 別の球団の teamID と重ならないこと。
    # 変換前の teamID と同じ値になるのは、同じ球団 (LAA) だけ
    for lahman_id, code in lahman.TEAM_CODE_BY_LAHMAN_ID.items():
        if code in lahman.TEAM_CODE_BY_LAHMAN_ID:
            assert code == lahman_id


def test_team_code_falls_back_to_lahman_id():
    assert lahman.team_code("NYA") == "NYY"
    assert lahman.team_code("SDN") == "SD"
    assert lahman.team_code("BOS") == "BOS"  # 対応表に無い球団は、そのまま


def test_generated_presets_use_the_unified_team_codes(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    _write_csv(raw / "Batting.csv", COLUMNS, [
        _row("aaa01", 1, "NYA", AB=180, H=50, BB=20),
        _row("bbb01", 1, "SDN", AB=100, H=30, BB=10),
        _row("bbb01", 2, "NYN", AB=100, H=30, BB=10),
    ])
    _write_csv(raw / "People.csv", ["playerID", "nameFirst", "nameLast"], [
        {"playerID": "aaa01", "nameFirst": "Test", "nameLast": "One"},
        {"playerID": "bbb01", "nameFirst": "Test", "nameLast": "Two"},
    ])
    _write_csv(raw / "Teams.csv", ["yearID", "lgID", "teamID", "name"], [
        {"yearID": "2025", "lgID": "AL", "teamID": "NYA", "name": "Test Name A"},
        {"yearID": "2025", "lgID": "NL", "teamID": "SDN", "name": "Test Name B"},
        {"yearID": "2025", "lgID": "NL", "teamID": "NYN", "name": "Test Name C"},
    ])
    out = tmp_path / "out"
    lahman.generate(raw, 2025, 200, out, "2026-01-02")

    one = json.loads((out / "aaa01_2025.json").read_text(encoding="utf-8"))
    assert one["team_info"] == {"code": "NYY", "name": "Test Name A", "league": "AL", "lahman_id": "NYA"}
    two = json.loads((out / "bbb01_2025.json").read_text(encoding="utf-8"))
    assert two["team_info"]["code"] == "NYM"
    assert two["team_info"]["lahman_id"] == "NYN"
    assert two["teams_played"] == [
        {"code": "SD", "name": "Test Name B"},
        {"code": "NYM", "name": "Test Name C"},
    ]


def test_generated_presets_pass_the_preset_schema(tmp_path):
    from tests.test_preset_schema import check_preset

    raw = tmp_path / "raw"
    _write_raw(raw, SYNTHETIC_BATTING)
    for path in lahman.generate(raw, 2025, 200, tmp_path / "out", "2026-01-02"):
        check_preset(json.loads(path.read_text(encoding="utf-8")))


def test_generate_is_reproducible_with_lf_and_trailing_newline(tmp_path):
    raw = tmp_path / "raw"
    _write_raw(raw, SYNTHETIC_BATTING)
    first = {p.name: p.read_bytes() for p in lahman.generate(raw, 2025, 200, tmp_path / "a", "2026-01-02")}
    second = {p.name: p.read_bytes() for p in lahman.generate(raw, 2025, 200, tmp_path / "b", "2026-01-02")}
    assert first == second
    for content in first.values():
        assert b"\r\n" not in content
        assert content.endswith(b"}\n")
        assert not content.endswith(b"\n\n")


def test_generate_writes_nothing_when_a_player_fails_validation(tmp_path):
    raw = tmp_path / "raw"
    bad = [*SYNTHETIC_BATTING, _row("eee01", 1, "TAA", AB=200, H=201)]  # 安打が打数より多い
    _write_raw(raw, bad)
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="eee01"):
        lahman.generate(raw, 2025, 200, out, "2026-01-02")
    assert not out.exists()


def test_sample_is_fixed_by_the_seed():
    players = [lahman.PlayerSeason(player_id=f"p{i:03d}") for i in range(50)]
    first = [p.player_id for p in lahman.sample_players(players, 10, seed=2025)]
    again = [p.player_id for p in lahman.sample_players(players, 10, seed=2025)]
    other = [p.player_id for p in lahman.sample_players(players, 10, seed=1)]
    assert first == again
    assert len(first) == 10
    assert first == sorted(first)
    assert first != other


def test_main_generate_requires_retrieved_at(tmp_path, capsys):
    raw = tmp_path / "raw"
    _write_raw(raw, SYNTHETIC_BATTING)
    out = tmp_path / "out"
    assert lahman.main(["--raw", str(raw), "--generate", "--output", str(out)]) == 2
    assert "--retrieved-at" in capsys.readouterr().err
    assert lahman.main(["--raw", str(raw), "--generate", "--output", str(out), "--retrieved-at", "2026/01/02"]) == 2
    assert not out.exists()


def test_main_refuses_to_run_without_dry_run(capsys):
    assert lahman.main(["--raw", "nowhere"]) == 2
    assert "--dry-run" in capsys.readouterr().err


def test_main_reports_missing_raw_files(tmp_path, capsys):
    assert lahman.main(["--raw", str(tmp_path), "--dry-run"]) == 1
    assert "Batting.csv" in capsys.readouterr().err
