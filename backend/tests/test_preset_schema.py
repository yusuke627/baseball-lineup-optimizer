import json
from pathlib import Path

import jsonschema
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA_PATH = REPO_ROOT / "schemas" / "batter_preset.schema.json"
PRESET_DIR = REPO_ROOT / "data" / "presets"


def _all_preset_files():
    if not PRESET_DIR.exists():
        return []
    return sorted(PRESET_DIR.rglob("*.json"))


@pytest.mark.parametrize("preset_path", _all_preset_files(), ids=lambda p: p.name)
def test_preset_matches_schema(preset_path):
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        schema = json.load(f)
    with open(preset_path, encoding="utf-8") as f:
        data = json.load(f)
    jsonschema.validate(instance=data, schema=schema)


def test_at_least_one_preset_exists():
    assert len(_all_preset_files()) > 0
