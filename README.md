# 打順シミュレーター

MLBの実データ（打撃成績）を用いて、打順9人分の得点期待値を算出し、
「入力打順」と「打順の探索で求めた推奨打順」を比較するアプリケーションです（推奨打順は近似探索で求めた、期待得点が高くなる打順です。最も期待得点が高い打順とは限りません）。

> **現在の状況**: バックエンド（計算エンジン + API）は実装済み。フロントエンドは開発中で、現在できるのは、成績の手入力と選手データからの読み込み、打順の並べ替え、計算の実行と結果の表示（入力打順と推奨打順の比較、143試合・162試合の切替、損失点、シミュレーションの参考値）までです（詳細は「フロントエンド（開発中）」を参照）。

## 使い方（想定フロー）

1. 選手情報の入力（打者ごとに「選手を選ぶ」で選手データから選ぶか、「手入力する」で成績を入力する。まだ選んでいない打者から選手を選ぶ画面を開くと、「続けて次の打者を選ぶ」が初めからオンで、画面を閉じずに、まだ選んでいない打者へ続けて選べる。オフにしたときと、「選び直す」などで開いたときは、1人選ぶと画面を閉じる）
2. 打順の並び替え
3. 結果の出力（入力打順の得点期待値 / 推奨打順とその得点期待値 / 非効率% と損失点）

現時点ではAPI経由でこのフローを実行できます（`POST /lineup/evaluate`）。Swagger UIは `/docs` で確認できます。

- **入力**：9人分のカウント成績（PA、AB、H、2B、3B、HR、BB、HBP、SO、SF、SH、GIDP、SB、CS）。PA は必須（1以上）で、矛盾する成績（H > AB、2B+3B+HR > H など）はエラーになります。PA と内訳の合計が合わない場合は、エラーにせず `warnings` で知らせます。任意で、打者ごとの表示名（`display_names`、1〜40文字）を渡すと、`warnings` の文に打者IDではなく表示名が使われます。検証ルールの一覧は [`docs/DESIGN.md`](docs/DESIGN.md) 2-1 を参照してください
- **出力**：入力打順と推奨打順の1試合あたりの期待得点、143試合・162試合に換算した値（`totals_by_games`）、非効率%、推奨打順に対する入力打順の損失点（1試合あたりの `runs_lost_per_game` と、試合数ごとの `totals_by_games[].runs_lost`）。試合数の換算は試合数を掛けるだけで、確率はMLBのデータ・文献値のままです
- **打席数が少ない打者への注意**：PA が 200 未満の打者がいると、「標本が小さいので結果が変わりやすい」という注意を `warnings` で返します（計算は止めません）。200 は本プロジェクトの目安で、出典・統計的根拠はありません
- **打者ごとの指標**：`POST /batters/metrics` は、打率・出塁率・長打率・OPS・四球率・三振率などを打者ごとに返します（得点期待値の計算は行いません）。定義は [`docs/DESIGN.md`](docs/DESIGN.md) 4章を参照してください
- **プリセットの一覧**：`GET /presets/seasons`（シーズン）、`GET /presets/teams`（リーグごとの球団と選手数）、`GET /presets?team=球団コード` または `?q=名前の一部`（絞り込み・検索。検索は最大50件と総数）があります。詳細は [`docs/DESIGN.md`](docs/DESIGN.md) 2-2 を参照してください

## 算出手法

得点期待値の算出には2つの方式を実装しています。

- **案A：マルコフ連鎖（厳密計算）** — 走者状況×アウトカウントの25状態からなる吸収マルコフ連鎖で、打順がイニングをまたいで継続することを正しく反映しつつ、1試合(9イニング)の得点期待値を厳密に計算します。行列演算のみで完結するため高速です。ただし盗塁については、一塁走者を「直前の打者」とみなす近似を用いています（案Bは一塁走者本人を追跡。詳細は[`docs/DESIGN.md`](docs/DESIGN.md) 1章）。
- **案B：モンテカルロシミュレーション** — 同じ状態遷移ルールを使い、乱数で試合を多数回試行して平均得点を推定します。分布（最良/最悪ケースの幅）も算出できます。

数式・擬似コードの詳細は [`docs/DESIGN.md`](docs/DESIGN.md) を参照してください。

### 推奨打順の探索について

厳密な全打順探索（9! = 362,880通り）は、現行コードで約8.5分（512.1秒）かかることを実測で確認しています（Intel Core Ultra 7 265・Windows 11・Python 3.13.14・numpy 2.4.4、OpenBLASのスレッド数1、遷移行列のキャッシュあり、盗塁あり。詳細は[`docs/DESIGN.md`](docs/DESIGN.md)参照）。APIの同期レスポンスには不向きなため、**複数回のランダム再スタートによる山登り法**（適応的停止：最低10回・最大50回、連続10回改善なしで打ち切り）をデフォルトで使用しています。厳密な最適解を保証するものではありませんが、1回だけの山登り法よりも局所最適解に捕まるリスクを大きく下げられます。厳密な全探索用の関数（`find_optimal_lineup`）も実装済みで、バックグラウンドジョブ等での利用を想定しています。

## データソース

- 打者成績（プリセット）：2025年MLBレギュラーシーズン。2件は Baseball Savant と Baseball-Reference の数値を照合したもの、346件は The SABR Lahman Baseball Database 1871-2025 から生成したもの（取得元URL・取得日は各プリセットJSONの `source` 欄に記載）
- wOBA・wRC+：このアプリでは計算しません。プリセットのJSONに公表値（`reference_metrics`）が書かれている選手だけ、出典を添えて参考値として表示します（モデルの計算には使いません。現在のプリセットには、まだ書かれていません）
- 進塁確率（アウト数別）：Baseball Prospectus（2003年MLBデータに基づく研究）※打者データとは年代が異なる暫定値

詳細は [`docs/DESIGN.md`](docs/DESIGN.md) の3章を参照してください。

> **プリセットデータについて**：`data/presets/mlb/2025/` には、2025年MLBレギュラーシーズンの選手348名を収録しています。
>
> - **照合済みの2名**（Aaron Judge、Luis Arraez）：Baseball Savant と Baseball-Reference の数値を相互に照合した上で採用しており、各JSONで `verified: true` としています。長打力型（Judge：本塁打53本）とコンタクト型（Arraez：三振21個・犠打12）で対照的な打撃タイプを選び、打順最適化による違いが分かりやすいようにしています
> - **Lahman Baseball Database から生成した346名**：打席数（AB+BB+HBP+SF+SH で計算）が200以上の選手を、スクリプト（`scripts/build_lahman_presets.py`）で機械的に生成しました。一部（固定のシードで選んだ10人）は公式サイトの数値と目視で照合して一致を確認しましたが、残りは独立した第二の出典との照合をしていないため、すべて `verified: false` です。打席数は元のデータに無いため計算しており、公式の打席数と一致しない場合があります
> - **シーズン中に移籍した選手**：そのシーズンの成績を合計して1件にまとめ、最後に出場した球団の選手として置いています。そのため、移籍前の球団の選手としては表示されません。在籍した球団は、各JSONの `teams_played` に出場した順で記録しています
> - **2026年のプリセットはありません**：2026年を含む Lahman Baseball Database の版が公開されれば、同じ生成スクリプトで作れる見込みですが、公開の時期と内容は未確認です。表計算ソフトなどから成績を貼り付けて入力する機能は、導入しない方針です（2026-10-15 決定）。選手データに無い選手は、手入力で入れてください
>
> プリセットの追加方法は本READMEの「プリセットの追加方法」セクションを参照してください。

## 考慮していない要素・モデルの限界

本モデルにはいくつかの簡略化・限界があります。詳細な一覧は [`docs/DESIGN.md`](docs/DESIGN.md) 6章にまとめていますが、主なものは以下の通りです。

- NPBとMLBの環境差（使用球・球場サイズ・DH制度・試合数等）は未補正
- 相手投手の力量、守備範囲・エラー、敬遠は考慮しない
- 走塁は盗塁（一塁→二塁）のみモデル化。三盗・本盗・タッチアップ進塁・打球アウトでの走者の進塁（進塁打）と生還は未対応
- 進塁確率データ(2003年)と打者データ(2025年)の年代のズレ
- 打席数が少ない打者も、入力された成績をそのまま確率に使う（標本の小ささによる不確かさは補正しない）。PA が 200 未満の打者には注意を出すが、200 は本プロジェクトの目安で、出典・統計的根拠はない
- Statcast x系指標（xBA等）は「運を除いた実力評価」を目的とした指標であり、実際の結果に基づく本モデルの設計方針とは異なるため使用していない

## 検証結果

[`docs/VALIDATION.md`](docs/VALIDATION.md) を参照してください。確率の整合性・単調性・案A/B同士の収束（案Bを10シード×3万試行で測定し、案Aとの相対誤差は平均0.33%・最大1.04%）・既知の実測値とのベンチマークを確認済みです。

## セットアップ

対応Pythonバージョン：3.12 / 3.13（3.12・3.13 ともCIで確認：GitHub Actions の `backend-ci` で ruff・mypy・pytest（全件）が成功）

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
ruff check . ../scripts   # lint（ルールは pyproject.toml の [tool.ruff.lint]。scripts/ も同じルールで検査）
mypy app         # 型チェック
```

### CI（GitHub Actions）

- `backend-ci`：`backend/`・`data/`・`schemas/`・`scripts/` の変更時に、Python 3.12 と 3.13 で上記のインストール・ruff・mypy・pytest（全テスト）を実行
- `preset-validation`：`data/presets/`・`schemas/` の変更時に、プリセットJSONをJSON Schemaで検証

2026-10-06 の実行で、`backend-ci` は Python 3.12・3.13 の両方で ruff・mypy・pytest（全件）が成功し、`preset-validation` も成功しました。

## フロントエンド（開発中）

React + TypeScript + Vite で、`frontend/` に置いています。現在は、打者ごとに「選手を選ぶ」で選手データ（プリセット）から読み込むか（シーズン → 球団 → 選手。名前での検索も可。読み込んだ選手は成績の要約で表示し、「編集する」で成績を直せます）、「手入力する」で成績を入力する（入力検証つき。打者の表示名は変更できます）操作、手入力・編集中の打者からほかの打者へのコピー（選手データを選んだ打者には、コピーされません）、打順の並べ替え（ドラッグ・「上へ」「下へ」・移動先の番号の指定。打者ごとの指標と注意をサーバーから取得して表示）と、計算の実行・キャンセル、結果の表示（入力打順と推奨打順を画面の幅にかかわらず左右に並べ、それぞれの期待得点（1試合あたりと、143試合・162試合の切替による合計）、非効率%と損失点、推奨打順で動いた打者を表示。入力打順の下には、たためる欄でモンテカルロ法（案B）の平均と標準偏差を参考値として表示）までを実装しています。

動作確認したバージョン：Node.js 24.19.0 / npm 11.17.0（Windows 11。`frontend/.nvmrc` に記録）。これ以外のバージョン・OSでの動作は未確認です。

```bash
cd frontend
npm ci             # 依存関係のインストール（package-lock.json のとおりに入る）
npm run dev        # 開発サーバー（http://localhost:5173）
npm run typecheck  # 型チェック
npm run lint       # lint
npm run test       # テスト
npm run build      # ビルド（frontend/dist/ に出力）
npm run contrast   # 配色のコントラスト比を計算して確認（ライト／ダークの両方）
```

- 画面は API を相対パス `/api/...` で呼びます。開発サーバーが `/api` をバックエンド（`http://127.0.0.1:8000`）に転送するので、先に上記の手順でバックエンドを起動しておいてください
- ESLint は 9 系を使っています。アクセシビリティ検査用の `eslint-plugin-jsx-a11y` が ESLint 10 に未対応のためで、対応後に ESLint 10 へ上げる予定です

### 開発環境についての注意（作者の環境）

このリポジトリの作業フォルダは Windows と Mac の間で OneDrive により同期しており、Mac は git の操作にのみ使っています。`frontend/node_modules` は git の管理対象外（`.gitignore`）ですが、OneDrive では同期されます。同期された `node_modules` には Windows 用のバイナリが含まれうるため、Mac で npm を実行する場合は、先に `frontend/node_modules` を削除してから `npm ci` をやり直してください。また、`node_modules` はファイル数が多く同期に時間がかかるため、作者は作業の区切りごとに `frontend/node_modules` を削除し、同期が終わってからコミットしています（作業を再開するときは `npm ci` から始めます）。通常どおり git で取得した環境では、これらの注意は関係ありません。

## 開発者向け：プリセットの追加方法

1. `schemas/batter_preset.schema.json` の形式に従い、`data/presets/mlb/<season>/<id>.json` を作成する
2. `verified: true` にする場合は、`source` に取得元URL・取得日を正確に記載する
3. `pytest backend/tests/test_preset_schema.py` でバリデーションが通ることを確認する（CIでも自動チェックされます）

打率・出塁率・長打率などの表示用指標はアプリ側で自動計算されるため、プリセットJSONにはカウント統計のみを記載すれば十分です。

wOBA・wRC+ はアプリでは計算しません。表示したい場合は、公表値を任意の `reference_metrics` 欄に書きます（wOBA・wRC+ の少なくとも一方、対象シーズン、出典名、`https://` で始まる出典のURL、取得日、任意の備考）。書いてよいのは、出典で確認した値だけです（未確認の値や仮の値は書きません）。対象シーズンは、プリセットの `season` と同じ年にします。この値は画面に参考として表示するだけで、モデルの計算には使いません。

## 今後の拡張候補

- フロントエンド（React + TypeScript、開発中）の残りの作業（デザインの調整、アクセシビリティの確認）
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

ソースコードは MIT ライセンスです（[`LICENSE`](LICENSE)参照）。`data/` 配下のプリセットの出典とライセンスは、[`data/NOTICE`](data/NOTICE) を参照してください。統計データ自体の著作権は出典元に帰属します。

Lahman Baseball Database から生成したプリセットは、元のデータベースのライセンスである Creative Commons Attribution-ShareAlike 3.0 Unported（CC BY-SA 3.0、http://creativecommons.org/licenses/by-sa/3.0/ ）で提供します。元のデータベースの著作権表示（原文）は「This database is copyright 1996-2025 by SABR, via generious donation from Sean Lahman.」です。元のデータからの改変の内容（同じシーズンの複数球団の成績の合算、打席数の計算など）は [`data/NOTICE`](data/NOTICE) に書いています。

## 参考文献

- Tango, T., Lichtman, M., & Dolphin, A. (2007). *The Book: Playing the Percentages in Baseball*. Potomac Books.
- Bukiet, B., Harold, E. R., & Palacios, J. L. (1997). A Markov Chain Approach to Baseball. *Operations Research*, 45(1), 14–23.
- D'Esopo, D. A., & Lefkowitz, B. (1977). The Distribution of Runs in the Game of Baseball. In *Optimal Strategies in Sports* (S. P. Ladany & R. E. Machol, Eds.). North-Holland.
- Baseball Prospectus. Run Expectancy Matrix and base-advancement rates (2003 MLB season data). Retrieved from https://baseballprospectus.com/?p=2844 (著者名・掲載日は本文からは特定できなかったため未記載)
- Baseball-Reference.com. (n.d.). 2003 American League Team Statistics. Retrieved from https://www.baseball-reference.com/leagues/AL/2003.shtml
- Baseball-Reference.com. (n.d.). 2003 National League Team Statistics. Retrieved from https://www.baseball-reference.com/leagues/NL/2003.shtml
- FanGraphs. (n.d.). Guts! (wOBA constants, 2025 season). Retrieved from https://www.fangraphs.com/guts.aspx
