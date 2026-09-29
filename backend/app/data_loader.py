from __future__ import annotations

import json
from pathlib import Path

PRESET_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "presets"


def list_presets(league: str = "mlb", season: int = 2025) -> list[dict]:
    """指定リーグ・年度のプリセット一覧を返す(管理者はJSONファイルを追加するだけでよい)"""
    target_dir = PRESET_DIR / league / str(season)
    if not target_dir.exists():
        return []
    presets = []
    for path in sorted(target_dir.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            presets.append(json.load(f))
    return presets


def load_preset(league: str, season: int, preset_id: str) -> dict | None:
    for preset in list_presets(league, season):
        if preset["id"] == preset_id:
            return preset
    return None
