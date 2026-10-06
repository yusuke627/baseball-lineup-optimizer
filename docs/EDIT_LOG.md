# 編集履歴

## 2026-10-01 15:10 Windows環境でのPython実行方法をCLAUDE.mdに記録
- 依頼内容: Windows側では既存の仮想環境のpythonを `python.exe -m ○○` 形式で使うことを記録する
- 変更ファイル: CLAUDE.md
- 変更理由: 次回以降のセッションでも同じ環境・実行形式が守られるようにするため（READMEは公開物でありローカルパスを載せないためCLAUDE.mdに記載）
- コミット: なし（CLAUDE.md は後に公開対象外としたためコミットしていない。2026-10-01 15:45 の記録を参照）
- 戻し方: git revert <ハッシュ>
- 注意点: CLAUDE.mdもリポジトリに含まれるため、ローカルパスはGitHub上で公開される

## 2026-10-01 15:14 /presets に表示用指標(summary)を配線
- 依頼内容: 未使用だった `_stats_to_summary()` を /presets から呼び、プリセット選択画面向けの指標を返す
- 変更ファイル: backend/app/main.py, backend/tests/test_api.py
- 変更理由: プリセット選択時に打率・本塁打・出塁率・長打率・wOBA・wRC+・盗塁数・盗塁成功率を表示する方針のため。BatterCountStats→BasicStats変換を `_to_basic_stats()` に切り出し /lineup/evaluate と共用。summaryにHR・PAを追加。打点(RBI)はモデル計算に使わず文脈依存の指標のため追加しない
- コミット: 8fe1217
- 戻し方: git revert 8fe1217
- 注意点: プリセットJSON自体は変更していない（summaryはレスポンス時に計算）

## 2026-10-01 15:30 .gitignoreを作成
- 依頼内容: .gitignoreを作成し、コミット済みのキャッシュ類を追跡対象から外す
- 変更ファイル: .gitignore（Mac側で `git rm --cached` により追跡解除したファイルがあればそれも含む）
- 変更理由: __pycache__ 等の生成物・OS/同期ツールのファイル・秘密情報をリポジトリに含めないため
- コミット: f5ed900
- 戻し方: git revert f5ed900
- 注意点: 追跡解除したファイルは手元には残るがリポジトリからは削除扱いになる

## 2026-10-01 15:45 CLAUDE.mdを公開対象から除外
- 依頼内容: CLAUDE.md はリポジトリで公開せず手元にだけ置く
- 変更ファイル: .gitignore
- 変更理由: CLAUDE.md はローカル環境固有の指示（ローカルパス等）を含むため。これに伴い、本ファイル冒頭の「Windows環境でのPython実行方法をCLAUDE.mdに記録」はコミット対象外となる（CLAUDE.md の変更自体は手元に残る）
- コミット: 3f77324
- 戻し方: git revert 3f77324
- 注意点: なし

## 2026-10-05 18:36 盗塁を案A・案B・最適打順探索・APIに反映
- 依頼内容: steal_probabilities() の結果が計算に渡されていない未配線を直し、SB/CSを得点期待値に反映する（案A・案B両方）
- 変更ファイル: backend/app/core/metrics.py, backend/app/core/transitions.py, backend/app/core/markov.py, backend/app/core/monte_carlo.py, backend/app/core/optimizer.py, backend/app/main.py, backend/tests/test_steals.py, docs/DESIGN.md, docs/VALIDATION.md, docs/EDIT_LOG.md
- 変更理由: 企図率を (SB+CS)/PA から (SB+CS)/(単打+四球+死球) に変更（盗塁機会あたりの確率として使うため、PA分母では過小評価になる）。案Aは盗塁遷移行列 S を打者の遷移の前に合成し、一塁走者を直前の打者とみなす近似。盗塁死で3アウトなら次イニングは同じ打者から。案Bは一塁走者本人を追跡するよう修正。最適化関数とAPIに盗塁確率を渡す。DESIGN.md の盗塁対象状態をS12→S13（実装どおり）に訂正し、打点を表示項目から外した
- コミット: 5616a8f
- 戻し方: git revert 5616a8f
- 注意点: APIの返す得点期待値が変わる（例: Judge/Arraez交互の9人で 7.428→7.345）。steal_probs/steals 省略時は従来と同一の値。DEFAULT_ADVANCE_PROBS は変更していない。案Bの盗塁なしの乱数列は従来と同一に保った

## 2026-10-06 14:31 .gitattributesを追加し改行コードをLFに統一
- 依頼内容: .gitignore / .gitattributes を整備し、キャッシュ類の追跡状況を確認する（報告3・8）
- 変更ファイル: .gitattributes, docs/EDIT_LOG.md
- 変更理由: Windowsで編集しMacでコミットする運用のため、改行コードの差分を防ぐ。.gitignore は依頼のエントリをすべて含んでいたため変更なし。Mac側の確認で .gitignore 対象の追跡済みファイルは無かったため追跡解除も不要。あわせて前回のコミットハッシュ(5616a8f)を記入
- コミット: b467dad
- 戻し方: git revert b467dad
- 注意点: 作業フォルダ内のテキストファイルはすべてLF（CRLF 0件）であることをWindows側で確認済み

## 2026-10-06 15:10 pip install -e ".[dev]" の失敗を修正し依存定義をpyproject.tomlに一本化
- 依頼内容: README記載の `pip install -e ".[dev]"` が失敗する問題を直し、requirements.txt との二重管理を解消する（報告4）
- 変更ファイル: backend/pyproject.toml, backend/requirements.txt（削除）, docs/EDIT_LOG.md
- 変更理由: hatchling がパッケージ名(baseball_lineup_optimizer)と同名のディレクトリを探して失敗していたため `[tool.hatch.build.targets.wheel] packages = ["app"]` を追加。コードで使っていない pandas を削除し、直接 import している pydantic を `>=2.11` で明記。requirements.txt は Python 3.13 で凍結した一覧で requires-python>=3.12 と整合しない可能性があるため削除し、pyproject.toml を唯一の依存定義とした
- コミット: bf1a880
- 戻し方: git revert bf1a880
- 注意点: プロジェクト外の新規仮想環境(Python 3.13.14)で `pip install -e ".[dev]"`・pytest 23件・uvicorn起動(/health, /presets)を確認。Python 3.12 は未確認（CIで確認予定）。READMEのセットアップ手順は元から `pip install -e ".[dev]"` のみで変更不要

## 2026-10-06 15:23 ruffのルールを明記し指摘を修正
- 依頼内容: ruff の指摘8件を修正し、ローカルとCIで同じルールになるよう設定を明記する（報告5）
- 変更ファイル: backend/pyproject.toml, backend/app/core/markov.py, backend/app/core/monte_carlo.py, backend/app/core/transitions.py, backend/app/main.py, docs/EDIT_LOG.md
- 変更理由: ruff 0.16 は設定なしで既定413ルールが有効になり、バージョンにより結果がぶれるため `[tool.ruff.lint] select = ["E4","E7","E9","F","I","B","UP"]`・`target-version = "py312"` を明記し、dev依存を `ruff>=0.16,<0.17` に固定。未使用import(4件)とimport順(3件)を `ruff check --fix --select F401,I001` で修正し、E741（markov.py の変数名 `I`）を `identity` に改名
- コミット: b81ef10
- 戻し方: git revert b81ef10
- 注意点: 計算結果が変わらないことを確認（固定打順16パターンの案A期待得点の差が最大0、seed固定の案B 3通りが完全一致、プリセットのイベント確率・盗塁確率の差が最大0）。metrics.py の max() 化（PLR1730）は採用ルール外のため変更していない。B・UP ルールでの追加指摘は0件

## 2026-10-06 15:39 mypyの設定を明記し型の指摘を修正
- 依頼内容: mypy の指摘8件を修正し、設定を pyproject.toml に明記する（報告6）
- 変更ファイル: backend/pyproject.toml, backend/app/core/transitions.py, backend/app/core/optimizer.py, docs/EDIT_LOG.md
- 変更理由: `[tool.mypy] python_version = "3.12"` を明記し、dev依存を `mypy>=2.3,<2.4` に固定（CIで新しい版が入って結果が変わるのを防ぐ）。指摘はいずれも型の絞り込み不足で、実行時に None が入る経路は無かった。transitions.py `_single_branches` は二塁・一塁走者がいるときだけ進塁確率を取り出して選択肢を作る形に書き換え（値・選択肢の順序は同一）、optimizer.py `find_optimal_lineup` は最良打順が必ず決まることを assert で明示
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: 計算結果が変わらないことを確認（固定打順16パターンの案A期待得点の差が最大0、seed固定の案B 3通りが完全一致、プリセットの確率の差が最大0）。`mypy app` は指摘0件で、残した指摘は無い。find_optimal_lineup（全探索、約20分）は実行していない
