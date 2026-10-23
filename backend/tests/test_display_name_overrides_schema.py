"""data/overrides/display_names.json (表示名の上書き) の形式の検証。

preset-validation.yml (jsonschema と pytest だけを入れたジョブ) でも動くよう、app やスクリプトは読み込まない。
"""
import copy
import json
from pathlib import Path

import jsonschema
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA_PATH = REPO_ROOT / "schemas" / "display_name_overrides.schema.json"
OVERRIDES_PATH = REPO_ROOT / "data" / "overrides" / "display_names.json"

SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
jsonschema.Draft7Validator.check_schema(SCHEMA)
VALIDATOR = jsonschema.Draft7Validator(SCHEMA)

# 以下の名前・playerID はスキーマの動作を確かめるためのテスト用の値で、実在の選手ではない
ENTRY = {"name": "Test Player Jr.", "checked_at": "2026-01-01", "checked_source": "テスト用"}


def _with(**changes) -> dict:
    entry = copy.deepcopy(ENTRY)
    for key, value in changes.items():
        if value is None:
            entry.pop(key)
        else:
            entry[key] = value
    return {"testpl01": entry}


def test_real_overrides_file_matches_the_schema():
    VALIDATOR.validate(json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")))


def test_real_overrides_file_is_lf_without_bom():
    content = OVERRIDES_PATH.read_bytes()
    assert not content.startswith(b"\xef\xbb\xbf")
    assert b"\r" not in content


@pytest.mark.parametrize("name", [
    "Test Player Jr.", "Test Player Sr.", "Test Player II", "Test Player III", "Test Player IV",
    "Tést Plåyer Jr.",  # 接尾辞より前は People.csv の表記のまま (アクセントつきでもよい)
    "T Jr.",
    "Abcdefghij Klmnopqrst Uvwxyzabcd Efg Jr.",  # 40文字
])
def test_valid_names(name):
    VALIDATOR.validate(_with(name=name))


@pytest.mark.parametrize("name", [
    "Test Player",              # 接尾辞が無い
    "Test Player Jr",           # ピリオドが無い
    "Test Player jr.",          # 小文字
    "Test Player V",            # 対象外の接尾辞
    "Test Player Ⅱ",            # ローマ数字の1文字 (U+2161)
    "Test Player ＩＩ",          # 全角
    "Test Player Jr.",     # 区切りが半角スペースでない
    "Test Player  Jr.",         # 区切りの空白が2つ (末尾の接尾辞の前が空白)
    " Test Player Jr.",         # 先頭に空白
    "Test Player Jr. ",         # 末尾に空白
    "Test\tPlayer Jr.",         # 制御文字
    "Jr.",                      # 接尾辞だけ
    "Abcdefghij Klmnopqrst Uvwxyzabcd Efgh Jr.",  # 41文字
    "",
])
def test_invalid_names_are_rejected(name):
    with pytest.raises(jsonschema.ValidationError):
        VALIDATOR.validate(_with(name=name))


@pytest.mark.parametrize("changes", [
    {"checked_at": None},
    {"checked_source": None},
    {"checked_source": ""},
    {"checked_at": "2026/01/01"},
    {"checked_at": "2026-1-1"},
    {"checked_at": " 2026-01-01"},
    {"source": "テスト"},        # 知らないキー
])
def test_invalid_entries_are_rejected(changes):
    with pytest.raises(jsonschema.ValidationError):
        VALIDATOR.validate(_with(**changes))


def test_note_is_optional_text():
    VALIDATOR.validate(_with(note="テスト用の補足"))
    with pytest.raises(jsonschema.ValidationError):
        VALIDATOR.validate(_with(note=1))


@pytest.mark.parametrize("player_id", ["TestPl01", "testpl", "test pl01", "testpl01_2025", ""])
def test_keys_must_look_like_lahman_player_ids(player_id):
    with pytest.raises(jsonschema.ValidationError):
        VALIDATOR.validate({player_id: copy.deepcopy(ENTRY)})
