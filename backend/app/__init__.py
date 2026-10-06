import os

# 案Aは 216x216 程度の小さな行列演算を大量に繰り返すため、OpenBLAS のマルチスレッド化は
# かえって遅くなる（実測は docs/DESIGN.md 9章）。numpy の読み込み前に既定値として
# スレッド数1を設定する。利用者が環境変数を設定している場合はそちらを優先する。
# numpy が先に読み込まれていると効かないため、app パッケージは numpy より先に import すること。
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
