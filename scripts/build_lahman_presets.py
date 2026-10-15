"""
Lahman Baseball Database の CSV から、打者のプリセットを作る。

使い方 (リポジトリのルートで):
    # 集計して報告するだけ (ファイルは作らない)
    python scripts/build_lahman_presets.py --raw data/raw/lahman --season 2025 --dry-run
    # 固定のシードで選んだ10人の成績を表にする (公式サイトとの見比べ用。ファイルは作らない)
    python scripts/build_lahman_presets.py --season 2025 --sample
    # プリセットの JSON を作る (取得日は、元データをダウンロードした日)
    python scripts/build_lahman_presets.py --season 2025 --generate \\
        --output data/presets/mlb/2025 --retrieved-at YYYY-MM-DD

- 元データ (Batting.csv, People.csv, Teams.csv) は、利用者がダウンロードして data/raw/ に置く。
  このスクリプトはネットワークから取得しない。data/raw/ は .gitignore でリポジトリから除外している
- 集計の方針は docs/DESIGN.md の「Lahman からの生成方針」を参照
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Batting.csv から合算する列 (stint ごとの行を、選手ごとに足し合わせる)
SUM_COLUMNS = (
    "G", "AB", "R", "H", "2B", "3B", "HR", "RBI", "SB", "CS",
    "BB", "SO", "IBB", "HBP", "SH", "SF", "GIDP",
)
# プリセットの stats に入れる項目 (PA は Lahman に無いので計算する)
PRESET_STAT_KEYS = (
    "PA", "AB", "H", "2B", "3B", "HR", "BB", "HBP", "SO", "SF", "SH", "GIDP", "SB", "CS",
)
# PA = AB + BB + HBP + SF + SH。公式の PA には捕手の打撃妨害なども含まれるため、一致しないことがある
PA_COMPONENTS = ("AB", "BB", "HBP", "SF", "SH")
DEFAULT_MIN_PA = 200

# 別の出典 (Baseball Savant と Baseball-Reference) で照合済みのプリセットが既にある選手。生成しない
EXCLUDED_PLAYER_IDS = frozenset({"judgeaa01", "arraelu01"})

# 生成するプリセットの出典の欄。URL は Lahman の readme に書かれた Web サイト
SOURCE_PROVIDER = "Lahman Baseball Database (SABR)"
SOURCE_URL = "https://sabr.org/lahman-database/"
SOURCE_NOTE = (
    "Lahman Baseball Database から機械的に生成（同じシーズンに複数の球団に在籍した選手は成績を合算し、"
    "PA は AB+BB+HBP+SF+SH で算出）。独立した第二出典との照合は未実施。"
)
# プリセットに書く球団コード。Lahman の teamID と異なる表記にする球団だけを並べる (利用者の指定、2026-10-14)。
# ここに無い球団は、Lahman の teamID をそのまま使う。元の teamID は team_info.lahman_id に残す
TEAM_CODE_BY_LAHMAN_ID = {
    "ARI": "AZ",   # Arizona Diamondbacks
    "CHA": "CWS",  # Chicago White Sox
    "CHN": "CHC",  # Chicago Cubs
    "KCA": "KC",   # Kansas City Royals
    "LAA": "LAA",  # Los Angeles Angels of Anaheim (teamID と同じ。teamIDretro は ANA)
    "LAN": "LAD",  # Los Angeles Dodgers
    "NYA": "NYY",  # New York Yankees
    "NYN": "NYM",  # New York Mets
    "SDN": "SD",   # San Diego Padres
    "SFN": "SF",   # San Francisco Giants
    "SLN": "STL",  # St. Louis Cardinals
    "TBA": "TB",   # Tampa Bay Rays
    "WAS": "WSH",  # Washington Nationals
}


def team_code(lahman_id: str) -> str:
    """プリセットに書く球団コード (TEAM_CODE_BY_LAHMAN_ID に無ければ Lahman の teamID のまま)"""
    return TEAM_CODE_BY_LAHMAN_ID.get(lahman_id, lahman_id)


DEFAULT_SAMPLE_SIZE = 10
DEFAULT_SAMPLE_SEED = 2025


@dataclass
class PlayerSeason:
    """1人の選手の、1シーズン分の打撃成績 (全 stint の合計)"""

    player_id: str
    # 合算した値。どこかの stint で空欄だった列は None (合計できないため)
    totals: dict[str, int | None] = field(default_factory=dict)
    # (stint, teamID) の組。stint の小さい順
    stints: list[tuple[int, str]] = field(default_factory=list)

    @property
    def missing_columns(self) -> list[str]:
        return [col for col in SUM_COLUMNS if self.totals.get(col) is None]

    @property
    def pa(self) -> int | None:
        return compute_pa(self.totals)

    @property
    def final_team(self) -> str:
        return final_team(self.stints)

    @property
    def teams_played(self) -> list[str]:
        return teams_played(self.stints)


def read_csv(path: Path) -> list[dict[str, str]]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def parse_count(text: str) -> int | None:
    """CSV の1つの値を整数にする。空欄 (前後の空白のみを含む) は None"""
    text = text.strip()
    if text == "":
        return None
    return int(text)


def aggregate_batting(rows: list[dict[str, str]], season: int) -> dict[str, PlayerSeason]:
    """
    Batting.csv の行から、指定シーズンの選手ごとの合計を作る。
    stint (同じシーズンに複数の球団に在籍した場合の、在籍ごとの行) を合算する。
    ある列が、どれか1つの stint で空欄なら、その列の合計は None にする (0 とはみなさない)。
    """
    players: dict[str, PlayerSeason] = {}
    for row in rows:
        if int(row["yearID"]) != season:
            continue
        player = players.setdefault(
            row["playerID"],
            PlayerSeason(player_id=row["playerID"], totals={col: 0 for col in SUM_COLUMNS}),
        )
        for col in SUM_COLUMNS:
            value = parse_count(row.get(col, ""))
            current = player.totals[col]
            player.totals[col] = None if value is None or current is None else current + value
        player.stints.append((int(row["stint"]), row["teamID"]))
    for player in players.values():
        player.stints.sort()
    return players


def compute_pa(totals: dict[str, int | None]) -> int | None:
    """PA = AB + BB + HBP + SF + SH。どれかが欠けていれば None"""
    parts = [totals.get(col) for col in PA_COMPONENTS]
    if any(part is None for part in parts):
        return None
    return sum(part for part in parts if part is not None)


def final_team(stints: list[tuple[int, str]]) -> str:
    """最終所属の球団 = stint の番号が最も大きい行の teamID"""
    if not stints:
        raise ValueError("stint がありません")
    return max(stints)[1]


def teams_played(stints: list[tuple[int, str]]) -> list[str]:
    """
    在籍した球団の一覧 (stint の順)。続けて同じ球団が並ぶ場合は1つにまとめる。
    いったん移籍して同じシーズンに元の球団へ戻った場合は、戻った球団をもう一度並べる (例: A, B, A)
    """
    result: list[str] = []
    for _, team in sorted(stints):
        if not result or result[-1] != team:
            result.append(team)
    return result


def preset_stats(player: PlayerSeason) -> dict[str, int] | None:
    """プリセットの stats の形 (14項目) にする。必要な列が欠けていれば None"""
    pa = player.pa
    if pa is None:
        return None
    stats: dict[str, int] = {"PA": pa}
    for key in PRESET_STAT_KEYS[1:]:
        value = player.totals.get(key)
        if value is None:
            return None
        stats[key] = value
    return stats


def validation_errors(stats: dict[str, int]) -> list[str]:
    """API と同じ入力検証 (backend/app/schemas/batter.py の BatterCountStats) を適用し、エラーの文を返す"""
    sys.path.insert(0, str(REPO_ROOT / "backend"))
    try:
        from pydantic import ValidationError

        from app.schemas.batter import BatterCountStats
    finally:
        sys.path.pop(0)
    try:
        BatterCountStats.model_validate(stats)
    except ValidationError as error:
        return [str(item["msg"]) for item in error.errors()]
    return []


def team_names(rows: list[dict[str, str]], season: int) -> dict[str, str]:
    """Teams.csv から、そのシーズンの teamID → 球団名"""
    return {row["teamID"]: row["name"] for row in rows if int(row["yearID"]) == season}


def team_leagues(rows: list[dict[str, str]], season: int) -> dict[str, str]:
    """Teams.csv から、そのシーズンの teamID → リーグ (lgID)"""
    return {row["teamID"]: row["lgID"] for row in rows if int(row["yearID"]) == season}


def release_note(raw_dir: Path) -> str | None:
    """readme の「Release Date: ...」の行 (どの版のデータかを出典に書くため)。見つからなければ None"""
    for path in sorted(raw_dir.glob("readme*.txt")):
        text = path.read_text(encoding="utf-8-sig", errors="replace")
        match = re.search(r"^Release Date:.*$", text, re.MULTILINE)
        if match:
            return match.group(0).strip()
    return None


def candidates(players: dict[str, PlayerSeason], min_pa: int) -> list[PlayerSeason]:
    """プリセットにする選手 (PA が min_pa 以上。照合済みのプリセットがある選手は除く)。playerID の順"""
    return sorted(
        (p for p in players.values()
         if p.pa is not None and p.pa >= min_pa and p.player_id not in EXCLUDED_PLAYER_IDS),
        key=lambda p: p.player_id,
    )


def build_preset(
    player: PlayerSeason,
    season: int,
    name: str,
    teams: dict[str, str],
    leagues: dict[str, str],
    retrieved_at: str,
    release: str | None,
) -> dict:
    """プリセット1件 (schemas/batter_preset.schema.json の形)。キーの順番は固定"""
    stats = preset_stats(player)
    if stats is None:
        raise ValueError(f"{player.player_id}: 必要な項目が空欄です")
    code = player.final_team
    note = SOURCE_NOTE if release is None else f"{SOURCE_NOTE}使用した版：{release}。"
    preset: dict = {
        "id": f"{player.player_id}_{season}",
        "name": name,
        "team": teams[code],
        "season": season,
        "league": "MLB",
        "verified": False,
        "source": {
            "provider": SOURCE_PROVIDER,
            "url": SOURCE_URL,
            "retrieved_at": retrieved_at,
            "note": note,
        },
        "team_info": {
            "code": team_code(code),
            "name": teams[code],
            "league": leagues[code],
            "lahman_id": code,
        },
    }
    if len(player.teams_played) > 1:
        preset["teams_played"] = [
            {"code": team_code(team), "name": teams[team]} for team in player.teams_played
        ]
    preset["stats"] = stats
    return preset


def preset_json_text(preset: dict) -> str:
    """ファイルに書く文字列。同じ内容からは必ず同じ文字列になる (インデント2、日本語はそのまま、末尾に改行1つ)"""
    return json.dumps(preset, ensure_ascii=False, indent=2) + "\n"


def write_preset(path: Path, preset: dict) -> None:
    # 改行は OS に関係なく LF に固定する
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(preset_json_text(preset))


def sample_players(cands: list[PlayerSeason], size: int, seed: int) -> list[PlayerSeason]:
    """固定のシードで選ぶ (同じ入力・同じシードなら、同じ選手が選ばれる)。playerID の順で返す"""
    chosen = random.Random(seed).sample(cands, min(size, len(cands)))
    return sorted(chosen, key=lambda p: p.player_id)


def player_names(rows: list[dict[str, str]]) -> dict[str, str]:
    """People.csv から、playerID → 「名 姓」"""
    return {
        row["playerID"]: f"{row.get('nameFirst', '').strip()} {row.get('nameLast', '').strip()}".strip()
        for row in rows
    }


def compare_with_preset(preset: dict, player: PlayerSeason, teams: dict[str, str]) -> list[dict]:
    """既存のプリセット1件と、Lahman から集計した値を全項目で比べる (差の原因は判断しない)"""
    stats = preset_stats(player)
    rows = []
    for key in PRESET_STAT_KEYS:
        lahman_value = stats.get(key) if stats else None
        preset_value = preset["stats"].get(key)
        rows.append({"item": key, "preset": preset_value, "lahman": lahman_value,
                     "match": preset_value == lahman_value})
    lahman_team = f"{teams.get(player.final_team, '?')} ({player.final_team})"
    rows.append({"item": "team", "preset": preset.get("team"), "lahman": lahman_team,
                 "match": preset.get("team") == lahman_team})
    return rows


def dry_run(raw_dir: Path, season: int, min_pa: int, preset_dir: Path) -> str:
    """集計して、報告の文章を返す (ファイルは作らない)"""
    batting = read_csv(raw_dir / "Batting.csv")
    people = player_names(read_csv(raw_dir / "People.csv"))
    teams = team_names(read_csv(raw_dir / "Teams.csv"), season)
    players = aggregate_batting(batting, season)

    lines = [f"# Lahman {season} の試験集計 (--dry-run。ファイルは作っていません)", ""]
    lines.append(f"- Batting.csv の {season} 年の行数: {sum(1 for r in batting if int(r['yearID']) == season)}")
    lines.append(f"- {season} 年に記録のある選手 (playerID) の数: {len(players)}")

    # 欠損 (空欄) の状況
    blank_counts = {col: 0 for col in SUM_COLUMNS}
    for row in batting:
        if int(row["yearID"]) != season:
            continue
        for col in SUM_COLUMNS:
            if parse_count(row.get(col, "")) is None:
                blank_counts[col] += 1
    lines.append("- 空欄のセルの数 (列ごと、対象シーズンの全行): "
                 + ", ".join(f"{col}={count}" for col, count in blank_counts.items()))

    with_missing = [p for p in players.values() if preset_stats(p) is None]
    candidates = [p for p in players.values() if p.pa is not None and p.pa >= min_pa]
    lines.append(f"- プリセットに必要な項目が空欄の選手 (PA に関係なく): {len(with_missing)}人")
    lines.append(f"- PA >= {min_pa} の選手: {len(candidates)}人")
    multi = [p for p in candidates if len(set(p.teams_played)) > 1]
    lines.append(f"- うち、複数の球団に在籍した選手: {len(multi)}人")

    by_team: dict[str, int] = {}
    for p in candidates:
        by_team[p.final_team] = by_team.get(p.final_team, 0) + 1
    lines.append("")
    lines.append(f"## 最終所属の球団ごとの人数 (PA >= {min_pa})")
    for team_id, count in sorted(by_team.items()):
        lines.append(f"- {team_id} {teams.get(team_id, '(Teams.csv に無い)')}: {count}")

    lines.append("")
    lines.append("## 入力検証 (API と同じルール) に違反した選手")
    violations = []
    for p in sorted(candidates, key=lambda c: c.player_id):
        stats = preset_stats(p)
        errors = ["必要な項目が空欄: " + ", ".join(p.missing_columns)] if stats is None else validation_errors(stats)
        if errors:
            violations.append(f"- {p.player_id} {people.get(p.player_id, '?')}: {'; '.join(errors)}")
    lines.extend(violations or ["- なし"])

    lines.append("")
    lines.append("## 既存のプリセットとの比較 (同じシーズン・同じ名前の選手)")
    for path in sorted(preset_dir.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            preset = json.load(f)
        if preset.get("season") != season:
            continue
        matches = [p for p in players.values() if people.get(p.player_id) == preset["name"]]
        lines.append(f"### {preset['name']} ({path.name})")
        if len(matches) != 1:
            lines.append(f"- Lahman で同じ名前の選手が {len(matches)} 人見つかったため、比較していません")
            continue
        player = matches[0]
        lines.append(f"- playerID: {player.player_id} / 在籍した球団: {', '.join(player.teams_played)}")
        lines.append("")
        lines.append("| 項目 | プリセット | Lahman から集計 | 一致 |")
        lines.append("|---|---|---|---|")
        for row in compare_with_preset(preset, player, teams):
            lines.append(f"| {row['item']} | {row['preset']} | {row['lahman']} | {'○' if row['match'] else '×'} |")
    return "\n".join(lines)


def sample_table(raw_dir: Path, season: int, min_pa: int, size: int, seed: int) -> str:
    """固定のシードで選んだ選手の成績の表 (公式サイトと見比べるため)"""
    players = aggregate_batting(read_csv(raw_dir / "Batting.csv"), season)
    people = player_names(read_csv(raw_dir / "People.csv"))
    teams = team_names(read_csv(raw_dir / "Teams.csv"), season)
    chosen = sample_players(candidates(players, min_pa), size, seed)
    lines = [
        f"# Lahman {season} から選んだ {len(chosen)} 人 (シード {seed}、PA >= {min_pa}、照合済みの2人を除く)",
        "",
        "| 選手 | playerID | 最終所属 | 在籍した球団 | " + " | ".join(PRESET_STAT_KEYS) + " |",
        "|---|---|---|---|" + "---|" * len(PRESET_STAT_KEYS),
    ]
    for p in chosen:
        stats = preset_stats(p) or {}
        lines.append(
            f"| {people.get(p.player_id, '?')} | {p.player_id} | {teams.get(p.final_team, '?')} ({p.final_team}) | "
            f"{' → '.join(p.teams_played)} | " + " | ".join(str(stats.get(k, '')) for k in PRESET_STAT_KEYS) + " |"
        )
    return "\n".join(lines)


def generate(raw_dir: Path, season: int, min_pa: int, output_dir: Path, retrieved_at: str) -> list[Path]:
    """プリセットの JSON を output_dir に書く。1人でも入力検証に通らなければ、何も書かずに止める"""
    players = aggregate_batting(read_csv(raw_dir / "Batting.csv"), season)
    people = player_names(read_csv(raw_dir / "People.csv"))
    team_rows = read_csv(raw_dir / "Teams.csv")
    teams = team_names(team_rows, season)
    leagues = team_leagues(team_rows, season)
    release = release_note(raw_dir)

    presets = []
    problems = []
    for player in candidates(players, min_pa):
        name = people.get(player.player_id)
        if not name:
            problems.append(f"{player.player_id}: People.csv に名前がありません")
            continue
        preset = build_preset(player, season, name, teams, leagues, retrieved_at, release)
        errors = validation_errors(preset["stats"])
        if errors:
            problems.append(f"{player.player_id}: {'; '.join(errors)}")
        presets.append(preset)
    if problems:
        raise ValueError("プリセットを作れない選手がいます:\n" + "\n".join(problems))

    output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for preset in presets:
        path = output_dir / f"{preset['id']}.json"
        write_preset(path, preset)
        paths.append(path)
    return paths


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--raw", type=Path, default=REPO_ROOT / "data" / "raw" / "lahman",
                        help="Batting.csv・People.csv・Teams.csv のあるフォルダ")
    parser.add_argument("--season", type=int, default=2025, help="対象シーズン (既定: 2025)")
    parser.add_argument("--min-pa", type=int, default=DEFAULT_MIN_PA, help="対象にする最小の打席数")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="集計して報告するだけ (ファイルは作らない)")
    mode.add_argument("--sample", action="store_true", help="固定のシードで選んだ選手の成績を表にする (ファイルは作らない)")
    mode.add_argument("--generate", action="store_true", help="プリセットの JSON を --output に作る")
    parser.add_argument("--sample-size", type=int, default=DEFAULT_SAMPLE_SIZE)
    parser.add_argument("--seed", type=int, default=DEFAULT_SAMPLE_SEED, help="--sample のシード")
    parser.add_argument("--output", type=Path, help="--generate の出力先のフォルダ")
    parser.add_argument("--retrieved-at", help="--generate で出典に書く取得日 (YYYY-MM-DD。元データをダウンロードした日)")
    args = parser.parse_args(argv)

    if not (args.dry_run or args.sample or args.generate):
        print("--dry-run・--sample・--generate のどれかを付けて実行してください。", file=sys.stderr)
        return 2
    missing = [name for name in ("Batting.csv", "People.csv", "Teams.csv") if not (args.raw / name).exists()]
    if missing:
        print(f"{args.raw} に次のファイルがありません: {', '.join(missing)}", file=sys.stderr)
        return 1

    if args.dry_run:
        preset_dir = REPO_ROOT / "data" / "presets" / "mlb" / str(args.season)
        print(dry_run(args.raw, args.season, args.min_pa, preset_dir))
        return 0
    if args.sample:
        print(sample_table(args.raw, args.season, args.min_pa, args.sample_size, args.seed))
        return 0

    # --generate: 取得日は推測で埋めず、必ず指定してもらう
    if args.output is None or args.retrieved_at is None:
        print("--generate には --output と --retrieved-at が必要です。", file=sys.stderr)
        return 2
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", args.retrieved_at):
        print("--retrieved-at は YYYY-MM-DD の形で指定してください。", file=sys.stderr)
        return 2
    try:
        paths = generate(args.raw, args.season, args.min_pa, args.output, args.retrieved_at)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    print(f"{len(paths)} 件のプリセットを {args.output} に書きました。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
