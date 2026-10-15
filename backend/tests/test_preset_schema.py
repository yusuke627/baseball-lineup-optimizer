import copy
import json
from pathlib import Path

import jsonschema
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA_PATH = REPO_ROOT / "schemas" / "batter_preset.schema.json"
PRESET_DIR = REPO_ROOT / "data" / "presets"

with open(SCHEMA_PATH, encoding="utf-8") as f:
    SCHEMA = json.load(f)

# 検証器は1回だけ作って使い回す。jsonschema.validate() は呼ぶたびにスキーマ自体の検査からやり直すため、
# プリセットが数百件あると遅い (docs/DESIGN.md 2-4 に測定値)
jsonschema.Draft7Validator.check_schema(SCHEMA)
VALIDATOR = jsonschema.Draft7Validator(SCHEMA)


def _all_preset_files():
    if not PRESET_DIR.exists():
        return []
    return sorted(PRESET_DIR.rglob("*.json"))


def check_preset(data: dict) -> None:
    """プリセット1件を検証する。スキーマに加えて、スキーマでは書けない決まりも確認する"""
    VALIDATOR.validate(data)
    reference = data.get("reference_metrics")
    if reference is not None and reference["season"] != data["season"]:
        raise ValueError(
            f"reference_metrics.season ({reference['season']}) が season ({data['season']}) と違います"
        )
    teams_played = data.get("teams_played")
    if teams_played is not None:
        team_info = data.get("team_info")
        if team_info is None:
            raise ValueError("teams_played があるのに team_info がありません")
        if teams_played[-1]["code"] != team_info["code"]:
            raise ValueError(
                f"teams_played の最後の球団 ({teams_played[-1]['code']}) が"
                f" team_info.code ({team_info['code']}) と違います"
            )


@pytest.mark.parametrize("preset_path", _all_preset_files(), ids=lambda p: p.name)
def test_preset_matches_schema(preset_path):
    with open(preset_path, encoding="utf-8") as f:
        data = json.load(f)
    check_preset(data)


def test_at_least_one_preset_exists():
    assert len(_all_preset_files()) > 0


# ---- スキーマそのもののテスト ----
# 以下の成績・参考値は、スキーマの動作を確かめるためのテスト用の値で、実在の選手の値ではない。
# data/presets/ には置かない。

DUMMY = {
    "id": "test_dummy_2025",
    "name": "Test Dummy",
    "team": "Test Team",
    "season": 2025,
    "league": "MLB",
    "verified": False,
    "source": {
        "provider": "テスト用",
        "url": "https://example.com/stats",
        "retrieved_at": "2026-01-01",
    },
    "stats": {
        "PA": 600, "AB": 540, "H": 150, "2B": 30, "3B": 5, "HR": 15, "BB": 40, "HBP": 10,
        "SO": 100, "SF": 5, "SH": 5, "GIDP": 10, "SB": 10, "CS": 3,
    },
}

DUMMY_REFERENCE = {
    "wOBA": 0.345,
    "wRC_plus": 120,
    "season": 2025,
    "source": {"provider": "テスト用の出典", "url": "https://example.com/reference"},
    "retrieved_at": "2026-01-02",
    "note": "テスト用の値",
}


def _dummy(**changes) -> dict:
    data = copy.deepcopy(DUMMY)
    data.update(copy.deepcopy(changes))
    return data


def _with_reference(**changes) -> dict:
    """参考値つきのダミー。値に None を渡した欄は取り除く"""
    reference = copy.deepcopy(DUMMY_REFERENCE)
    for key, value in changes.items():
        if value is None:
            reference.pop(key)
        else:
            reference[key] = copy.deepcopy(value)
    return _dummy(reference_metrics=reference)


def test_preset_without_reference_metrics_is_valid():
    check_preset(_dummy())


def test_preset_with_reference_metrics_is_valid():
    check_preset(_with_reference())


@pytest.mark.parametrize("only", ["wOBA", "wRC_plus"])
def test_reference_metrics_may_have_only_one_of_the_two_values(only):
    other = "wRC_plus" if only == "wOBA" else "wOBA"
    check_preset(_with_reference(**{other: None}))


def test_reference_metrics_note_is_optional():
    check_preset(_with_reference(note=None))


@pytest.mark.parametrize(
    "changes",
    [
        {"wOBA": None, "wRC_plus": None},          # 値が1つも無い
        {"season": None},                          # 対象シーズンが無い
        {"source": None},                          # 出典が無い
        {"retrieved_at": None},                    # 取得日が無い
        {"source": {"provider": "出典名"}},        # 出典のURLが無い
        {"source": {"url": "https://example.com/"}},  # 出典名が無い
        {"source": {"provider": "", "url": "https://example.com/"}},  # 出典名が空
        {"source": {"provider": "出典名", "url": "http://example.com/"}},   # https でない
        {"source": {"provider": "出典名", "url": "javascript:alert(1)"}},   # https でない
        {"source": {"provider": "出典名", "url": " https://example.com/"}},  # 先頭に空白
        {"retrieved_at": "2026/01/02"},            # 日付の形式が違う
        {"wOBA": "0.345"},                         # 数値でない
        {"wOBA": -0.1},                            # 負の値
        {"wRC_plus": "120"},                       # 数値でない
    ],
    ids=lambda c: json.dumps(c, ensure_ascii=False),
)
def test_invalid_reference_metrics_are_rejected(changes):
    with pytest.raises(jsonschema.ValidationError):
        check_preset(_with_reference(**changes))


@pytest.mark.parametrize("wrong_key", ["wRC+", "woba", "wrc_plus", "verified"])
def test_reference_metrics_rejects_unknown_keys(wrong_key):
    # キーの書き間違いに気づけるよう、知らないキーはエラーにする
    data = _with_reference()
    data["reference_metrics"][wrong_key] = 1
    with pytest.raises(jsonschema.ValidationError):
        check_preset(data)


def test_reference_metrics_season_must_match_preset_season():
    with pytest.raises(ValueError, match="season"):
        check_preset(_with_reference(season=2024))


@pytest.mark.parametrize("wrong_key", ["reference_metric", "referenceMetrics", "summary"])
def test_preset_rejects_unknown_top_level_keys(wrong_key):
    # reference_metrics の書き間違いが、無視されずにエラーになることを確かめる
    with pytest.raises(jsonschema.ValidationError):
        check_preset(_dummy(**{wrong_key: copy.deepcopy(DUMMY_REFERENCE)}))


def test_preset_requires_pa_of_at_least_one():
    # API (BatterCountStats) と同じく、PA は1以上
    data = _dummy()
    data["stats"]["PA"] = 0
    with pytest.raises(jsonschema.ValidationError):
        check_preset(data)


TEAM_INFO = {"code": "TBB", "name": "Test Team Two", "league": "AL"}
TEAMS_PLAYED = [{"code": "TAA", "name": "Test Team One"}, {"code": "TBB", "name": "Test Team Two"}]


def test_preset_with_team_info_is_valid():
    check_preset(_dummy(team_info=TEAM_INFO))


def test_team_info_may_have_lahman_id():
    check_preset(_dummy(team_info=dict(TEAM_INFO, lahman_id="XBB")))


@pytest.mark.parametrize("division", ["E", "C", "W"])
def test_team_info_may_have_division(division):
    check_preset(_dummy(team_info=dict(TEAM_INFO, division=division)))


def test_team_codes_are_consistent_across_presets():
    """実際のプリセット全体で、球団コード・球団名・Lahman の teamID の対応が1対1になっていること"""
    names_by_code: dict[str, set[str]] = {}
    lahman_by_code: dict[str, set[str]] = {}
    codes_by_lahman: dict[str, set[str]] = {}
    for path in _all_preset_files():
        data = json.loads(path.read_text(encoding="utf-8"))
        info = data.get("team_info")
        if info is None:
            continue
        key = (data["season"], info["code"])
        names_by_code.setdefault(str(key), set()).add(info["name"])
        for item in data.get("teams_played", []):
            names_by_code.setdefault(str((data["season"], item["code"])), set()).add(item["name"])
        if "lahman_id" in info:
            lahman_by_code.setdefault(str(key), set()).add(info["lahman_id"])
            codes_by_lahman.setdefault(str((data["season"], info["lahman_id"])), set()).add(info["code"])
    assert {k: v for k, v in names_by_code.items() if len(v) > 1} == {}
    assert {k: v for k, v in lahman_by_code.items() if len(v) > 1} == {}
    assert {k: v for k, v in codes_by_lahman.items() if len(v) > 1} == {}


def test_preset_with_teams_played_is_valid():
    check_preset(_dummy(team_info=TEAM_INFO, teams_played=TEAMS_PLAYED))


def test_preset_may_return_to_an_earlier_team():
    played = [*TEAMS_PLAYED, {"code": "TAA", "name": "Test Team One"}]
    check_preset(_dummy(team_info=dict(TEAM_INFO, code="TAA", name="Test Team One"), teams_played=played))


def test_teams_played_requires_team_info():
    with pytest.raises(ValueError, match="team_info"):
        check_preset(_dummy(teams_played=TEAMS_PLAYED))


def test_last_team_played_must_match_team_info():
    with pytest.raises(ValueError, match="最後の球団"):
        check_preset(_dummy(team_info=dict(TEAM_INFO, code="TAA"), teams_played=TEAMS_PLAYED))


@pytest.mark.parametrize(
    "team_info",
    [
        {"code": "TAA", "name": "Test Team"},                                  # league が無い
        {"code": "", "name": "Test Team", "league": "AL"},                    # code が空
        {"code": "nyy", "name": "Test Team", "league": "AL"},                 # 小文字
        {"code": "N", "name": "Test Team", "league": "AL"},                   # 1文字
        {"code": "NYYY", "name": "Test Team", "league": "AL"},                # 4文字
        {"code": "N1", "name": "Test Team", "league": "AL"},                  # 数字
        {"code": "TAA", "name": "Test Team", "league": "AL", "lahman_id": ""},  # lahman_id が空
        {"code": "TAA", "name": "Test Team", "league": "AL", "division": "N"},  # 知らない地区
        {"code": "TAA", "name": "Test Team", "league": "AL", "division": "e"},  # 小文字
        {"code": "TAA", "name": "Test Team", "league": "XX"},                  # 知らないリーグ
        {"code": "TAA", "name": "Test Team", "league": "AL", "city": "Test"},  # 知らないキー
    ],
    ids=lambda t: json.dumps(t, ensure_ascii=False),
)
def test_invalid_team_info_is_rejected(team_info):
    with pytest.raises(jsonschema.ValidationError):
        check_preset(_dummy(team_info=team_info))


@pytest.mark.parametrize(
    "teams_played",
    [
        [{"code": "TBB", "name": "Test Team Two"}],                             # 1球団だけ
        [{"code": "TAA"}, {"code": "TBB", "name": "Test Team Two"}],             # name が無い
        ["TAA", "TBB"],                                                          # 文字列の配列
    ],
    ids=lambda t: json.dumps(t, ensure_ascii=False),
)
def test_invalid_teams_played_is_rejected(teams_played):
    with pytest.raises(jsonschema.ValidationError):
        check_preset(_dummy(team_info=TEAM_INFO, teams_played=teams_played))


def test_source_note_is_optional_text():
    data = _dummy()
    data["source"]["note"] = "テスト用の補足"
    check_preset(data)
    data["source"]["note"] = 1
    with pytest.raises(jsonschema.ValidationError):
        check_preset(data)


@pytest.mark.parametrize("value", ["2026/01/01", "2026-1-1", "20260101", "2026-01-01T00:00:00", " 2026-01-01", ""])
def test_preset_source_retrieved_at_must_be_yyyy_mm_dd(value):
    # "format": "date" は jsonschema.validate では検査されないため、pattern で形式を確かめる
    data = _dummy()
    data["source"]["retrieved_at"] = value
    with pytest.raises(jsonschema.ValidationError):
        check_preset(data)


@pytest.mark.parametrize("value", ["2026/01/02", "2026-1-2", "20260102", "2026-01-02 ", ""])
def test_reference_metrics_retrieved_at_must_be_yyyy_mm_dd(value):
    with pytest.raises(jsonschema.ValidationError):
        check_preset(_with_reference(retrieved_at=value))


@pytest.mark.parametrize("url", ["http://example.com/", "ftp://example.com/", "javascript:alert(1)"])
def test_preset_source_url_must_be_https(url):
    data = _dummy()
    data["source"]["url"] = url
    with pytest.raises(jsonschema.ValidationError):
        check_preset(data)
