# 打順シミュレーター

MLBの打撃成績から、9人の打順の1試合あたりの期待得点を計算し、「入力打順」と、探索で求めた「推奨打順」を比べるアプリです。推奨打順は近似の探索で求めた、期待得点が高くなる打順で、最も期待得点が高い打順とは限りません。

手元で起動して、ブラウザで使います。公開版の URL は、準備でき次第ここに掲載します。

## 免責

このアプリは個人が作った非公式のもので、MLB（Major League Baseball）や各球団とは関係がなく、承認や提携も受けていません。選手名・球団名は、成績のデータの一部として含まれています。

## できること

画面の3つのタブで、順に操作します。

1. **成績の入力**：打者ごとに、選手データ（2025年のMLBの選手348人）から選ぶか、成績（打席数・安打・本塁打・四球・三振など14項目の回数）を手入力します
2. **打順**：ドラッグ、「上へ」「下へ」、移動先の番号で並べ替えます。打者ごとの打率・出塁率・OPS などを見ながら決められます
3. **計算と結果**：入力打順と推奨打順の1試合あたりの期待得点と、143試合・162試合の合計、非効率%（推奨打順に比べて少ない割合）と損失点、推奨打順で動いた打者、参考としてシミュレーション（5000試合）の平均と標準偏差を表示します

## 起動のしかた

**前提**
- Python 3.12 以上（`backend/pyproject.toml` の指定。CI で 3.12・3.13 を確認）
- Node.js：24.19.0 で動作を確認（`frontend/.nvmrc`）。必要な最低の版は未確認です（参考：依存の指定では、Vite 8.3.3 が 20.19 以上または 22.12 以上、テストで使う jsdom 30.1.2 が 22.22.2 以上または 24.15.0 以上）
- この手順を確かめた環境：Windows 11、Python 3.13.14、Node.js 24.19.0、npm 11.17.0。macOS・Linux での手順は未確認です

**ターミナル1：取得、仮想環境、バックエンド**

```bash
git clone <このリポジトリの URL>
cd baseball-lineup-optimizer
python3 -m venv .venv          # Windows（PowerShell）：py -3.13 -m venv .venv（3.12 以上の版を指定）
source .venv/bin/activate      # Windows（PowerShell）：.\.venv\Scripts\Activate.ps1
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload  # API の説明（Swagger UI）は http://localhost:8000/docs
```

**ターミナル2：フロントエンド**（リポジトリのフォルダから）

```bash
cd frontend
npm ci
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。画面は API を `/api/...` で呼び、開発サーバーがバックエンド（`http://127.0.0.1:8000`）に転送するので、先にバックエンドを起動しておいてください。Windows でフォルダのパスが長いと、パスの長さの上限で `pip` が失敗することがあります。その場合は、短いパスのフォルダに置いてください。

## 仕組みの要点

- **案A：マルコフ連鎖（厳密計算）**：走者の状況とアウト数の24状態に3アウトを加えた吸収マルコフ連鎖で、打順がイニングをまたいで続くことを反映し、1試合の期待得点を乱数なしで計算します。速いので、推奨打順の探索にはこちらを使います。盗塁は、一塁走者を「直前の打者」とみなす近似で扱います
- **案B：モンテカルロシミュレーション**：同じ遷移のルールで試合を乱数で繰り返し、平均得点を求めます。一塁走者本人を追跡します。入力打順の参考値に使います
- **推奨打順の探索**：全打順（9! ＝ 362,880通り）の厳密な探索は約7.6分（454.4秒）かかるため、API では複数回のランダム再スタートによる山登り法（最低10回・最大50回、連続10回改善が無ければ打ち切り）を使います

詳しくは [`docs/DESIGN.md`](docs/DESIGN.md)（3章 計算モデル、4章 探索と計算速度）を参照してください。

## データについて

- 選手データは、2025年のMLBレギュラーシーズンの選手348人です（`data/presets/mlb/2025/`。コードと API では preset と呼びます）
  - 346人：The SABR Lahman Baseball Database 1871-2025（Release Date: Dec 10, 2025。取得日 2026-10-14）から、計算した打席数（AB + BB + HBP + SF + SH）が 200 以上の選手を、`scripts/build_lahman_presets.py` で機械的に作りました。10人は、作者が公式サイトの数値と目視で照合し、一致しました（照合先は記録していません）。残りは第二の出典と照合していません（`verified: false`）
  - 2人：Baseball Savant と Baseball-Reference の両方で数値の一致を確かめた成績です（取得日 2026-09-29。`verified: true`）。成績の14項目は、Lahman の2025年の同じ選手の行とも同じ値です（打席数は AB + BB + HBP + SF + SH で計算した値）。打順による違いが分かりやすいよう、長打力型の Aaron Judge（本塁打53本）と、コンタクト型の Luis Arraez（三振21個・犠打12）を選びました
- シーズン中に移籍した選手は、成績を合計して1人分にまとめ、最後に出場した球団の選手として置いています。2026年の選手データはありません（無い選手は手入力してください）
- 進塁確率は、James Click「Run Expectancy Matrix and base-advancement rates (2003 MLB season data)」（Baseball Prospectus、2004年5月6日掲載。2003年シーズンの数値）の値で、打者の成績（2025年）と年代が違う暫定の値です。wOBA・wRC+ は計算しません

詳しくは [`docs/DESIGN.md`](docs/DESIGN.md) 7章と [`data/NOTICE`](data/NOTICE) を参照してください。

## モデルの限界

- 相手投手、守備、エラー、敬遠、采配、パークファクターは考慮しません
- 走塁は盗塁（一塁→二塁）だけを扱い、三盗・本盗、打球アウトでの進塁・生還（進塁打やタッチアップ）は扱いません
- 進塁確率は2003年シーズンのリーグ平均で、打者ごとの走力の差は反映しません
- 打席数が少ない打者も、成績をそのまま確率に使います（打席数 200 未満で注意を出しますが、200 は本プロジェクトの目安で、統計的な根拠はありません）
- MLBのデータで作ったモデルなので、日本のプロ野球に当てはめると精度が落ちる可能性があります（143試合の切り替えは、試合数を掛けるだけです）

詳しくは [`docs/DESIGN.md`](docs/DESIGN.md) 10章を参照してください。

## 検証の要点

- 遷移確率の合計が1になること、走者の数が保存されること、成績を良くすると期待得点が増えることを、テストで確かめています
- 案Aと案Bの突き合わせ：平均的な打者9人で、案Aは 4.0900 点/試合。案Bを10通りのシードで3万試行ずつ測ると、相対誤差は平均 0.32%、最大 0.99% でした
- 2003年シーズンの得点期待値表との照合：24状態の平均絶対誤差は 0.1158点で、系統的に少なめでした。打球アウトでの三塁走者の生還を検証の実験として加えると 0.0357点に縮み、この簡略化が主な原因らしいことが分かりました（本番のモデルには入れていません）

詳しくは [`docs/VALIDATION.md`](docs/VALIDATION.md) を参照してください。

## 開発者向け

**テストと静的チェック**（仮想環境を有効にしてから）

```bash
cd backend
pytest -v                 # 全テスト
ruff check . ../scripts   # lint
mypy app                  # 型チェック
cd ../frontend
npm run typecheck         # ほかに npm run lint・test・build・contrast（配色のコントラスト比）
```

- CI（GitHub Actions）：`backend-ci`（Python 3.12・3.13 で ruff・mypy・pytest）、`preset-validation`（選手データと選手名の上書きを JSON Schema で検証）、`frontend-ci`（npm ci・typecheck・lint・test・build・contrast）。動く条件は [`docs/DESIGN.md`](docs/DESIGN.md) 9章
- ESLint は 9系を使っています。アクセシビリティの検査に使う `eslint-plugin-jsx-a11y` が ESLint 10 に未対応のためです
- **選手データの追加**：`schemas/batter_preset.schema.json` の形式で `data/presets/mlb/<season>/<id>.json` を作り（回数の成績だけを書く）、`verified: true` にする場合は `source` に取得元の URL と取得日を正確に書きます。リポジトリのフォルダで `pytest backend/tests/test_preset_schema.py` を実行して、検証が通ることを確かめます（CI でも検証されます）。wOBA・wRC+ の公表値は、出典で確かめた値だけを `reference_metrics` に書けます（DESIGN 7-5）

**API**（入力の検証は [`docs/DESIGN.md`](docs/DESIGN.md) 5章、出力は6章）

| エンドポイント | 内容 |
|---|---|
| `POST /lineup/evaluate` | 入力打順と推奨打順の期待得点、非効率%、損失点、シミュレーションの参考値、注意 |
| `POST /batters/metrics` | 打者ごとの打率・出塁率・長打率・OPS・四球率・三振率などと、注意 |
| `GET /presets`・`/presets/seasons`・`/presets/teams` | 選手データの一覧（球団で絞り込み、名前で検索）・シーズン・球団 |
| `GET /health` | 動作の確認 |

## 今後の拡張候補

公開用のサーバーへの配置（デプロイ）、進塁確率の差し替え（打者の成績と同じ年度・より詳しい状況別）、三盗・本盗・スクイズ・打球アウトでの進塁・状況別の併殺の割合のモデル化、対戦投手（プラットーン効果）とパークファクターの反映など。一覧は [`docs/DESIGN.md`](docs/DESIGN.md) 11章にあります。

## ライセンス

ソースコードは MIT ライセンスです（[`LICENSE`](LICENSE)）。`data/` の選手データの出典とライセンスは [`data/NOTICE`](data/NOTICE) を参照してください。統計データ自体の著作権は出典元に帰属します。

Lahman Baseball Database から生成した選手データは、元のデータベースのライセンスである Creative Commons Attribution-ShareAlike 3.0 Unported（CC BY-SA 3.0、http://creativecommons.org/licenses/by-sa/3.0/ ）で提供します。元のデータベースの著作権表示（原文）は「This database is copyright 1996-2025 by SABR, via generious donation from Sean Lahman.」です。元のデータからの改変の内容（同じシーズンの複数球団の成績の合算、打席数の計算など）は [`data/NOTICE`](data/NOTICE) に書いています。照合済みの2人（`verified: true`）の選手データも、成績が Lahman の値と同じなので、ライセンスの扱いは Lahman から生成した選手データに準じます（CC BY-SA 3.0）。Baseball Savant と Baseball-Reference の利用規約は未確認です。

依存ライブラリは、このリポジトリには含めていません（`npm ci`・`pip install` で取得します）。実行時に使う主な依存のライセンスは、各パッケージの公開情報で次のとおりです：react・react-dom（MIT）、@dnd-kit/core・@dnd-kit/sortable・@dnd-kit/utilities（MIT）、fastapi（MIT）、pydantic（MIT）、uvicorn（BSD-3-Clause）、starlette（BSD-3-Clause）、numpy（BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0）。

## 参考文献

- Tango, T., Lichtman, M., & Dolphin, A. (2007). *The Book: Playing the Percentages in Baseball*. Potomac Books.
- Bukiet, B., Harold, E. R., & Palacios, J. L. (1997). A Markov Chain Approach to Baseball. *Operations Research*, 45(1), 14–23.
- D'Esopo, D. A., & Lefkowitz, B. (1977). The Distribution of Runs in the Game of Baseball. In *Optimal Strategies in Sports* (S. P. Ladany & R. E. Machol, Eds.). North-Holland.
- Click, J. (2004, May 6). Run Expectancy Matrix and base-advancement rates (2003 MLB season data). Baseball Prospectus. Retrieved from https://baseballprospectus.com/?p=2844
- Baseball-Reference.com. (n.d.). 2003 American League Team Statistics. Retrieved from https://www.baseball-reference.com/leagues/AL/2003.shtml
- Baseball-Reference.com. (n.d.). 2003 National League Team Statistics. Retrieved from https://www.baseball-reference.com/leagues/NL/2003.shtml
- FanGraphs. (n.d.). Guts! (wOBA constants, 2025 season). Retrieved from https://www.fangraphs.com/guts.aspx
