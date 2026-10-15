"""GET /presets の絞り込み・検索と、GET /presets/seasons・GET /presets/teams のテスト"""
import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import MAX_SEARCH_RESULTS, app

client = TestClient(app)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PRESET_DIR = REPO_ROOT / "data" / "presets" / "mlb" / "2025"

STATS = {
    "PA": 600, "AB": 540, "H": 150, "2B": 30, "3B": 5, "HR": 15, "BB": 40, "HBP": 10,
    "SO": 100, "SF": 5, "SH": 5, "GIDP": 10, "SB": 10, "CS": 3,
}


def _preset(pid: str, name: str, code: str | None, league: str = "AL", **extra) -> dict:
    """テスト用の合成のプリセット (実在の選手・球団の記録ではない)"""
    preset = {
        "id": pid, "name": name, "season": 2025, "league": "MLB",
        "source": {"provider": "テスト用", "url": "https://example.com/", "retrieved_at": "2026-01-01"},
        "stats": dict(STATS),
    }
    if code is not None:
        preset["team_info"] = {"code": code, "name": f"Team {code}", "league": league}
    preset.update(extra)
    return preset


SYNTHETIC = [
    _preset("p1", "Zed Alpha", "AAA"),
    _preset("p2", "Amy Beta", "AAA"),
    _preset("p3", "José Gamma", "BBB", league="NL"),
    # 移籍した選手: 最終所属は CCC。AAA の一覧には出ない
    _preset("p4", "Moved Delta", "CCC", league="NL",
            teams_played=[{"code": "AAA", "name": "Team AAA"}, {"code": "CCC", "name": "Team CCC"}]),
    _preset("p5", "No Team", None),  # team_info の無いプリセット
]


@pytest.fixture
def synthetic(monkeypatch):
    def fake_list_presets(league="mlb", season=2025):
        return copy.deepcopy(SYNTHETIC) if (league, season) == ("mlb", 2025) else []

    monkeypatch.setattr("app.main.list_presets", fake_list_presets)
    monkeypatch.setattr("app.main.list_seasons", lambda league="mlb": [2025] if league == "mlb" else [])


# ---- 互換 (絞り込みなし) ----

def test_without_filters_returns_all_presets_as_a_list(synthetic):
    res = client.get("/presets")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert [p["id"] for p in data] == ["p1", "p2", "p3", "p4", "p5"]  # 従来どおりの順番
    assert all("summary" in p and "reference_metrics" in p for p in data)


def test_empty_query_is_the_same_as_no_query(synthetic):
    assert client.get("/presets", params={"q": "  "}).json() == client.get("/presets").json()


# ---- 球団での絞り込み ----

def test_team_filter_returns_final_team_players_sorted_by_name(synthetic):
    data = client.get("/presets", params={"season": 2025, "team": "AAA"}).json()
    assert data["total"] == 2
    assert [p["name"] for p in data["items"]] == ["Amy Beta", "Zed Alpha"]
    # 移籍した選手 (AAA → CCC) は、移籍前の AAA には出ない
    assert "p4" not in [p["id"] for p in data["items"]]
    assert all("summary" in p for p in data["items"])


def test_moved_player_is_listed_only_under_the_final_team(synthetic):
    data = client.get("/presets", params={"team": "CCC"}).json()
    assert [p["id"] for p in data["items"]] == ["p4"]
    assert data["items"][0]["teams_played"][0]["code"] == "AAA"


def test_unknown_team_returns_empty(synthetic):
    assert client.get("/presets", params={"team": "ZZZ"}).json() == {"total": 0, "items": []}


@pytest.mark.parametrize("team", ["nyy", "N", "NYYY", "N1", ""])
def test_invalid_team_code_is_rejected(synthetic, team):
    assert client.get("/presets", params={"team": team}).status_code == 422


def test_presets_without_team_info_are_not_in_any_team(synthetic):
    for code in ("AAA", "BBB", "CCC"):
        ids = [p["id"] for p in client.get("/presets", params={"team": code}).json()["items"]]
        assert "p5" not in ids


# ---- 名前での検索 ----

def test_query_searches_all_teams_case_and_accent_insensitive(synthetic):
    data = client.get("/presets", params={"q": "jose"}).json()
    assert [p["id"] for p in data["items"]] == ["p3"]
    data = client.get("/presets", params={"q": "A"}).json()  # 名前に "a" を含む全員
    assert data["total"] == 5
    assert [p["name"] for p in data["items"]] == ["Amy Beta", "José Gamma", "Moved Delta", "No Team", "Zed Alpha"]


def test_query_finds_moved_players_and_players_without_team_info(synthetic):
    assert [p["id"] for p in client.get("/presets", params={"q": "moved"}).json()["items"]] == ["p4"]
    assert [p["id"] for p in client.get("/presets", params={"q": "no team"}).json()["items"]] == ["p5"]


def test_query_and_team_can_be_combined(synthetic):
    data = client.get("/presets", params={"q": "a", "team": "AAA"}).json()
    assert [p["id"] for p in data["items"]] == ["p2", "p1"]


def test_query_returns_at_most_the_limit_with_total(monkeypatch):
    many = [_preset(f"m{i:03d}", f"Same Name {i:03d}", "AAA") for i in range(MAX_SEARCH_RESULTS + 7)]
    monkeypatch.setattr("app.main.list_presets", lambda league="mlb", season=2025: copy.deepcopy(many))
    data = client.get("/presets", params={"q": "same"}).json()
    assert MAX_SEARCH_RESULTS == 50
    assert data["total"] == 57
    assert len(data["items"]) == 50
    assert data["items"][0]["name"] == "Same Name 000"
    # 球団だけの絞り込みには上限を設けない
    assert len(client.get("/presets", params={"team": "AAA"}).json()["items"]) == 57


def test_query_longer_than_40_characters_is_rejected(synthetic):
    assert client.get("/presets", params={"q": "a" * 41}).status_code == 422


# ---- シーズン ----

def test_unknown_season_returns_empty(synthetic):
    assert client.get("/presets", params={"season": 1999}).json() == []
    assert client.get("/presets", params={"season": 1999, "team": "AAA"}).json() == {"total": 0, "items": []}
    assert client.get("/presets/teams", params={"season": 1999}).json() == {
        "season": 1999, "leagues": [{"league": "AL", "teams": []}, {"league": "NL", "teams": []}], "without_team": 0,
    }


def test_seasons(synthetic):
    assert client.get("/presets/seasons").json() == {"league": "mlb", "seasons": [2025]}
    assert client.get("/presets/seasons", params={"league": "npb"}).json() == {"league": "npb", "seasons": []}
    assert client.get("/presets/seasons", params={"league": "MLB"}).status_code == 422


# ---- 球団の一覧 ----

def test_teams_grouped_by_league_sorted_by_name_with_counts(synthetic):
    data = client.get("/presets/teams", params={"season": 2025}).json()
    assert [group["league"] for group in data["leagues"]] == ["AL", "NL"]
    assert data["leagues"][0]["teams"] == [{"code": "AAA", "name": "Team AAA", "league": "AL", "count": 2}]
    assert data["leagues"][1]["teams"] == [
        {"code": "BBB", "name": "Team BBB", "league": "NL", "count": 1},
        {"code": "CCC", "name": "Team CCC", "league": "NL", "count": 1},  # 移籍した選手は最終所属だけで数える
    ]
    assert data["without_team"] == 1


# ---- 実際のデータ ----

def test_real_data_team_counts_add_up_to_all_presets():
    total = len(list(PRESET_DIR.glob("*.json")))
    data = client.get("/presets/teams", params={"season": 2025}).json()
    counts = [t["count"] for group in data["leagues"] for t in group["teams"]]
    assert sum(counts) + data["without_team"] == total
    assert len(counts) == 30
    for group in data["leagues"]:
        names = [t["name"] for t in group["teams"]]
        assert names == sorted(names, key=str.casefold)
    assert 2025 in client.get("/presets/seasons").json()["seasons"]


def test_real_data_team_filter_matches_team_counts():
    teams = client.get("/presets/teams", params={"season": 2025}).json()
    for group in teams["leagues"]:
        for team in group["teams"]:
            data = client.get("/presets", params={"season": 2025, "team": team["code"]}).json()
            assert data["total"] == team["count"]
            assert all(p["team_info"]["code"] == team["code"] for p in data["items"])


def test_real_data_search_finds_the_verified_presets():
    judge = client.get("/presets", params={"q": "judge"}).json()
    assert "aaron_judge_2025" in [p["id"] for p in judge["items"]]
    arraez = client.get("/presets", params={"team": "SD"}).json()
    assert "luis_arraez_2025" in [p["id"] for p in arraez["items"]]


def test_real_data_preset_files_are_unchanged_by_the_api():
    # API はファイルを書き換えない (返す値に summary を足すのは、読み込んだ値の写し)
    before = {p.name: p.read_bytes() for p in PRESET_DIR.glob("*.json")}
    client.get("/presets")
    client.get("/presets", params={"team": "NYY"})
    after = {p.name: p.read_bytes() for p in PRESET_DIR.glob("*.json")}
    assert before == after
    assert "summary" not in json.loads(before["aaron_judge_2025.json"])
