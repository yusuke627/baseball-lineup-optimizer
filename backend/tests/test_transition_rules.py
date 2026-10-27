"""
打撃イベントごとの遷移ルール (transitions.resolve_event) を、イベント × 状態ごとに直接確かめる。

塁は走者1人分の有無 (Bases の on1・on2・on3) で表すので、2人の走者が同じ塁に置かれると、
1人が消えて走者の数が合わなくなる。走者の数の保存を確かめることで、塁の重なりも見つけられる。
"""
import pytest

from app.core.states import NUM_OUTS, Bases
from app.core.transitions import DEFAULT_ADVANCE_PROBS, EVENT_KEYS, resolve_event

ADV = DEFAULT_ADVANCE_PROBS

# 走者状況の名前 (docs/DESIGN.md 3-1) → 走者状況のコード (一塁=1、二塁=2、三塁=4)
CODES = {"S0": 0, "S1": 1, "S2": 2, "S3": 4, "S12": 3, "S13": 5, "S23": 6, "S123": 7}

ALL_STATES = [(name, outs) for name in CODES for outs in range(NUM_OUTS)]


def _runners(bases: Bases) -> int:
    return int(bases.on1) + int(bases.on2) + int(bases.on3)


@pytest.mark.parametrize("event", EVENT_KEYS)
@pytest.mark.parametrize(("state", "outs"), ALL_STATES)
def test_every_branch_conserves_runners_and_probabilities_sum_to_one(event, state, outs):
    before = Bases.from_code(CODES[state])
    branches = resolve_event(event, CODES[state], outs, ADV)

    assert sum(b.prob for b in branches) == pytest.approx(1.0, abs=1e-12)
    for b in branches:
        assert b.prob >= 0
        assert b.runs >= 0
        outs_added = b.new_outs - outs
        assert 0 <= outs_added <= 2
        # (遷移前の走者 + 打者) = (遷移後の走者 + 得点 + アウトで減った人数)。塁が重なれば走者が1人消えて成り立たない
        assert _runners(before) + 1 == _runners(b.new_bases) + b.runs + outs_added, (
            f"{event} {state} {outs}アウト → {b.new_bases} 得点{b.runs} アウト+{outs_added} (確率 {b.prob})"
        )


def _table(event, state, outs):
    """(遷移後の走者状況の名前, 得点, アウト数) → 確率 の辞書。同じ遷移先の分岐は足し合わせる"""
    names = {code: name for name, code in CODES.items()}
    table: dict[tuple[str, int, int], float] = {}
    for b in resolve_event(event, CODES[state], outs, ADV):
        key = (names[b.new_bases.code], b.runs, b.new_outs)
        table[key] = table.get(key, 0.0) + b.prob
    return table


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        # 三塁走者は生還して三塁を空け、ほかの走者は1つずつ進む。打者はアウト
        ("S3", ("S0", 1)),
        ("S13", ("S2", 1)),
        ("S23", ("S3", 1)),
        ("S123", ("S23", 1)),
    ],
)
@pytest.mark.parametrize("outs", [0, 1])
def test_sacrifice_bunt_scores_runner_from_third_and_vacates_third(state, expected, outs):
    new_state, runs = expected
    assert _table("SH", state, outs) == {(new_state, runs, outs + 1): pytest.approx(1.0)}


@pytest.mark.parametrize("outs", [0, 2])
@pytest.mark.parametrize(("state", "base_runs"), [("S12", 0), ("S123", 1)])
def test_single_with_runners_on_first_and_second_never_stacks_runners(state, base_runs, outs):
    # base_runs: 三塁走者の生還の分 (満塁のとき1)
    bucket = "two_outs" if outs == 2 else "less_than_two_outs"
    p2_scores = ADV["second_scores_on_single"][bucket]
    p1_to_3 = ADV["first_to_third_on_single"][bucket]
    expected = {
        # 二塁走者が生還: 一塁走者は独立に、三塁まで進むか二塁で止まる
        ("S13", base_runs + 1, outs): pytest.approx(p2_scores * p1_to_3),
        ("S12", base_runs + 1, outs): pytest.approx(p2_scores * (1 - p1_to_3)),
        # 二塁走者が三塁で止まる: 一塁走者は前の走者を超えず、二塁まで (満塁になる)
        ("S123", base_runs, outs): pytest.approx(1 - p2_scores),
    }
    assert _table("1B", state, outs) == expected
