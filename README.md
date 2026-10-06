# Baseball Lineup Run-Expectancy Optimizer

MLBの実データ（打撃成績）を用いて、打順9人分の得点期待値を算出し、
「入力した打順」と「全打順探索・近似探索で求めた最適打順」を比較するアプリケーションです。

> **現在の状況**: バックエンド（計算エンジン + API）まで実装済み。フロントエンドは今後実装予定です。

## 使い方（想定フロー）

1. 選手情報の入力（手入力 or プリセット選択）
2. 打順の並び替え
3. 結果の出力（入力した打順の得点期待値 / 最適打順とその得点期待値 / 非効率%）

現時点ではAPI経由でこのフローを実行できます（`POST /lineup/evaluate`）。Swagger UIは `/docs` で確認できます。

## 算出手法

得点期待値の算出には2つの方式を実装しています。

- **案A：マルコフ連鎖（厳密計算）** — 走者状況×アウトカウントの25状態からなる吸収マルコフ連鎖で、打順がイニングをまたいで継続することを正しく反映しつつ、1試合(9イニング)の得点期待値を厳密に計算します。行列演算のみで完結するため高速です。ただし盗塁については、一塁走者を「直前の打者」とみなす近似を用いています（案Bは一塁走者本人を追跡。詳細は[`docs/DESIGN.md`](docs/DESIGN.md) 1章）。
- **案B：モンテカルロシミュレーション** — 同じ状態遷移ルールを使い、乱数で試合を多数回試行して平均得点を推定します。分布（最良/最悪ケースの幅）も算出できます。

数式・擬似コードの詳細は [`docs/DESIGN.md`](docs/DESIGN.md) を参照してください。

### 最適打順の探索について

厳密な全打順探索（9! = 362,880通り）は、打者ごとの遷移行列をキャッシュしても約20.5分かかることを実測で確認しています（計算速度の改善前の値。改善後の全探索は未計測。詳細は[`docs/DESIGN.md`](docs/DESIGN.md)参照）。APIの同期レスポンスには不向きなため、**複数回のランダム再スタートによる山登り法**（適応的停止：最低10回・最大50回、連続10回改善なしで打ち切り）をデフォルトで使用しています。厳密な最適解を保証するものではありませんが、1回だけの山登り法よりも局所最適解に捕まるリスクを大きく下げられます。厳密な全探索用の関数（`find_optimal_lineup`）も実装済みで、バックグラウンドジョブ等での利用を想定しています。

## データソース

- 打者成績（プリセット）：2025年MLBレギュラーシーズン。Baseball Savant と Baseball-Reference の数値を照合（取得元URL・取得日は各プリセットJSONの `source` 欄に記載）
- wOBA/wRC+の係数：FanGraphs "Guts!" テーブル（2025年シーズン）
- 進塁確率（アウト数別）：Baseball Prospectus（2003年MLBデータに基づく研究）※打者データとは年代が異なる暫定値

詳細は [`docs/DESIGN.md`](docs/DESIGN.md) の3章を参照してください。

> **プリセットデータについて**：`data/presets/mlb/2025/` には、2025年MLBレギュラーシーズンの実際の成績を持つ選手2名（Aaron Judge、Luis Arraez）を収録しています。いずれも Baseball Savant と Baseball-Reference の数値を相互に照合した上で採用しており、各JSONで `verified: true` としています（`source` フィールドに取得元・取得日を明記）。長打力型（Judge：本塁打53本）とコンタクト型（Arraez：三振21個・犠打12）で対照的な打撃タイプを選び、打順最適化による違いが分かりやすいようにしています。プリセットの追加方法は本READMEの「プリセットの追加方法」セクションを参照してください。

## 考慮していない要素・モデルの限界

本モデルにはいくつかの簡略化・限界があります。詳細な一覧は [`docs/DESIGN.md`](docs/DESIGN.md) 6章にまとめていますが、主なものは以下の通りです。

- NPBとMLBの環境差（使用球・球場サイズ・DH制度・試合数等）は未補正
- 相手投手の力量、守備範囲・エラー、敬遠は考慮しない
- 走塁は盗塁（一塁→二塁）のみモデル化。三盗・本盗・タッチアップ進塁・打球アウトでの走者の進塁（進塁打）と生還は未対応
- 進塁確率データ(2003年)と打者データ(2025年)の年代のズレ
- Statcast x系指標（xBA等）は「運を除いた実力評価」を目的とした指標であり、実際の結果に基づく本モデルの設計方針とは異なるため使用していない

## 検証結果

[`docs/VALIDATION.md`](docs/VALIDATION.md) を参照してください。確率の整合性・単調性・案A/B同士の収束（案Bを10シード×3万試行で測定し、案Aとの相対誤差は平均0.33%・最大1.04%）・既知の実測値とのベンチマークを確認済みです。

## セットアップ

対応Pythonバージョン：3.12 / 3.13（GitHub ActionsのCIで動作を確認）

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

`http://localhost:8000/docs` でSwagger UIが確認できます。依存関係は `backend/pyproject.toml` で管理しています。

### テスト・静的チェックの実行

```bash
cd backend
pytest -v        # 全テスト
ruff check .     # lint（ルールは pyproject.toml の [tool.ruff.lint]）
mypy app         # 型チェック
```

### CI（GitHub Actions）

- `backend-ci`：`backend/`・`data/`・`schemas/` の変更時に、Python 3.12 と 3.13 で上記のインストール・ruff・mypy・pytest（全テスト）を実行
- `preset-validation`：`data/presets/`・`schemas/` の変更時に、プリセットJSONをJSON Schemaで検証

## 開発者向け：プリセットの追加方法

1. `schemas/batter_preset.schema.json` の形式に従い、`data/presets/mlb/<season>/<id>.json` を作成する
2. `verified: true` にする場合は、`source` に取得元URL・取得日を正確に記載する
3. `pytest backend/tests/test_preset_schema.py` でバリデーションが通ることを確認する（CIでも自動チェックされます）

wOBA・wRC+・打率などの表示用指標はアプリ側で自動計算されるため、プリセットJSONにはカウント統計のみを記載すれば十分です。

## 今後の拡張候補

- フロントエンド（React + TypeScript）の実装
- デプロイ（Render/Railway等、READMEにURLを掲載予定）
- 進塁確率データを打者データと同年度・より詳細な状況別のものに差し替え
- 三盗・本盗・スクイズの個別モデル化
- アウト時の進塁（三塁走者の生還に限らず、二塁→三塁・一塁→二塁等も含む）を、独立した打席単位データ（例: Retrosheet）から導出して一括でモデル化する
- Statcast x系指標を用いた代替シミュレーションモード
- 対戦投手を考慮したプラットーン効果の反映
- パークファクター補正
- 全打順探索のベクトル化・バックグラウンドジョブ化

詳細は [`docs/DESIGN.md`](docs/DESIGN.md) 7章を参照してください。

## ライセンス

コードはMITライセンスです（[`LICENSE`](LICENSE)参照）。統計データ自体の著作権は出典元に帰属します。

## 参考文献

- Tango, T., Lichtman, M., & Dolphin, A. (2007). *The Book: Playing the Percentages in Baseball*. Potomac Books.
- Bukiet, B., Harold, E. R., & Palacios, J. L. (1997). A Markov Chain Approach to Baseball. *Operations Research*, 45(1), 14–23.
- D'Esopo, D. A., & Lefkowitz, B. (1977). The Distribution of Runs in the Game of Baseball. In *Optimal Strategies in Sports* (S. P. Ladany & R. E. Machol, Eds.). North-Holland.
- Baseball Prospectus. Run Expectancy Matrix and base-advancement rates (2003 MLB season data). Retrieved from https://baseballprospectus.com/?p=2844 (著者名・掲載日は本文からは特定できなかったため未記載)
- Baseball-Reference.com. (n.d.). 2003 American League Team Statistics. Retrieved from https://www.baseball-reference.com/leagues/AL/2003.shtml
- Baseball-Reference.com. (n.d.). 2003 National League Team Statistics. Retrieved from https://www.baseball-reference.com/leagues/NL/2003.shtml
- FanGraphs. (n.d.). Guts! (wOBA constants, 2025 season). Retrieved from https://www.fangraphs.com/guts.aspx
