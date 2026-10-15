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


def list_seasons(league: str = "mlb") -> list[int]:
    """プリセットのあるシーズンの一覧 (data/presets/<league>/<年>/ に JSON が1つ以上あるもの)。古い順"""
    league_dir = PRESET_DIR / league
    if not league_dir.exists():
        return []
    return sorted(
        int(path.name)
        for path in league_dir.iterdir()
        if path.is_dir() and path.name.isdigit() and any(path.glob("*.json"))
    )


def load_preset(league: str, season: int, preset_id: str) -> dict | None:
    for preset in list_presets(league, season):
        if preset["id"] == preset_id:
            return preset
    return None
