# テストファイルが numpy を app より先に import しても OpenBLAS のスレッド数の既定値
# (app/__init__.py) が効くよう、テストモジュールの読み込みより前に app を読み込んでおく。
import app  # noqa: F401
