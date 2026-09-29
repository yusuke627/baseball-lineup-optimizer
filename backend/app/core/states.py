"""
状態空間の定義。

走者状況は3ビットで表現する。
  bit0: 一塁に走者がいるか
  bit1: 二塁に走者がいるか
  bit2: 三塁に走者がいるか
base_code は 0-7 の整数 (0=走者なし, 7=満塁)。

base_out インデックスは 0-23 (= base_code*3 + outs) で、
24 は「3アウト到達」を表す吸収的な終端状態とする。
"""
from dataclasses import dataclass

NUM_BASE_CODES = 8
NUM_OUTS = 3
TERMINAL_STATE = 24  # 3アウト到達（イニング終了）
NUM_TRANSIENT_STATES = NUM_BASE_CODES * NUM_OUTS  # 24


@dataclass(frozen=True)
class Bases:
    on1: bool
    on2: bool
    on3: bool

    @property
    def code(self) -> int:
        return (1 if self.on1 else 0) | (2 if self.on2 else 0) | (4 if self.on3 else 0)

    @staticmethod
    def from_code(code: int) -> "Bases":
        return Bases(
            on1=bool(code & 1),
            on2=bool(code & 2),
            on3=bool(code & 4),
        )


def base_out_index(base_code: int, outs: int) -> int:
    """(走者状況, アウト数) -> 0-23 のインデックス"""
    if outs >= 3:
        return TERMINAL_STATE
    return base_code * NUM_OUTS + outs


def decode_base_out_index(idx: int) -> tuple[int, int]:
    """0-23 のインデックス -> (走者状況コード, アウト数)"""
    if idx == TERMINAL_STATE:
        raise ValueError("terminal state has no (base_code, outs) decomposition")
    return divmod(idx, NUM_OUTS)


def outs_bucket(outs: int) -> str:
    """アウト数別の進塁確率テーブルを引くためのバケット名"""
    return "two_outs" if outs == 2 else "less_than_two_outs"
