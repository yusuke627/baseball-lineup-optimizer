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
- コミット: 79a4a57
- 戻し方: git revert 79a4a57
- 注意点: 計算結果が変わらないことを確認（固定打順16パターンの案A期待得点の差が最大0、seed固定の案B 3通りが完全一致、プリセットの確率の差が最大0）。`mypy app` は指摘0件で、残した指摘は無い。find_optimal_lineup（全探索、約20分）は実行していない

## 2026-10-06 15:57 非推奨警告を解消（pydanticのConfigDict移行・httpx2への置き換え）
- 依頼内容: pytest で出ていた非推奨警告2件を解消する（報告7）
- 変更ファイル: backend/app/schemas/batter.py, backend/pyproject.toml, backend/tests/test_api.py, docs/EDIT_LOG.md
- 変更理由: pydantic 2.13 で非推奨の class-based `Config`(populate_by_name) を、2.11 以降で推奨される `model_config = ConfigDict(validate_by_name=True, validate_by_alias=True)` に移行。starlette 1.7 の TestClient が httpx の使用を非推奨としているため、dev依存の `httpx>=0.27` を `httpx2>=2.0` に置き換え（コード内に httpx の直接 import は無い）。"2B"/"3B" と "doubles"/"triples" のどちらでも入力できることを確認するテストを追加
- コミット: 2b20464
- 戻し方: git revert 2b20464
- 注意点: 警告は抑制していない。プロジェクト外の新規仮想環境(Python 3.13.14)で `pip install -e ".[dev]"` 後、ruff・mypy 指摘0件、pytest 24件通過・警告0件を確認。計算結果の比較（案A 16パターン・案B 3通り・プリセット確率）も差なし

## 2026-10-06 17:01 遷移行列のキャッシュとOpenBLASのスレッド数の既定値でテスト・APIを高速化
- 依頼内容: テストが遅い問題を計測に基づいて改善する（報告9）
- 変更ファイル: backend/app/core/transitions.py, backend/app/__init__.py, backend/tests/conftest.py, backend/tests/test_transition_probabilities.py, docs/DESIGN.md, README.md, docs/EDIT_LOG.md
- 変更理由: 計測の結果、時間の大半は216x216の逆行列計算で、OpenBLASのマルチスレッド化が小さな行列でかえって遅くしていた。指示どおりまず遷移行列のキャッシュ(lru_cache、既定adv時のみ、配列は読み取り専用)を入れて計測し、次に `OPENBLAS_NUM_THREADS` の既定値1(setdefault、利用者の設定が優先)を追加して明確な追加効果を確認したため両方を採用。numpyを先にimportするテストファイルでも効くよう conftest.py で app を先に読み込む。キャッシュの同一性・読み取り専用を確認するテストを追加。DESIGN.md 9章に実測結果、READMEの「約20.5分」に改善前の値である旨を追記
- コミット: 137e0ca
- 戻し方: git revert 137e0ca
- 注意点: テスト全体 194.1秒→54.8秒(キャッシュのみ)→13.4秒、POST /lineup/evaluate 18.5〜29.0秒→11.0〜14.1秒→1.84〜1.90秒（Windows・Python 3.13.14・OpenBLAS 0.3.31）。案Aの期待得点の改善前との最大差 キャッシュのみ0・最終構成1.8e-15、seed固定の案Bは完全一致。BLASスレッド数1は pytest(全体・単独ファイル) と uvicorn 起動プロセスで threadpoolctl により確認（threadpoolctl は確認後にアンインストール、依存には未追加）。uvicorn --reload 起動、Mac(Accelerate等)環境での効果、改善後の全探索時間は未確認。slow マーカーは全体13秒のため導入していない

## 2026-10-06 17:13 VALIDATION.md 3章を複数シードで測り直し実行環境を更新
- 依頼内容: 3章の案B「4.0428」が再現しない件について、案A・案Bを測り直して記録し、実行環境を実際のバージョンで書き直す（報告10）
- 変更ファイル: docs/VALIDATION.md, docs/EDIT_LOG.md
- 変更理由: 特定シードの値は環境により変わりうるため、案Bを10シード（1〜10）×3万試行で測定し、平均・最小・最大と案Aとの相対誤差で評価する形に変更。案A 4.0607、案B 平均4.0663(+0.14%)・最小4.0438(-0.42%)・最大4.1030(+1.04%)で全シードが基準3%以内。7章の実行環境を測定に使った Windows 11 / Python 3.13.14 / numpy 2.4.4 / pytest 9.1.1 / fastapi 0.141.1 / pydantic 2.13.5 に書き直し、8章の「複数seedでの確認は今後の課題」を更新
- コミット: 524070b
- 戻し方: git revert 524070b
- 注意点: 4.0428 が再現しない原因は特定していない（この環境の seed=42 は 4.0550）。5章の数値は測り直していない。コード変更なし

## 2026-10-06 17:26 0.651の出典の扱いをVALIDATION.mdとDESIGN.mdで正確に記載
- 依頼内容: 0.651 が Baseball Prospectus 記事の2003年定数であることを正確に記載し、検証結果の位置づけを適切な強さに直す（項目7b差し替え版）
- 変更ファイル: docs/VALIDATION.md, docs/DESIGN.md, README.md, docs/EDIT_LOG.md
- 変更理由: VALIDATION.md 5-3節に 0.651 が調整値ではなくBP記事の定数であることを明記し、「強い裏付けとなる」という結論を、整合的ではあるが(1)定義がヒットを含む (2)適用方法は本プロジェクトの仮定 (3)同一出典で独立検証ではない (4)残差が残る、という注意点付きの記述に置き換え、本番コードに実装していない理由を添えた。5-4節は検証していない仮説の位置づけを明記し0.651の扱いと整合させた。DESIGN.md 3-3の行名を原文に忠実に直し、本番コード未使用の注記を追加。README「考慮していない要素」に進塁打を明記し、README・DESIGN.md の今後の拡張候補にRetrosheet等からのアウト時進塁の一括モデル化を追記
- コミット: d7d1a20
- 戻し方: git revert d7d1a20
- 注意点: コード変更なし。前回依頼の旧7b（0.651を事後的な当てはめ値とする修正）は未適用のため打ち消しコミットは不要。README の参考文献は変更していない

## 2026-10-06 17:40 GitHub ActionsのCIを追加
- 依頼内容: バックエンドのCI（Python 3.12/3.13）とプリセット検証のCIを追加する（報告2・8）
- 変更ファイル: .github/workflows/backend-ci.yml, .github/workflows/preset-validation.yml, docs/EDIT_LOG.md
- 変更理由: これまでCI設定が存在せず、READMEの「CIで自動チェック」と実態が一致していなかったため。backend-ci は backend/data/schemas とワークフロー自身の変更時に、3.12/3.13 のマトリクスで `pip install -e ".[dev]"` → ruff → mypy → pytest -v（全テスト）を実行。preset-validation はプリセット・スキーマの変更時に jsonschema と pytest のみで test_preset_schema.py を実行。permissions は contents: read、checkout は persist-credentials: false。アクションは2026-10-06時点の最新安定版 actions/checkout v7（v7.0.1）・actions/setup-python v7（v7.0.0）を使用し、setup-python v7 に cache-dependency-path 入力があることを action.yml で確認
- コミット: 14a3de9
- 戻し方: git revert 14a3de9
- 注意点: 同じコマンドをプロジェクト外の新規仮想環境(Python 3.13.14)で実行し、ruff・mypy 指摘0件、pytest 25件通過を確認。preset 検証は jsonschema/pytest 以外（numpy・fastapi・pydantic等）を読み込まずに3件通過することを確認。YAMLは構文解析できることを確認。GitHub Actions 上での実行と Python 3.12 は未確認（コミット後にActionsタブで確認）

## 2026-10-06 17:52 READMEにCIと対応Pythonバージョンを記載
- 依頼内容: CIの初回実行が緑であることを確認したうえで、READMEのCIと対応Pythonバージョンの記載を確定する（報告2・8）
- 変更ファイル: README.md, docs/EDIT_LOG.md
- 変更理由: ユーザーがGitHub Actionsで backend-ci の test (3.12)・test (3.13) がともに緑であることを確認したため、セットアップ節に対応Python 3.12/3.13（CIで確認）を明記し、ruff・mypy の実行方法と、CIの2つのワークフローの内容を記載。依存関係が pyproject.toml で管理されていることも明記
- コミット: 59c9ffc
- 戻し方: git revert 59c9ffc
- 注意点: 3.12 での動作はローカルでは未確認で、CI（ubuntu-latest）でのみ確認。3.14 以降は未確認のため記載していない

## 2026-10-06 18:05 READMEの検証結果と案Aの盗塁の近似の記述を実態に合わせる
- 依頼内容: README・DESIGN の記述が実態と一致しているかの最終確認（項目9）
- 変更ファイル: README.md, docs/EDIT_LOG.md
- 変更理由: README「検証結果」の「案A/B同士の収束（相対誤差約0.4%）」が VALIDATION.md 3章の測り直し結果（10シード、平均0.33%・最大1.04%）と食い違っていたため更新。README の案Aの説明が「厳密に計算」のみで、盗塁では一塁走者を直前の打者とみなす近似を用いている実装と一致していなかったため追記
- コミット: 2dea260
- 戻し方: git revert 2dea260
- 注意点: コード変更なし。セットアップ手順（新規環境）、Pythonバージョン（3.12/3.13はCIで確認）、盗塁の対象状態（DESIGN.md の S1・S13 と apply_steal_step の「一塁に走者あり・二塁が空き」が一致）、CIの記述は確認済みで変更不要

## 2026-10-06 19:21 打者成績の出典表記を実際のプリセットの出典に合わせる
- 依頼内容: README・DESIGN 3-1 の「FanGraphs リーダーボード」を、プリセットの source 欄に書かれた実際の出典に書き換える（N2）
- 変更ファイル: README.md, docs/DESIGN.md, docs/VALIDATION.md, docs/EDIT_LOG.md
- 変更理由: プリセット2件の source 欄の出典は Baseball Savant / Baseball-Reference（相互照合）であり、FanGraphs リーダーボードは使っていないため。README「データソース」と DESIGN 3-1「取得元」を書き換え、DESIGN 3-1 の取得項目に実際にJSONへ記載している PA を追加。VALIDATION.md 8章の「FanGraphs 2025年シーズンデータ」も実データ一般の表現に修正
- コミット: b0e2720
- 戻し方: git revert b0e2720
- 注意点: FanGraphs は wOBA/wRC+ の係数（Guts!）で実際に使用しているため、その記載と参考文献は残した。DESIGN 10章のスキーマ転載内の "example": "FanGraphs" は別途（N3）で転載ごと削除する

## 2026-10-06 19:35 全探索の所要時間を現行コードの実測値に置き換える
- 依頼内容: README・DESIGN の全探索「約20.5分（実測）」を現行コードで測り直した値に置き換える（N1）
- 変更ファイル: README.md, docs/DESIGN.md, docs/EDIT_LOG.md
- 変更理由: 「遷移行列をキャッシュしても約20.5分」という記載に対し、当時のコードにキャッシュは実装されておらず計測条件も不明だったため。現行コードで find_optimal_lineup（362,880通り）を計測し 512.1秒（約8.5分）を得たので、計測環境（Intel Core Ultra 7 265・Windows 11・Python 3.13.14・numpy 2.4.4、OPENBLAS_NUM_THREADS=1、キャッシュあり、盗塁あり）とともに記載。「キャッシュしても」「約1時間から」の表現は削除
- コミット: 8462a68
- 戻し方: git revert 8462a68
- 注意点: 計測は1回のみ。計測中は軽い作業（ruff・ファイル編集）のみ並行して実施。推定値は記載していない。optimizer.py 冒頭説明の「約1時間」は別途（N6）で修正する

## 2026-10-06 19:46 DESIGN.mdのスキーマ転載とPAの記述を実態に合わせ未確認事項を明記
- 依頼内容: DESIGN 10章のスキーマ転載をやめて実ファイル参照にし（N3）、DESIGN 2-1 の PA の記述を API の実際の挙動に合わせる（N5）。未確認事項を既知の注意点に記載する
- 変更ファイル: docs/DESIGN.md, docs/VALIDATION.md, docs/EDIT_LOG.md
- 変更理由: DESIGN 10章の転載スキーマが実ファイルと食い違っていた（verified 欄なし、league が必須でない）ため、転載をやめて schemas/batter_preset.schema.json を参照する形にした（あわせて表示用指標の計算タイミングを「起動時」から実際の「GET /presets のレスポンス時」に訂正）。DESIGN 2-1 は PA を自動計算と記載していたが、API では PA は入力必須で0のときのみ自動計算されるため、表と説明を実際の挙動に合わせ、PA を任意入力にするかをフロントエンド作成時の検討事項として7章に追加。VALIDATION.md 8章に、uvicorn --reload 起動時のスレッド数と、Accelerate 等の BLAS での効果が未確認であることを記載
- コミット: 34af723
- 戻し方: git revert 34af723
- 注意点: コード・APIの挙動は変更していない

## 2026-10-06 19:49 optimizer.pyの冒頭説明を現状に合わせる
- 依頼内容: optimizer.py モジュール冒頭の説明から古い記述（「約1時間」「DESIGN.md に追記予定」）を現状に合わせて直す（N6）
- 変更ファイル: backend/app/core/optimizer.py, docs/EDIT_LOG.md
- 変更理由: 全探索の所要時間は現行コードの実測で約8.5分（DESIGN.md 9章）であり、近似探索（multi_restart_hill_climb）をAPIで使う方針もDESIGN.md・READMEに記載済みのため、説明文を実態に合わせて参照先を明記
- コミット: bd70808（この編集履歴の追記は、ステージ漏れのため別コミット 67ba6a5 で追加）
- 戻し方: git revert bd70808（編集履歴の追記も戻す場合は git revert 67ba6a5 も実行）
- 注意点: docstring のみの変更でロジックは変更なし（計算結果の比較で、項目3以前に保存した基準値との最大差は高速化時と同じ 1.8e-15、案Bは完全一致）

## 2026-10-06 19:54 2026-10-01 15:10の記録の注意点に関する補足
- 依頼内容: 既存の記録は書き換えずに、2026-10-01 15:10 の記録の注意点が後の変更で解消済みであることを補足する（N4）
- 変更ファイル: docs/EDIT_LOG.md
- 変更理由: 2026-10-01 15:10「Windows環境でのPython実行方法をCLAUDE.mdに記録」の注意点「CLAUDE.mdもリポジトリに含まれるため、ローカルパスはGitHub上で公開される」は、2026-10-01 15:45 の変更（3f77324）で CLAUDE.md を .gitignore の対象にしたことで解消済み。CLAUDE.md は一度もコミットされておらず、GitHub上で公開されていない
- コミット: f3d1bb4
- 戻し方: git revert f3d1bb4
- 注意点: 既存の記録は変更していない（補足の追記のみ）

## 2026-10-06 20:10 READMEのCIと対応Pythonバージョンの記述を確認済みの事実に合わせて確定
- 依頼内容: GitHub Actions の結果確認を受けて、README の CI と対応Python（3.12 / 3.13）の記述を確認済みの事実に合わせて確定する
- 変更ファイル: README.md, docs/EDIT_LOG.md
- 変更理由: 「（GitHub ActionsのCIで動作を確認）」という表現を、実際に確認した内容（backend-ci で 3.12・3.13 ともに ruff・mypy・pytest（全件）が成功）に置き換え、CI節に 2026-10-06 の実行で backend-ci（3.12・3.13）と preset-validation が成功したことを追記。あわせて前回の記録のコミット欄に f3d1bb4 を記入
- コミット: 244893d
- 戻し方: git revert 244893d
- 注意点: 3.12 はローカルでは動かしておらず、CIでのみ確認。CIバッジは、リポジトリが非公開と見られ（GitHub API が 404 を返した）、外部の閲覧者にバッジが表示されることを確認できないため入れていない

## 2026-10-07 17:53 APIの入力検証を強化し143・162試合の換算値と警告を返す
- 依頼内容: フロントエンド実装の前提として、バックエンドの入力検証を強化する（PA は1以上必須）。試合数は143・162の両方を1回の実行で返し、PA と内訳の不一致は警告として返す（フロントエンド計画の段階0）
- 変更ファイル: backend/app/schemas/batter.py, backend/app/main.py, backend/app/core/metrics.py, backend/tests/test_validation.py, schemas/batter_stats_validation_cases.json, docs/DESIGN.md, README.md, docs/EDIT_LOG.md
- 変更理由: 従来は各成績が0以上であることしか検証しておらず、矛盾した成績（H > AB、2B+3B+HR > H 等）で負の確率になる・PAと全成績が0で500エラーになる・input_order の重複で500エラーになる・n_games に負の値や極端な値が通る、という問題があったため。エラー（422）: 各成績0〜20000、PA≥1、AB≤PA、H≤AB、2B+3B+HR≤H、SO+GIDP≤AB−H、n_games 1〜200、打者IDは1〜64文字。エラー（400）: input_order の重複。警告: AB+BB+HBP+SF+SH≠PA（計算は行い warnings で返す）。GET /presets の league はフォルダ名に使うため英小文字のみ許可（`../..` 等で想定外のフォルダを読みにいけた問題への対処）。レスポンスに totals_by_games（143・162試合）と warnings を追加（既存フィールドは変更なし）。**PA=0 の自動計算（内訳の合計で代用）は廃止**した。入力フォームで PA を必須にする方針と揃えるためと、全項目0で500エラーになっていたため
- コミット: 068b85c
- 戻し方: git revert 068b85c
- 注意点: APIの互換性に影響する変更（PA=0 を受け付けなくなる、矛盾した成績が422になる）。有効な入力に対する計算結果は変わらない（baseline.py: 案A 16パターンの基準値との最大差 1.776e-15＝高速化時と同じ値、案B 固定seed 3通りが完全一致、プリセットの確率の差0）。実プリセット2件はすべてのルールをエラー・警告なしで通ることをテストで確認。上限の20000と200は統計的根拠ではなく安全上の上限。入力打順の評価と最適打順の探索は同じエンドポイントの1回の呼び出しのため、warnings はそのレスポンスに1つだけある

## 2026-10-07 18:46 フロントエンドの骨組みを追加（React + TypeScript + Vite）
- 依頼内容: フロントエンドを frontend/ に作る。開発時は Vite のプロキシ経由で FastAPI を呼び、API は相対パスで呼ぶ（フロントエンド計画の段階1：骨組み）
- 変更ファイル: frontend/package.json, frontend/package-lock.json, frontend/.nvmrc, frontend/tsconfig.json, frontend/vite.config.ts, frontend/eslint.config.js, frontend/index.html, frontend/src/main.tsx, frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/index.css, frontend/src/test/setup.ts, README.md, docs/EDIT_LOG.md
- 変更理由: 画面の土台（見出しのみ）と、型チェック・lint・テスト・ビルドの仕組みを先に用意するため。API は相対パス /api/... で呼び、開発時は Vite のプロキシが /api を FastAPI(127.0.0.1:8000) に転送する（将来、FastAPI がビルド済みフロントも配信する単一サービス構成に移行しやすくするため。バックエンドのパスは今回変更していない）。依存: react・react-dom 19.3、vite 8.3、@vitejs/plugin-react 6.1、vitest 5.0、jsdom 30.1、Testing Library（react 16.3・dom 10.4・user-event 14.6・jest-dom 7.0）、eslint 9.39（@eslint/js・typescript-eslint 8.71・react-hooks 7.1・jsx-a11y 6.10・globals）、typescript 6.0.3、型定義（@types/react・@types/react-dom・@types/node）。バージョンは package-lock.json で固定
- コミット: 472a561
- 戻し方: git revert 472a561
- 注意点: Node.js 24.19.0 / npm 11.17.0（Windows 11）で、frontend/ での npm ci・typecheck・lint・test（1件）・build・開発サーバーの起動、および /api/health・/api/presets がプロキシ経由でバックエンドに届くことを確認。ほかのバージョン・OSは未確認。TypeScript は typescript-eslint の対応範囲（6.1未満）に合わせて 7.0 ではなく 6.0 系、ESLint は jsx-a11y の対応範囲（9まで）に合わせて 10 ではなく 9 系を使用（ESLint 9 はインストール時にサポート終了の警告が出る。jsx-a11y の対応後に 10 へ上げる）。node_modules と dist は .gitignore 済み（既存の設定で対象になっていることを確認）

## 2026-10-08 15:57 フロントエンドにAPI連携と手入力フォームを追加
- 依頼内容: API の呼び出しを型付きのクライアントに集約し、9人分の成績の手入力フォームと入力検証を実装する。API の検証エラーは日本語に置き換え、warnings はそのまま表示する（フロントエンド計画の段階2）
- 変更ファイル: frontend/src/api/types.ts, frontend/src/api/client.ts, frontend/src/api/client.test.ts, frontend/src/validation.ts, frontend/src/validation.test.ts, frontend/src/state/lineup.ts, frontend/src/components/StatsTable.tsx, frontend/src/components/ErrorBanner.tsx, frontend/src/components/ResultSummary.tsx, frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/index.css, README.md, docs/EDIT_LOG.md
- 変更理由: API の型とクライアント（エラーを 入力・サーバー・通信・キャンセル の4種類に分類し日本語メッセージに置き換える）を1か所に集約。入力検証はバックエンドと同じルールで実装し、共通の入力例 schemas/batter_stats_validation_cases.json の15例でバックエンドと同じ結果になることをテストで確認。成績の入力は9人×14項目の表とし、項目間の矛盾は入力した時点で、未入力はその欄を離れた後（または実行後）に表示。PA と内訳の不一致は注意として表示し、実行は妨げない。計算の実行・キャンセル（AbortController）と、API が返した値（1試合あたりの期待得点・打順・非効率%）および warnings（返ってきた文字列のまま）の表示を追加。入力を変えたら前の結果は消す。打者IDは枠ごとに固定の「打者A」〜「打者I」（打順の番号と混同しないため）
- コミット: c199c07
- 戻し方: git revert c199c07
- 注意点: 画面に表示する数値はすべて API が返した値で、フロントでは桁をそろえるだけ（確率・期待得点の計算はしていない）。キャンセルは画面側の通信を止めるだけで、サーバー側で始まった計算は最後まで実行されることがある（メッセージにも明記）。入力欄が126個あるため、変更した打者の行だけを描き直すようにした。開発サーバーのプロキシ経由で実際のバックエンドに対し、正常な入力で200（値・totals_by_games・warnings を取得）、矛盾した成績で422になることを確認。ブラウザでの見た目と操作は未確認（自動テストと通信の確認のみ）。プリセット選択・並べ替え・143/162試合の切り替え・選手名の表示は未実装（後の段階）。作者の環境では OneDrive の同期のため、段階の区切りごとに frontend/node_modules を削除してからコミットする運用にした（README に記載）

## 2026-10-08 16:14 READMEのフロントエンドの状況を現状に合わせて修正
- 依頼内容: README の冒頭の「フロントエンドは今後実装予定」と、「今後の拡張候補」の「フロントエンドの実装」を、現状（開発中）に合わせて直す
- 変更ファイル: README.md, docs/EDIT_LOG.md
- 変更理由: 同じ README の「フロントエンド（開発中）」の節と記述が合っていなかったため。冒頭は「開発中で、成績の手入力、計算の実行、結果の最小限の表示まで」とし、拡張候補は残りの機能（プリセット選択、打順の並べ替え、143試合・162試合の表示）に書き換えた
- コミット: 3da53e8
- 戻し方: git revert 3da53e8
- 注意点: 文章の修正のみで、コードの変更はない。ブラウザでの見た目と操作は、この時点では未確認

## 2026-10-08 17:27 入力エラーの出し方を直し、打者の内部IDと表示名を分離
- 依頼内容: ブラウザ確認で見つかった点のうち、(1) 規則に必要な欄がそろったら矛盾を判定する、(2) 実行時のエラーを打者ごとに要約して最初のエラー欄にフォーカスを移す、(7) 打者の表示名を変えられるようにし内部IDと分ける、を直す（フロントエンド計画の段階3）
- 変更ファイル: backend/app/schemas/batter.py, backend/app/main.py, backend/tests/test_validation.py, schemas/display_name_validation_cases.json, frontend/src/validation.ts, frontend/src/validation.test.ts, frontend/src/names.ts, frontend/src/names.test.ts, frontend/src/state/lineup.ts, frontend/src/components/StatsTable.tsx, frontend/src/components/ErrorSummary.tsx, frontend/src/components/ResultSummary.tsx, frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/api/types.ts, frontend/src/api/client.ts, frontend/src/api/client.test.ts, frontend/src/index.css, docs/DESIGN.md, README.md, docs/EDIT_LOG.md
- 変更理由: (1) 項目間の矛盾は、規則ごとに必要な項目が入力済みで正しければ判定するようにした（打数と安打だけで H ≤ AB を判定）。安打が打数を超えているときは、凡退の数に関する規則を重ねて報告しない。犠打は空欄なら0として扱うため、犠打の欄に触れる（または実行する）までは、打席数と内訳の不一致の注意を出さない。(2) 実行時の入力エラーは、ボタンのすぐ下に「N件の入力エラー（打者M人）」と打者ごとの要約を出し、最初のエラーの欄にフォーカスを移す。要約の打者名を押すとその打者の欄に移る。表の中の未入力エラーは、打者ごとに1行にまとめた。(7) 内部ID（b1〜b9、API に送る）と表示名（既定は打者A〜I、変更可）を分けた。API の warnings の文は打者IDで作られていたため、リクエストに任意の display_names（打者ID → 表示名）を追加し、指定時は表示名で作るようにした（省略時は従来どおり）。表示名は前後の空白を除いて1〜20文字、制御文字は不可、重複は不可で、フロントとバックエンドの両方で検証し、共通の入力例14件で一致をテストしている
- コミット: 36aa808
- 戻し方: git revert 36aa808
- 注意点: 計算結果は変わらない（baseline.py: 案A 16パターンの基準値との最大差 1.776e-15＝これまでと同じ値、案B 固定seed 3通りが完全一致、プリセットの確率の差0）。display_names を省略したリクエストの動作は従来と同じ。共通の成績の入力例15件の結果は変えていない。フロントのテストのうち「項目ごとのエラーがあるときは、項目間の矛盾や警告は報告しない」は、(1) の仕様変更に合わせて書き換えた。確認したのは自動テスト（フロント109件、バックエンド80件）・typecheck・lint・build・ruff・mypy で、ブラウザでの見た目と操作、開発サーバー経由での実際の通信は未確認。入力欄はまだ横に広い表のまま（カードへの変更は段階4）。制御文字の範囲は U+0000〜U+001F と U+007F〜U+009F で、ゼロ幅文字などの書式文字は対象外

## 2026-10-08 18:20 入力欄を打者ごとのカードにし、3段階の画面構成と配色の土台を追加
- 依頼内容: 入力欄を横スクロールを前提にしない構成（打者ごとのカード）にし、画面を「成績の入力 → 打順 → 計算と結果」に分け、デザインの土台（配色、文字、余白、ライト／ダーク）を作る（フロントエンド計画の段階4）。あわせて、段階3のブラウザ確認の結果を記録する
- 変更ファイル: frontend/src/components/BatterCards.tsx（新規）, frontend/src/components/StatsTable.tsx（削除。BatterCards.tsx に置き換え）, frontend/src/components/ResultSummary.tsx, frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/state/lineup.ts, frontend/src/index.css, frontend/scripts/contrast.mjs（新規）, frontend/package.json, README.md, docs/EDIT_LOG.md
- 変更理由: 入力欄は打者ごとのカードにし、14項目を「打席・打数／安打／四死球・三振／犠飛・犠打・併殺打／盗塁」のまとまりに分けて、画面幅に応じて折り返す（横スクロールなし）。画面は3つの段階に分け、打順の欄には現在の打順（表示名）を出す。打順は成績の入力枠とは別の状態（order）として持つようにした（並べ替えは段階7で追加。現在は入力の順のまま）。結果は、期待得点2つと非効率% を大きく出し、打順、注意、補足の順に並べた。配色は CSS 変数にまとめ、OS の設定に従ってライト／ダークを切り替える（手動の切り替えは無い）。コントラスト比は、CSS の変数を読んで計算するスクリプト（npm run contrast）で確認する
- コミット: 8b1fcfa
- 戻し方: git revert 8b1fcfa
- 注意点: 段階3（36aa808）は、ユーザーが 2026-10-08 にブラウザで5項目（打数と安打だけでの矛盾エラー、エラーの要約とフォーカスの移動、要約の打者名からの移動、表示名の重複エラーと空欄時の既定名への復帰、警告文への表示名の反映）を確認し、問題なし。段階4で確認したのは、自動テスト（フロント112件、バックエンド80件）・typecheck・lint・build・ruff・mypy と、コントラスト比の計算（ライト／ダークそれぞれ14組がすべて基準以上。文字は基準 4.5:1 に対し最小 5.70:1、部品は基準 3:1 に対し最小 4.46:1）。カードの見た目・折り返し・ダーク表示は、ブラウザでは未確認。コントラスト比を計算したのは CSS 変数の組み合わせで、実際の画面を測ったものではない。バックエンドは変更していない。新しいライブラリは追加していない（contrast.mjs は Node.js の標準機能のみ）。フロント構成の DESIGN への追記は段階9で行う

## 2026-10-08 19:03 入力欄と結果の数値の位置がそろうように修正
- 依頼内容: ブラウザ確認で見つかった2点を直す。(1) 犠打の項目名の横の「空欄可」が改行を起こし、犠打の欄だけ下にずれる。(2) 画面の幅によって、結果の大きな数字3つが横にそろわない
- 変更ファイル: frontend/src/components/BatterCards.tsx, frontend/src/index.css, frontend/src/App.test.tsx, docs/EDIT_LOG.md
- 変更理由: (1) 「空欄可」を項目名から外して入力欄の下の補足に移し、aria-describedby で犠打の入力欄に関連づけた。項目名は折り返さない指定にした。あわせて、項目のまとまりを同じ4列のグリッドにした（幅で並べる方式では、カードが狭いと「安打」の4つ目の本塁打だけが次の行に送られていたため）。カードの最小幅は 300px から 340px にした。(2) 数値3つは、幅640px以上では必ず同じ幅の3列、それ未満では必ず縦1列にした（これまでは幅によって2つと1つに分かれた）。見出しが2行になる枠があっても数値の高さがそろうよう、各枠の中で数値を下端に寄せた
- コミット: 4c1b8b5
- 戻し方: git revert 4c1b8b5
- 注意点: 原因となったコミットは 8b1fcfa（段階4）。確認したのは、自動テスト（フロント113件、バックエンド80件）・typecheck・lint・build・コントラスト比の計算と、Edge のヘッドレスモードで撮ったスクリーンショット（幅360px相当・700px・1200px）での目視。スクリーンショットは、ビルドした CSS と同じ構造の HTML を並べた確認用ページを撮ったもので、実際のアプリの画面を操作して撮ったものではない。実際の画面での確認は未確認。バックエンドは変更していない

## 2026-10-08 19:21 成績をほかの打者にコピーする機能を追加
- 依頼内容: 各打者のカードに「他の打者からコピー」と「この打者の成績を、ほかの全員にコピー」を置く（ブラウザ確認のたびの手入力を軽くするため、段階5の前に追加。フロントのみ）
- 変更ファイル: frontend/src/components/CopyControls.tsx（新規）, frontend/src/components/BatterCards.tsx, frontend/src/state/lineup.ts, frontend/src/App.tsx, frontend/src/copy.test.tsx（新規）, frontend/src/index.css, frontend/scripts/contrast.mjs, docs/EDIT_LOG.md
- 変更理由: コピーするのは成績の14項目の入力内容だけで、表示名と内部IDは変えない。コピー元の空欄は空欄としてコピーする。コピー先に1項目でも入力があるときは、ブラウザの標準ダイアログではなく、カードの中で上書きを確認する（全員へのコピーでは、入力済みの打者の名前を挙げる）。コピー元は選んでから「コピーする」を押す方式にした（選んだだけで実行すると、キーボードの矢印キーで選択肢を動かしたときに実行されてしまうため）。結果は role="status"（aria-live）の通知で伝え、確認を出したら「上書きする」へ、終わったら元の操作へフォーカスを移す。平均値や架空の成績を入れる機能ではない。コピーの操作をカードに足すため、カードの枠と、memo している入力欄の部分を分けた（エラーのあるカードの枠の色は、CSS の :has() で付けるようにした）
- コミット: 24ef3dc
- 戻し方: git revert 24ef3dc
- 注意点: 確認したのは、自動テスト（フロント125件、うちコピーのテスト12件。バックエンド80件）・typecheck・lint・build・コントラスト比の計算（主でないボタンの文字の組み合わせを1つ追加し、すべて基準以上）と、ビルドしたアプリを Edge のヘッドレスモードで撮ったスクリーンショット（幅1200pxのライト、幅760pxのダーク。初期表示のみ）での目視。コピーの操作そのものをブラウザで行う確認は未確認。コピーした打者は、触っていない欄の未入力エラーを出さない状態に戻る（実行ボタンを押した後は表示される）。:has() に対応していない古いブラウザでは、エラーのあるカードの枠の色が変わらない（入力欄の赤い枠とメッセージは出る）。バックエンドは変更していない。新しいライブラリは追加していない

## 2026-10-08 19:37 打者ごとの指標のAPIと、打席数が少ない打者への注意を追加
- 依頼内容: 打率などの指標をフロントで計算せず API で計算するためのエンドポイントを追加し、打席数(PA)が少ない打者がいるときの注意を warnings に追加する（フロントエンド計画の段階5。バックエンドのみ）
- 変更ファイル: backend/app/schemas/batter.py, backend/app/main.py, backend/tests/test_metrics_api.py（新規）, backend/tests/test_validation.py, docs/DESIGN.md, README.md, docs/EDIT_LOG.md
- 変更理由: POST /batters/metrics を追加し、1〜9人分の成績から、打者ごとに PA・HR・SB・CS と、打率（H/AB）・出塁率（(H+BB+HBP)/(AB+BB+HBP+SF)）・長打率（総塁打/AB）・OPS（出塁率+長打率）・四球率（BB/PA）・三振率（SO/PA）、その打者についての注意を返すようにした。率は既存の metrics.py の関数で計算し、丸めずに返す。分母が0の指標は null を返す（既存の関数は 0.0 を返すが、関数は変えず、エンドポイント側で判定した）。wOBA・wRC+ は返さない（係数が2025年MLBのもので、手入力の成績には当てはまらないことがあるため）。打席数の注意は、定数 LOW_PA_THRESHOLD = 200 を1か所に置き、PA がこれ未満の打者について、打者名と PA を入れた文を warnings に追加する（計算は止めない）。POST /lineup/evaluate と POST /batters/metrics は同じ文を返す。表示名（display_names）の扱いは、両方のエンドポイントで共通の処理にした
- コミット: 3d93dfc
- 戻し方: git revert 3d93dfc
- 注意点: 200 という基準値は本プロジェクトの目安で、出典・統計的根拠はない（DESIGN 2-1・6章と README に明記）。計算結果は変わらない（baseline.py: 案A 16パターンの基準値との最大差 1.776e-15＝これまでと同じ値、案B 固定seed 3通りが完全一致、プリセットの確率の差0）。API の互換性：PA が200未満の打者を含むリクエストでは、warnings に文が1つ増える（計算結果と、ほかのフィールドは変わらない）。実プリセット2件は PA が200以上で、注意が出ないことをテストで確認。共通の成績の入力例15件の warning は「PA と内訳の不一致」の有無を表すものとして扱い、打席数の注意は数えないようにテストを直した（入力例のファイルは変えていない。打席数の注意は API だけが出し、フロントは基準値を持たない）。確認したのは ruff・mypy・pytest（100件、うち新規20件）と baseline.py。フロントエンドは変更しておらず、今回はフロントのチェック（typecheck・lint・test・build）は実行していない（ユーザーの指示により npm ci をしていない）。コピー機能（24ef3dc）と前回の修正（4c1b8b5）は、ユーザーが 2026-10-08 にブラウザで確認し、問題なし。新しいライブラリは追加していない

## 2026-10-12 16:30 wOBA・wRC+の計算をやめ、プリセットに公表値の参考値の欄を追加
- 依頼内容: wOBA と wRC+ を API でもフロントでも計算せず、プリセットのJSONに任意の「参考値」の欄を設けて公表値を表示できるようにする。あわせて、表示名の上限を40文字にし、プリセットのスキーマの2点（PA の最小値、知らないキーの検出）を直す（フロントエンド計画の段階6a。値はユーザーが確認してから別のコミットで入れるため、仕組みだけを作る）
- 変更ファイル: schemas/batter_preset.schema.json, schemas/display_name_validation_cases.json, backend/app/main.py, backend/app/core/metrics.py, backend/app/schemas/batter.py, backend/tests/test_preset_schema.py, backend/tests/test_api.py, backend/tests/test_validation.py, backend/tests/test_metrics_api.py, frontend/src/api/types.ts, frontend/src/names.ts, frontend/src/names.test.ts, frontend/src/App.tsx, frontend/src/App.test.tsx, docs/DESIGN.md, README.md, docs/EDIT_LOG.md
- 変更理由: 公式の wOBA は故意四球を除くが、このアプリの成績には故意四球がなく、wRC+ は球場補正を要するため、アプリでは計算せず、公表値を保存して表示する方針にした。GET /presets の summary から wOBA・wRC_plus を外し、metrics.py の計算（woba・wrc_plus）と係数（GUTS_2025）を削除した。プリセットのスキーマに任意の reference_metrics（wOBA・wRC_plus の少なくとも一方、対象シーズン、出典名、https:// で始まる出典のURL、取得日、任意の備考）を追加し、GET /presets は書かれた値をそのまま返す（無ければ null）。参考値には別の確認状況の欄を持たせず、「書いてあること自体が出典で確認済み」という決まりにした（verified は成績の確認状況のまま）。対象シーズンがプリセットの season と同じであることをテストで確認する。スキーマは、一番上の階層と reference_metrics で知らないキーをエラーにし、stats.PA を1以上にし、source.url も https:// で始まるものだけにした。表示名の上限は、長い選手名に重複時の番号を付けても収まるよう、20文字から40文字にした（バックエンド、フロント、共通の入力例14件）
- コミット: 5119f0c
- 戻し方: git revert 5119f0c
- 注意点: API の互換性に影響する変更（GET /presets の summary から wOBA・wRC_plus が無くなり、reference_metrics が加わる）。計算結果は変わらない（baseline.py: 案A 16パターンの基準値との最大差 1.776e-15＝これまでと同じ値、案B 固定seed 3通りが完全一致、プリセットの確率の差0）。data/presets/ の2件は変更しておらず、新しいスキーマをそのまま通る（参考値は入れていない）。テスト用の参考値はテストのコードの中だけにあり、実在の選手の値ではない。プリセットのキーを読む箇所（data_loader.py の id、main.py の stats）は、スキーマの変更の影響を受けないことを確認した。README の参考文献の FanGraphs "Guts!" の行は、ユーザーが出典に合わせて直すため触っていない（本文からは参照されなくなった）。スキーマの "format"（uri・date）は、テストで使っている jsonschema.validate では検査されないため、新しい欄の URL と日付は "pattern" で検査している（既存の source.retrieved_at の日付の形式は検査されていない）。確認したのは ruff・mypy・pytest（134件）・baseline.py と、フロントの typecheck・lint・test（125件）・build・contrast。画面での参考値の表示は未実装（段階6b以降）。段階5（3d93dfc）の push 後、GitHub Actions の Backend CI（Python 3.12・3.13）が緑だったことをユーザーが確認

## 2026-10-14 12:35 プリセットのスキーマで取得日の形式を検査
- 依頼内容: source.retrieved_at と reference_metrics.retrieved_at に、日付形式（YYYY-MM-DD）を要求する pattern を付ける（段階10 A1）
- 変更ファイル: schemas/batter_preset.schema.json, backend/tests/test_preset_schema.py, docs/EDIT_LOG.md
- 変更理由: スキーマの "format": "date" は、テストで使っている jsonschema.validate では検査されないため、source.retrieved_at にも pattern を付けた（reference_metrics.retrieved_at には 6a で付け済み）。不正な形式（2026/01/01、2026-1-1、20260101、時刻つき、前後の空白、空文字など）を拒否するテストを、両方の欄に追加した
- コミット: a519a0a
- 戻し方: git revert a519a0a
- 注意点: 既存の2件（Aaron Judge 2025、Luis Arraez 2025）は、そのまま検証を通ることを確認。6a（5119f0c）の push 後、GitHub Actions の backend-ci（3.12・3.13）と preset-validation がすべて緑だったことをユーザーが確認

## 2026-10-14 12:35 DESIGNのNPBプリセットの注意書きを今の方針に合わせて修正
- 依頼内容: DESIGN 2-3 の NPB の注意書きを、「NPB のプリセットは今は提供しない。架空名のプリセットは作らない」という内容に直す（段階10 A2）
- 変更ファイル: docs/DESIGN.md（2-3 の末尾の段落）, docs/EDIT_LOG.md
- 変更理由: 「架空選手として用意する」という以前の記述が、架空名のプリセットを作らない今の方針と合っていなかったため。法的な断定は書かず、「リスクを避けるため」とした
- コミット: bb7e216
- 戻し方: git revert bb7e216
- 注意点: 同じ DESIGN.md に B の追記（2-4）もあるため、A2 と B を別のコミットにする場合は、Mac 側で部分的にステージする必要がある（報告のコミット手順を参照）

## 2026-10-14 12:35 使われていないpydanticのモデルを削除
- 依頼内容: backend/app/schemas/batter.py の SourceInfo・BatterPreset・ManualBatterInput の参照を、プロジェクト全体で検索し、参照が無ければ削除する（段階10 A3）
- 変更ファイル: backend/app/schemas/batter.py, docs/EDIT_LOG.md
- 変更理由: frontend/node_modules と data/raw を除くプロジェクト全体（backend、tests、docs、scripts、schemas、frontend/src を含む）を検索し、3つのクラスへの参照は定義そのものだけだった（schemas/batter_preset.schema.json の "title": "BatterPreset" は JSON Schema の名前の文字列で、クラスへの参照ではない）。API・テストのどこからも使われていないため削除した
- コミット: a697cb6
- 戻し方: git revert a697cb6
- 注意点: 計算結果は変わらない（baseline.py: 案A 16パターンの最大差 1.776e-15＝これまでと同じ値、案B 固定seed 3通りが完全一致、プリセットの確率の差0）

## 2026-10-14 12:35 Lahmanの元データから候補を集計するスクリプトを追加（dry-runのみ）
- 依頼内容: Lahman 2025 の CSV からプリセットの候補を集計する scripts/build_lahman_presets.py を作る。今回は --dry-run のみで、プリセットは生成しない（段階10 B）
- 変更ファイル: .gitignore, scripts/build_lahman_presets.py（新規）, backend/tests/test_build_lahman_presets.py（新規）, docs/DESIGN.md（2-4 を新設）, docs/EDIT_LOG.md
- 変更理由: プリセットを数百件に増やす準備として、stint の合算、PA の計算（AB+BB+HBP+SF+SH）、PA 200 以上での絞り込み、最終所属球団（stint の番号が最大の行）と在籍した球団の一覧、API と同じ入力検証、既存プリセットとの全項目の比較を行い、報告する。空欄は 0 とみなさず「欠損」とし、プリセットに使う項目が欠損した選手は候補にしない。元データは data/raw/ に置き、.gitignore でリポジトリから除外する
- コミット: bb7e216
- 戻し方: git revert bb7e216
- 注意点: **実データでの試験集計は未実施**。2026-10-14 時点で、Windows 側の作業フォルダに data/raw/lahman/ が存在しなかった（data/ の中は presets だけ）。そのため、対象人数・球団別の人数・複数球団の在籍者数・検証違反・欠損値の実際の状況・既存2件との比較表は得られていない。スクリプトの動作は、テストの中の合成データ（実在の選手・球団の記録ではない）だけで確認した（テスト15件）。Lahman 2025 版の列名（yearID、stint、teamID、nameFirst、nameLast、name など）が想定どおりかは未確認。stint の番号が在籍の順を表すかは、Lahman の readme で未確認。scripts/ は CI（backend-ci）の paths と ruff の対象に入っていない（テストは backend/tests にあるので CI で実行される）。data/presets/ には何も作っていない

## 2026-10-14 15:56 Lahman 2025の試験集計の結果をDESIGNに記録
- 依頼内容: Lahman 2025 の実データで scripts/build_lahman_presets.py --dry-run を実行し、DESIGN 2-4 の「未実施」「未確認」の記述を、測定した内容に更新する（段階11a）
- 変更ファイル: docs/DESIGN.md（2-4）, docs/EDIT_LOG.md
- 変更理由: 実データ（The SABR Lahman Baseball Database 1871-2025、readme の Release Date: Dec 10, 2025）で確認した事実を書いた。列名は想定どおり。People.csv と Teams.csv は先頭に BOM があり Batting.csv にはないが、スクリプトは utf-8-sig で読むため修正は不要だった。readme の BATTING TABLE の stint の説明（"player's stint (order of appearances within a season)"）とライセンスの記述を原文のまま引用した。2025年の集計：PA 200 以上 348人、複数球団 35人（全員2球団、元の球団へ戻った選手なし）、検証違反 0人、合算する17列に空欄なし、同名の選手1組（Max Muncy）。既存の検証済み2件は成績の14項目がすべて一致し、球団の表記の括弧の中のコード（NYY と NYA、SD と SDN）だけが一致しなかった
- コミット: d1d3ef6
- 戻し方: git revert d1d3ef6
- 注意点: スクリプトのコードは変更していない。PA 200 以上の選手に投手が含まれるかは未確認（使った3つの CSV には守備位置の情報がない）。計算した PA と公式の PA の差の一般的な大きさは未確認（既存2件では一致）。data/presets/ には何も作っていない。data/raw/ の元データはリポジトリに含めない（.gitignore 済み）

## 2026-10-14 15:56 CIでscripts/の変更時にも検査し、ruffの対象に加える
- 依頼内容: scripts/ を backend-ci の起動条件（paths）と ruff の対象に加える（段階11a）
- 変更ファイル: .github/workflows/backend-ci.yml, README.md（テスト・静的チェックの手順と CI の説明の2か所）, docs/EDIT_LOG.md
- 変更理由: scripts/build_lahman_presets.py だけを変えたときに CI が動かず、ruff の検査も受けていなかったため。push と pull_request の paths に "scripts/**" を足し、ruff の手順を `python -m ruff check . ../scripts` にした（作業フォルダは backend のまま）。scripts/ には設定ファイルが無く、backend で実行すると backend/pyproject.toml の設定（ルール・対象の Python 3.12）で検査されることを、ruff の --show-settings で確認した
- コミット: e4a4b84
- 戻し方: git revert e4a4b84
- 注意点: ワークフローの変更は paths の2行と ruff の1行（とコメント1行）だけ。mypy の対象は app のまま（scripts/ は含めていない）。GitHub Actions での実行結果は未確認（push 後に確認が必要）。ローカルでは同じコマンドで ruff・mypy・pytest（160件）が通った

## 2026-10-14 16:37 プリセットのスキーマに所属球団の欄を追加し、生成スクリプトに生成モードを追加
- 依頼内容: スキーマに任意の team_info・teams_played（と source.note）を追加し、scripts/build_lahman_presets.py に --generate と --sample を追加する。検証器を使い回す形にテストを直す（段階11b の 1・2・3・6）
- 変更ファイル: schemas/batter_preset.schema.json, backend/tests/test_preset_schema.py, scripts/build_lahman_presets.py, backend/tests/test_build_lahman_presets.py, docs/EDIT_LOG.md
- 変更理由: Lahman から作るプリセットに、所属球団（Lahman の teamID・Teams.csv の name・lgID）と、移籍した選手の在籍した球団（出場した順）を持たせるため。teams_played の最後の球団と team_info.code の一致、teams_played があるときの team_info の存在は、check_preset で検査する。「機械的に生成し、第二出典との照合は未実施」を書く場所として、source に任意の note を足した（provider・url・retrieved_at だけでは書く場所がなかったため。追加はこの1つだけ）。生成は、照合済みのプリセットがある2人（judgeaa01・arraelu01）を除き、ファイル名と id を <playerID>_<シーズン> にし、キーの順番・インデント・LF・末尾の改行を固定した。取得日は推測で埋めないよう --retrieved-at を必須にした。--sample は固定のシード（既定 2025）で選んだ選手の成績の表を出す。jsonschema.validate() を1件ずつ呼ぶと数百件で数秒かかることを測ったため、テストは検証器を1回だけ作る形にした
- コミット: 9a67eef
- 戻し方: git revert 9a67eef
- 注意点: 既存の2件は、新しい欄なしで変更せずに検証を通る（348件のスキーマのテストで確認）。テストのダミーの球団・選手は合成データで、実在のものではない。計算結果は変わらない（baseline.py: 案A 16パターンの最大差 1.776e-15＝これまでと同じ値、案B 固定seed 3通りが完全一致、プリセットの確率の差0）

## 2026-10-14 16:37 Lahman 2025から打者のプリセット346件を生成
- 依頼内容: Lahman 2025 から、PA 200 以上の選手のプリセットを生成する（照合済みの2人を除く）（段階11b の 2・7）
- 変更ファイル: data/presets/mlb/2025/ の346ファイル（新規。<playerID>_2025.json）, docs/DESIGN.md（2-3 のスキーマの決まり、2-4 の生成したプリセットと測定値）, docs/EDIT_LOG.md
- 変更理由: プリセットを数百件に増やすため。`python scripts/build_lahman_presets.py --season 2025 --generate --output data/presets/mlb/2025 --retrieved-at 2026-10-14` で生成した。取得日の 2026-10-14 は、利用者が回答した元データの取得日
- コミット: 491cf0a
- 戻し方: git revert 491cf0a
- 注意点: verified はすべて false（独立した第二出典との照合は未実施）。346件すべてが API と同じ入力検証・JSON Schema・PA 200 以上の確認を通った（pytest で各348件。既存2件を含む）。別のフォルダに生成し直し、346件すべてがバイト単位で同じになることを確認した。既存の2件のファイルはハッシュで変わっていないことを確認した。同じ名前の選手が2人いる（Max Muncy。muncyma01_2025 は Los Angeles Dodgers、muncyma02_2025 は Athletics）。球団名は Teams.csv の name のままで、「Los Angeles Angels of Anaheim」は一般に使われる「Los Angeles Angels」と異なる（書き換えていない）。固定のシードで選んだ10人と公式の成績との見比べは、利用者が行う（結果は未記録）。PA 200 以上に投手が含まれるかは未確認

## 2026-10-14 16:37 Lahman由来のプリセットの出典とライセンスの表示を追加
- 依頼内容: data/NOTICE を作り、README に出典・ライセンスと、移籍した選手の扱いを書く（段階11b の 4・5）
- 変更ファイル: data/NOTICE（新規）, README.md（データソース、プリセットデータについて、ライセンス）, docs/EDIT_LOG.md
- 変更理由: Lahman Baseball Database の readme の著作権表示とライセンス（原文のまま）、ライセンスのリンク、元のデータからの改変の内容（stint の合算、PA の計算、PA 200 以上の選択、形式の変換）、ライセンスの範囲（Lahman から生成したプリセットは CC BY-SA 3.0、コードはルートの LICENSE）を書いた。README には、移籍した選手は最後に出場した球団にだけ置かれ、移籍前の球団の選手としては表示されないことを書いた
- コミット: e63afab
- 戻し方: git revert e63afab
- 注意点: 法的な断定は書いていない。コードのライセンスは、ルートの LICENSE が MIT（README の記載とも一致）。LICENSE の著作権者の欄は「Copyright (c) 2026」で名前がない。照合済みの2件（Savant・Baseball-Reference 由来）のライセンスの扱いは、NOTICE では「Lahman から生成したものではない」と書くにとどめ、決めていない。README の参考文献欄は触っていない

## 2026-10-14 17:57 プリセットの球団コードを指定の表記に統一
- 依頼内容: 球団コードを利用者が指定した表記に統一する（AZ・CWS・CHC・KC・LAA・LAD・NYY・NYM・SD・SF・STL・TB・WSH。指定のない球団は Lahman の teamID のまま）。元の teamID は team_info.lahman_id に残す（段階11c の後続）
- 変更ファイル: scripts/build_lahman_presets.py, schemas/batter_preset.schema.json, backend/tests/test_build_lahman_presets.py, backend/tests/test_preset_schema.py, data/presets/mlb/2025/ の346ファイルのうち球団コードが変わったもの, data/NOTICE, docs/DESIGN.md（2-4）, docs/EDIT_LOG.md
- 変更理由: Lahman の teamID（NYA、SDN など）と、既存の照合済み2件の表記（NYY、SD）が別の体系で、同じ球団が2つのコードを持つ状態だったため。生成スクリプトに対応表 TEAM_CODE_BY_LAHMAN_ID（13球団）を置き、team_info.code と teams_played[].code を変換して書くようにした。スキーマは、球団コードを英大文字2〜3文字に制限し、任意の team_info.lahman_id を追加した。実際のプリセット全体で、球団コード・球団名・lahman_id の対応が1対1であることを検査するテストを追加した
- コミット: d72b21d
- 戻し方: git revert d72b21d
- 注意点: 346件を同じ入力・同じ取得日（2026-10-14）で生成し直し、生成前と比べて、変わったのは球団コードの部分だけであることを確認した（team_info.code が変わったのは138件、teams_played が変わったのは22件。全346件に lahman_id が加わり、その値は生成前の team_info.code と一致）。既存の照合済み2件のファイルは変わっていない（team の表記「(NYY)」「(SD)」は統一したコードと一致）。計算結果は変わらない（baseline.py: 案A 16パターンの最大差 1.776e-15、案B 固定seed 3通りが完全一致、プリセットの確率の差0）。ruff・mypy・pytest（1229件）が通った。teams_played の要素には lahman_id を持たせていない

## 2026-10-15 16:07 LICENSEに著作権者の名前を記入
- 依頼内容: LICENSE の著作権者を「Copyright (c) 2026 Yusuke Goto」にする。ほかの文言は変えない（段階6b M1）
- 変更ファイル: LICENSE, docs/EDIT_LOG.md
- 変更理由: 著作権者の名前が空欄だったため
- コミット: 91f3bfc
- 戻し方: git revert 91f3bfc
- 注意点: README のライセンス欄には著作権者の記載がないため、README は変更していない。LICENSE の末尾の日本語の注記（データの著作権は「FanGraphs等」の出典元の規約に従い、データの再配布権を主張しない、という内容）は、指示に従い変えていないが、Lahman 由来のプリセットを CC BY-SA 3.0 で提供するという data/NOTICE・README の記載と食い違っている（報告済み、未修正）

## 2026-10-15 16:07 照合済みの2件のプリセットに所属球団の欄を追加
- 依頼内容: aaron_judge_2025.json と luis_arraez_2025.json に team_info を追加する。成績や出典の値は変えない（段階6b M2）
- 変更ファイル: data/presets/mlb/2025/aaron_judge_2025.json, data/presets/mlb/2025/luis_arraez_2025.json, docs/DESIGN.md（2-4 の該当の1文）, docs/EDIT_LOG.md
- 変更理由: 球団での絞り込み（GET /presets?team=）と球団の一覧に、照合済みの2件も含めるため。Judge は NYY・New York Yankees・AL・lahman_id NYA、Arraez は SD・San Diego Padres・NL・lahman_id SDN
- コミット: 40df20c
- 戻し方: git revert 40df20c
- 注意点: 変更前の写しと行単位で比べ、差分は team_info の6行の追加だけ（成績・出典・そのほかの欄は同一、キーの順番も同じ）。team の文字列「New York Yankees (NYY)」「San Diego Padres (SD)」は変えていない。スキーマと check_preset の検証、球団コード・球団名・lahman_id の1対1の検査、baseline.py（プリセットの確率の差0）が通った

## 2026-10-15 16:07 10人の目視照合の結果をDESIGNに記録
- 依頼内容: 固定シード2025で選んだ10人の目視照合の結果を DESIGN 2-4 に記録する（段階6b M3）
- 変更ファイル: docs/DESIGN.md（2-4）, docs/EDIT_LOG.md
- 変更理由: 利用者から、10人の成績を公式サイトの数値と見比べて全員一致したと報告を受けた（2026-10-14）ため。照合先の公式サイト名は未記録、残りの336人は照合していないことも書いた
- コミット: ed3d19c
- 戻し方: git revert ed3d19c
- 注意点: 346件の verified は false のまま変えていない

## 2026-10-15 16:07 プリセットのシーズン・球団の一覧と、球団・名前での絞り込みのAPIを追加
- 依頼内容: GET /presets/seasons、GET /presets/teams、GET /presets?team=&q= を実装する（段階6b 1〜4）
- 変更ファイル: backend/app/main.py, backend/app/data_loader.py, backend/tests/test_presets_api.py（新規）, README.md（API の説明）, docs/DESIGN.md（2-2）, docs/EDIT_LOG.md
- 変更理由: プリセットが348件になり、全件の応答が約298 KB あるため、画面では球団や名前で絞り込んで取得する。球団の一覧はリーグ（AL・NL）ごとに球団名順で、選手数は最終所属で数える（移籍した選手は移籍前の球団に出ない）。q は球団に関係なく名前の一部で探し（大文字・小文字とアクセント記号を区別しない）、最大50件と総数を返す。team も q も無い呼び出しは、従来どおり全件を配列で返す（互換）
- コミット: ac7fd07
- 戻し方: git revert ac7fd07
- 注意点: team か q を付けたときの応答の形は {"total", "items"} で、付けないとき（配列）と異なる。球団コードは英大文字2〜3文字だけを受け付け（それ以外は422）、存在しない球団・シーズンは空の結果を返す。テストは合成データ（実在の選手・球団ではない）と実データの両方で23件。起動したバックエンドに HTTP で問い合わせ、実データ348件で動くことを確認した（数値は DESIGN 2-2）。計算結果は変わらない（baseline.py: 案A 16パターンの最大差 1.776e-15、案B 完全一致、プリセットの確率の差0）

## 2026-10-15 16:07 プリセットを球団から選んでカードに読み込む画面を追加
- 依頼内容: 「プリセットから読み込む」のダイアログ（シーズン → 球団 → 選手、検索の併用）、カードへの読み込み、上書きの確認、重複時の「 (2)」、編集済みの表示、「プリセットの値に戻す」、移籍した選手の表示、出典の表示、参考値の表示を実装する（段階6b 5〜10）
- 変更ファイル: frontend/src/components/PresetDialog.tsx（新規）, frontend/src/components/PresetInfo.tsx（新規）, frontend/src/format.ts（新規）, frontend/src/components/BatterCards.tsx, frontend/src/components/CopyControls.tsx, frontend/src/state/lineup.ts, frontend/src/names.ts, frontend/src/App.tsx, frontend/src/api/types.ts, frontend/src/api/client.ts, frontend/src/index.css, frontend/src/test/setup.ts, frontend/src/preset.test.tsx（新規）, frontend/src/format.test.ts（新規）, frontend/src/api/client.test.ts, frontend/src/names.test.ts, frontend/scripts/contrast.mjs, README.md（フロントの状況）, docs/DESIGN.md（2-2）, docs/EDIT_LOG.md
- 変更理由: プリセットを数が増えても選べるよう、ブラウザ標準の <dialog> で、シーズン（既定は最新）→ 球団（リーグごと、選手数つき）→ 選手（名前順、API の打率・出塁率・長打率・本塁打・打席）の順に選べるようにした。名前での検索も使える。読み込んだ打者のカードには、選手・シーズン・「球団名 (コード)」・移籍した選手の「年間合計（複数球団）」と在籍した球団・出典（Lahman 由来は「Lahman Baseball Database (SABR) / CC BY-SA 3.0」、verified が false なら「第二出典との照合は一部のみ（未確認）」）を出す。リンクは https:// で始まる URL だけで、rel="noopener noreferrer" を付ける。編集済みの判定は「今の入力がプリセットの成績と1項目でも違うか」で、値を戻せば解除される（空欄の犠打は0と同じに扱う）。参考値は編集していないときだけ表示する。コピーでは、プリセットとの結びつき・参考値は写さない
- コミット: 821f2c9
- 戻し方: git revert 821f2c9
- 注意点: 画面の数値はすべて API の値で、率の表示は桁と「.331」の形をそろえるだけ。jsdom が <dialog> の showModal を実装していないため、テストでは開閉だけを置き換えている（test/setup.ts）。フォーカスの閉じ込め・Esc キーで閉じる・ダイアログを閉じたときのフォーカスの戻り先は、ブラウザの標準動作で、自動テストでは確認していない（ブラウザでの確認が必要）。上書きの確認はダイアログを閉じたあとカードの中に出し、確認が終わると「プリセットから読み込む」ボタンへフォーカスを戻す。確認したのは typecheck・lint・test（157件、うちプリセットの画面15件）・build・contrast（新たに3組を追加し、すべて基準以上）と、開発サーバーのプロキシ経由で /api/presets/teams・/api/presets?team=CWS が実データを返すこと、初期画面のスクリーンショット。ダイアログを開いた状態の見た目は未確認

## 2026-10-15 17:13 プリセットの所属球団に地区を追加
- 依頼内容: プリセットの team_info に地区（division。E・C・W）を加え、346件を生成し直し、照合済みの2件にも追加する（段階6b修正 C1 のデータ）
- 変更ファイル: data/presets/mlb/2025/ の348ファイル（生成した346件と、aaron_judge_2025.json・luis_arraez_2025.json）, docs/EDIT_LOG.md
- 変更理由: 球団の選択画面を、リーグの中で東地区・中地区・西地区に分けるため。値は Lahman の Teams.csv の divID（2025年の30球団すべてに値があり、E・C・W のいずれか）
- コミット: e5a489b
- 戻し方: git revert e5a489b
- 注意点: 346件は同じ入力・同じ取得日（2026-10-14）で生成し直し、各ファイルの差分が division の1行だけであることを確認した。別のフォルダにもう一度生成し、346件すべてがバイト単位で同じ（再現性あり）。照合済みの2件は、Judge に "division": "E"、Arraez に "division": "W" の1行を足しただけ（成績・出典・ほかの欄は同一）。プリセットの確率の差は0（baseline.py）

## 2026-10-15 17:13 地区の欄をスキーマ・生成スクリプト・球団一覧APIに追加し、選手の要約にOPSを追加
- 依頼内容: スキーマと生成スクリプトに地区を加え、GET /presets/teams を地区ごとの順に並べる（C1）。選手の要約（summary）に OPS を加える（C2）
- 変更ファイル: schemas/batter_preset.schema.json, scripts/build_lahman_presets.py, backend/app/main.py, backend/app/core/optimizer.py（コメントの README の見出し名だけ）, backend/tests/test_presets_api.py, backend/tests/test_build_lahman_presets.py, backend/tests/test_preset_schema.py, docs/EDIT_LOG.md
- 変更理由: スキーマの team_info に任意の division（E・C・W）を追加。生成スクリプトは Teams.csv の divID を team_info.division に書く。GET /presets/teams は各球団に division を返し、リーグの中を東・中・西の順、地区の中を球団名順に並べる（地区の無い球団は null で最後）。summary の OPS は、既存の出塁率・長打率の関数の丸める前の値を足してから小数3桁に丸める（AVG・OBP・SLG と同じく、分母が0のときは既存の関数どおり0を返す）
- コミット: 4fb2926、7bf8f4c（2回に分けてコミット）
- 戻し方: git revert 7bf8f4c 4fb2926
- 注意点: C1 と C2 はどちらも backend/app/main.py を変えるため、1つのコミットにまとめた。API の互換性：/presets/teams の各球団に division が加わり、並び順が球団名順から地区・球団名順に変わる。summary に OPS が加わる。計算結果は変わらない（baseline.py: 案A 16パターンの最大差 1.776e-15、案B 完全一致、プリセットの確率の差0）。optimizer.py の変更は、README の見出しを「推奨打順の探索について」に変えたことに合わせたコメントだけ

## 2026-10-15 17:13 プリセットの選択画面のキーボード操作を直し、地区ごとの表示・上書きの確認・出典の1行表示にする
- 依頼内容: ブラウザ確認の指摘のうち、B1（球団を選んだあと Tab で選手へ進めない）、B2（球団を選んだあと Esc が効かない）を直し、C3（狭い画面で選手を球団の直後に出す）、C4（出典をカードの一番下の1行に）、C5（上書きの確認をダイアログの中に）、C6（移籍の表示を球団コードに）、C1・C2 の画面側（地区ごとの表示、OPS）を実装する
- 変更ファイル: frontend/src/components/PresetDialog.tsx, frontend/src/components/PresetInfo.tsx, frontend/src/components/BatterCards.tsx, frontend/src/components/CopyControls.tsx, frontend/src/format.ts, frontend/src/api/types.ts, frontend/src/index.css, frontend/src/preset.test.tsx, frontend/scripts/contrast.mjs, docs/EDIT_LOG.md
- 変更理由: B1：選手の一覧が、HTML の上で30球団のボタンのあと（右の列）にあり、Tab では残りの球団のボタン（NYY からなら19個）を通らないと選手に届かなかった（Edge 155 で再現）。選手の一覧を選んだ球団のボタンの直後に置く開閉式（aria-expanded・aria-controls）にし、広い画面では CSS で見た目だけ右の列に出すようにした（C3 も同じ方式で実現）。B2：Edge 155（ヘッドレス）では、球団をキーボードで選んだ場合もマウスで選んだ場合も、ダイアログの中の何もない所をクリックしてフォーカスが外れた場合も Esc で閉じ、利用者の環境での現象は再現できなかった（原因は未特定）。念のため、ブラウザ標準の cancel イベントに加えて、ダイアログの中で押された Esc キーも直接受け取って閉じるようにした。C5：上書きの確認を、プリセットのダイアログに重ねるもう1つのダイアログ（role="alertdialog"）にし、Esc とキャンセルは確認だけを閉じてフォーカスを選んでいた選手へ戻す。その際、中の確認ダイアログの close・cancel イベントが React の仕組みで外側のダイアログにも届き、外側まで閉じてしまうことが分かったため、外側はイベントの発生元が自分のときだけ扱うようにした。カードの中のコピーの確認は変えていない
- コミット: 56baa72
- 戻し方: git revert 56baa72
- 注意点: B1・B2・C5 は jsdom の回帰テストを追加し（球団の次の Tab が選手、Esc キーで閉じる、確認の Esc は確認だけを閉じる）、さらに Edge 155（ヘッドレス）を DevTools Protocol でキーボード・マウス操作して、幅 1200px と 600px で確かめた。B2 の原因は未特定のため、利用者の環境で直ったかは未確認。jsdom は <dialog> の showModal を実装していないため、テストでは開閉だけを置き換えている。広い画面では、下のほうの球団を選んでも選手の一覧はダイアログの上端の右に出る（スクロールの位置によっては見えない）。test 164件・typecheck・lint・build・contrast（上書きの確認の枠線の1組を追加、すべて基準以上）が通った

## 2026-10-15 17:13 画面とREADMEの「最適打順」を「推奨打順」に変更
- 依頼内容: 画面と README の「最適打順」を「推奨打順」に変える。API の項目名、アルゴリズム名、DESIGN の技術的な説明の「最適化」は変えない（C7）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/App.tsx, README.md（冒頭の説明、使い方、出力、見出し「推奨打順の探索について」）, docs/DESIGN.md（0章の概要と使い方、4章の「非効率%」の表示例）, docs/EDIT_LOG.md
- 変更理由: 打順は近似探索で求めており、最も期待得点が高い打順とは限らないため。画面の注記も「推奨打順は、期待得点が高くなる打順を近似探索で求めたものです。最も期待得点が高い打順とは限らず、実行のたびに変わることがあります。」にした
- コミット: 2c3303d
- 戻し方: git revert 2c3303d
- 注意点: 変えていないもの：API の項目名（best_order など）、関数名（find_optimal_lineup など）、README の「厳密な最適解」「局所最適解」「打順最適化」、DESIGN の題名「野球打順最適化アプリ」と9章などの探索の技術的な説明、DESIGN 4章の API の値の説明（totals_by_games・warnings の行）と「非効率%」の計算式、backend のコメント（README の見出し名を指す optimizer.py の1か所だけは、見出しの変更に合わせて直した）・pyproject の説明。テストには「最適打順」という言葉は無かった。docs/DESIGN.md には、C7 のほかに C1・C3〜C6 の説明（2-2・2-3）の変更も入っている

## 2026-10-15 17:28 出典の表示を、カードごとからページ下部にまとめる
- 依頼内容: カードごとの出典の1行（C4 で作ったもの）をすべて削除し、ページの一番下に常に表示する「データの出典」欄を作る（段階6b修正の追加）
- 変更ファイル: frontend/src/components/DataSources.tsx（新規）, frontend/src/components/DataSources.test.tsx（新規）, frontend/src/components/PresetInfo.tsx, frontend/src/components/BatterCards.tsx, frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/preset.test.tsx, frontend/src/index.css, docs/DESIGN.md（2-2）, docs/EDIT_LOG.md
- 変更理由: 出典をカードごとに出すとカードが高くなり、同じ出典が何度も並ぶため。欄は見出し（h2「データの出典」）とリストで、Lahman Baseball Database (SABR) / CC BY-SA 3.0（集計の方法と「第二出典との照合は一部のみ（未確認）」）と、照合済みの2人（Aaron Judge・Luis Arraez）の出典を並べる。照合済みの2人の出典名・URL・取得日は画面のコードに書き、プリセットのファイルの source と同じであることをテストで確かめる。参考値（reference_metrics）の表示は変えていない
- コミット: 56baa72（フロントのコミットに含めた）
- 戻し方: git revert 56baa72（フロントの変更全体が戻る）
- 注意点: 欄は main 要素の外の footer 要素に置いた（App は main と footer を並べて返す）。Lahman の URL（https://sabr.org/lahman-database/）は、プリセットのファイルを読まずに画面のコードに書いている（data/NOTICE・生成スクリプトと同じ値）。新しい色の組み合わせはない（補足の文字・リンク・本文と、ページの地の組み合わせは既存の確認に含まれる）

## 2026-10-15 18:01 LICENSEを標準のMITライセンスの形に戻し、READMEにデータのライセンスの参照先を追記
- 依頼内容: LICENSE の末尾の日本語の注記を削除して、標準の MIT ライセンスの本文と著作権表示だけにする。README のライセンス欄に「ソースコードは MIT、data/ のプリセットの出典とライセンスは data/NOTICE」を追記する。DESIGN の古い記述を直す（段階6d）
- 変更ファイル: LICENSE, README.md（ライセンス欄の1文目）, docs/DESIGN.md（2-4 のライセンスの項の括弧書き）, docs/EDIT_LOG.md
- 変更理由: LICENSE の注記（データの著作権・利用条件は「FanGraphs等」の出典元の規約に従い、データそのものの再配布権を主張しない、という内容）が、Lahman 由来のプリセットを CC BY-SA 3.0 で提供するという data/NOTICE・README の記載と食い違い、FanGraphs も今はデータの出典に使っていないため。MIT の本文（1〜21行目）は変えていない。DESIGN 2-4 の「具体的な表示の方法は、ファイルを生成する段階で決める」は、表示の場所が決まったため「表示は data/NOTICE、README のライセンス欄、画面の『データの出典』欄」に直した
- コミット: ddb48df
- 戻し方: git revert ddb48df
- 注意点: data/NOTICE は変更していない。NOTICE には、10人の目視照合の結果（照合は一部のみ）と、地区（team_info.division）を Teams.csv の divID から加えたことが書かれていない（報告済み、未修正）。README の参考文献欄（FanGraphs "Guts!" の行を含む）は触っていない。段階6b修正のハッシュ（e5a489b、4fb2926・7bf8f4c、56baa72、2c3303d）を、それぞれの記録に記入した。Actions は緑（ユーザーが確認）

## 2026-10-15 18:12 NOTICEに目視照合の結果と地区の追加を記載し、READMEの照合状況の説明を合わせる
- 依頼内容: data/NOTICE の照合状況の記述を、10人の目視照合の結果に合わせて直し、改変の一覧に地区（team_info.division）の追加を書く。照合状況の記述の食い違いを確認する（段階6e の1・2）
- 変更ファイル: data/NOTICE, README.md（プリセットデータについての Lahman の項）, docs/EDIT_LOG.md
- 変更理由: NOTICE の「独立した第二の出典との照合を行っていません」は、固定シードで選んだ10人を利用者が公式サイトの数値と目視で照合し一致を確認したこと（2026-10-14）と合っていなかった。「一部（--sample で固定のシードにより選んだ10人）は公式サイトの数値と目視で照合し一致を確認。照合先の公式サイト名は記録していない。残りは照合していない。いずれも verified は false」に直した。改変の一覧に「所属地区（team_info.division。E・C・W）は Teams.csv の divID から加えた」を足した。README の「独立した第二の出典との照合はしていないため、verified: false」も同じ趣旨に直した
- コミット: b6bb55b
- 戻し方: git revert b6bb55b
- 注意点: 法的な断定は書いていない。画面の「データの出典」欄の「第二出典との照合は一部のみ（未確認）」と DESIGN 2-4 の記述は、直した NOTICE・README と食い違わないため変えていない。生成した346件の各ファイルの source.note には「独立した第二出典との照合は未実施」と書かれたままで、照合済みの10人も同じ文（データは変えていない。報告済み）

## 2026-10-15 18:12 貼り付け入力を導入しない方針をREADMEとDESIGNに反映
- 依頼内容: 表計算ソフトなどからの貼り付け入力（旧段階6c）を導入しない方針（2026-10-15 決定）を、README・DESIGN に反映する。2026年のプリセットが無い理由も書く（段階6e の3）
- 変更ファイル: README.md（プリセットデータについての項に2026年と貼り付けの方針、今後の拡張候補から貼り付けを削除）, docs/DESIGN.md（2-2：コピーの説明から貼り付けを外し、貼り付けを導入しない方針と2026年のプリセットについて追記）, docs/EDIT_LOG.md
- 変更理由: 貼り付けの機能を作らないことになったため、計画として残っていた記述を直した。2026年のプリセットは無く、2026年を含む Lahman の版が公開されれば同じ生成スクリプトで作れる見込みだが、公開の時期と内容は未確認と書いた
- コミット: 33ad24f
- 戻し方: git revert 33ad24f
- 注意点: frontend/src/state/lineup.ts の20行目のコメント「手入力・コピー・貼り付けの打者は null」に「貼り付け」が残っている（frontend のコードは変更しない指示のため、直していない。報告済み）。CLAUDE.md（公開しない）の概要も、貼り付けを外して現状に合わせた（コミットの対象外）。段階6d（ddb48df と思われるが、利用者からの連絡を待つ）のハッシュは、まだ記入していない

## 2026-10-15 18:42 打順のドラッグ用にdnd-kitを追加
- 依頼内容: 打順の並べ替えのドラッグに使う dnd-kit（@dnd-kit/core、@dnd-kit/sortable、@dnd-kit/utilities）を追加する（段階7）
- 変更ファイル: frontend/package.json, frontend/package-lock.json, docs/EDIT_LOG.md
- 変更理由: マウス・タッチ・キーボードでのドラッグと、読み上げの仕組みを1つの部品でそろえるため。導入前に npm のレジストリで確認した内容：latest は @dnd-kit/core 6.3.1（最終公開 2024-12-05）、@dnd-kit/sortable 10.0.0（同 2024-12-04）、@dnd-kit/utilities 3.2.2（同 2023-11-06）。間接的に入る @dnd-kit/accessibility 3.1.1（同 2024-11-23）と tslib 2.8.1。ライセンスはすべて MIT。peer 依存は react >=16.8.0（sortable は @dnd-kit/core ^6.3.0 も）で、使っている React 19.3 と合う
- コミット: 486747b
- 戻し方: git revert 486747b
- 注意点: npm install で5パッケージが加わり、npm audit は 0 件。package.json の記載は ^6.3.1・^10.0.0・^3.2.2（既存の依存と同じ ^ の形）で、実際に入る版は package-lock.json で固定。ビルドした JS は 250.83 kB から 306.87 kB に増えた（gzip で 78.79 kB から 97.37 kB。この段階の画面の追加分を含む）。更新が止まっている可能性（npm の公開日からの見立て）は DESIGN 2-2 に書いた

## 2026-10-15 18:42 打順の並べ替えと、打者ごとの指標・注意の表示を追加
- 依頼内容: 打順をドラッグ・「上へ」「下へ」・移動先の番号で並べ替えられるようにし、打者ごとの指標（POST /batters/metrics）と注意を表示する。計算と結果の上に注意の一覧を出す。lineup.ts のコメントを貼り付けを導入しない方針に合わせる（段階7）
- 変更ファイル: frontend/src/components/OrderList.tsx（新規）, frontend/src/components/BatterWarnings.tsx（新規）, frontend/src/useBatterMetrics.ts（新規）, frontend/src/App.tsx, frontend/src/state/lineup.ts, frontend/src/api/types.ts, frontend/src/api/client.ts, frontend/src/format.ts, frontend/src/index.css, frontend/src/order.test.tsx（新規）, frontend/src/state/lineup.test.ts（新規）, frontend/src/App.test.tsx, frontend/src/copy.test.tsx, README.md（フロントの状況）, docs/DESIGN.md（2-2 に「打順の並べ替え」）, docs/EDIT_LOG.md
- 変更理由: 打順を入力の枠とは別に並べ替え、そのまま計算の input_order に使うため。ドラッグが使えない環境でも、ボタンと番号の指定だけで全ての操作ができる。並べ替えたあとは動かした打者の同じ操作にフォーカスを戻し、aria-live で知らせる（ドラッグのときは dnd-kit の読み上げと二重にならないよう、こちらでは知らせない）。先頭の「上へ」と末尾の「下へ」は aria-disabled にして、理由を読み上げで伝える。計算したあとに成績・表示名・打順を変えると前の結果を消し、そのことを表示する（以前は黙って消していた）。指標と注意は API の値・文をそのまま表示する（フロントでは計算しない。値が null のときは「—」）。画面の「並べ替えは開発中です」の文言は削除した。lineup.ts のコメントは「手入力の打者と、ほかの打者からコピーした打者は null」にした
- コミット: f24b9b7
- 戻し方: git revert f24b9b7
- 注意点: 「計算と結果」の上の一覧は、打席数が少ない打者だけでなく、API が返した注意がある打者すべてを出す（API が注意を文としてだけ返し、種類を区別できないため。基準値をフロントに持たせず、文の照合もしない）。打席数の注意だけに絞るにはバックエンドの変更が必要（報告済み、未対応）。バックエンドは変更していない。テストは 182件（並べ替えのロジック・ボタン・番号の指定・境界・aria-live の文・警告の表示・計算との関係など）。既存のテストのうち、最初の API の呼び出しを計算の呼び出しとみなしていた箇所と「API を呼ばない」の確認を、指標の API の呼び出しと区別する形に直した。ドラッグそのもの（jsdom では確認できない）は、Edge 155（ヘッドレス）を DevTools Protocol で操作して、キーボード（スペース→上矢印2回→スペース）・マウス・タッチのそれぞれで並び替わることと、読み上げの文を確かめた（幅 1200px と 400px、400px はダーク表示も）。実機のタッチ端末と、実際のスクリーンリーダーでの確認は未確認

## 2026-10-15 19:13 打者ごとの指標のAPIに、種類つきの注意と安打を追加
- 依頼内容: POST /batters/metrics の各打者に、種類つきの注意 warning_items（code と message）と、安打（H）を加える（段階7の追加）
- 変更ファイル: backend/app/schemas/batter.py, backend/app/main.py, backend/tests/test_metrics_api.py, docs/DESIGN.md（4章の POST /batters/metrics）, docs/EDIT_LOG.md
- 変更理由: 画面の「計算と結果」の上に、打席数が少ない打者だけの一覧を出すため。今ある注意は2種類で、バックエンドの中では既に PA_SUM_MISMATCH（打席数と内訳の合計が合わない）と LOW_PA（打席数が LOW_PA_THRESHOLD 未満）の名前で区別していた。PA_SUM_MISMATCH は共通の入力例とフロントの入力検証でも同じ名前なので、そのまま使った。種類は型（WarningCode）として1か所で定義した。warnings は互換のために残し、1回作った注意（warning_items）の message から作るので、2つはずれない。安打は、指標の表示に加えるため、PA・HR・SB と同じく入力値のまま返す
- コミット: 6dcd965
- 戻し方: git revert 6dcd965
- 注意点: LOW_PA_THRESHOLD の値（200）と注意の文言は変えていない。POST /lineup/evaluate の応答は変えていない。追加したテスト：通常の成績では注意なし、各 code が出る条件、LOW_PA の境界（199 で出て、200・201 で出ない）、warnings と warning_items の message の一致（なし・LOW_PA だけ・PA_SUM_MISMATCH だけ・両方）、H の値。計算結果は変わらない（baseline.py: 案A 16パターンの最大差 1.776e-15、案B 完全一致、プリセットの確率の差0）

## 2026-10-15 19:13 打順の画面の指標の並びと表記を変え、「打席数が少ない打者」の一覧を種類で選ぶ
- 依頼内容: 打順の各行の指標を AVG → PA → H → HR → OBP → SLG → OPS → K% → BB% → SB の順と略号の表記にし、読み上げは日本語にする。「計算と結果」の上の一覧を、種類が LOW_PA の注意がある打者だけにする（段階7の追加）
- 変更ファイル: frontend/src/components/OrderList.tsx, frontend/src/components/BatterWarnings.tsx, frontend/src/api/types.ts, frontend/src/index.css, frontend/src/order.test.tsx, docs/DESIGN.md（2-2 の打順の並べ替え）, docs/EDIT_LOG.md
- 変更理由: 指標は、画面には略号（AVG・PA・H・HR・OBP・SLG・OPS・K%・BB%・SB）を、読み上げには日本語（打率・打席・安打・本塁打・出塁率・長打率・OPS・三振率・四球率・盗塁）を出す（略号は abbr で aria-hidden、日本語は読み上げ専用の文）。以前出していた項目のうち、この一覧にないものはなかった（盗塁死は前から出していない）。安打は API の値を出す。K% と BB% は、API が返す割合（0〜1）を「21.5%」の形（小数点以下1桁のパーセント）にしている。「計算と結果」の上の一覧は、見出しを「打席数が少ない打者」にし、warning_items の code が LOW_PA の打者だけを出す。各行には、これまでどおりすべての注意を出す
- コミット: f24b9b7
- 戻し方: git revert f24b9b7
- 注意点: K%・BB% の表示は、前の段階から既に「6.7%」の形（割合×100、小数点以下1桁）だった。割合をパーセントの表記にするのは表記をそろえるだけで、新しい値は作らない（判断の理由は報告に記載）。フロントは基準の打席数や注意の文の判定をしていない。プリセットの選択画面の選手一覧の指標（「打率 .331 ／ …」の日本語の表記）は変えていない。test 184件・typecheck・lint・build・contrast が通った。新しいバックエンドで、プロキシ経由の API が warning_items と H を返すこと、画面に「打席数が少ない打者（1人）」が出ることを、Edge 155（ヘッドレス）で確かめた

## 2026-10-20 18:25 結果の画面を、入力した打順と推奨打順の左右表示に作り直す
- 依頼内容: 結果を「入力した打順」と「推奨打順」の左右表示にし、143試合・162試合の切替、各打順の上の期待得点、上に出す非効率%、各行の少なめの指標、推奨打順で動いた打者の印を付ける（段階8）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/App.tsx, frontend/src/index.css, frontend/src/result.test.tsx（新規）, frontend/src/App.test.tsx, README.md（冒頭の状況、フロントの状況、今後の拡張候補）, docs/DESIGN.md（4章に「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 2つの打順を見比べやすくするため。画面の数値は、期待得点（*_runs_per_game）、試合数ごとの合計（totals_by_games）、非効率%（inefficiency_percent）、指標（POST /batters/metrics）のどれも API の値をそのまま出し、フロントでは掛け算などをしない。試合数の切替はラジオボタンで、近くに「試合数のみの切替で、確率はMLBデータ・文献値のままです」と注記した。選んだ試合数は App が持ち、計算し直しても保つ。推奨打順の各行の「3番→1番」は、API の input_order と best_order の位置を比べるだけで、読み上げでは「入力した打順の3番から1番へ」と伝える。動かなかった打者には「変更なし」を出す。使わなくなった結果のスタイル（3つの大きな数字の枠と、打順を「→」でつないだ表示）は削除した
- コミット: a2e7ec0、062fa62（2回に分けてコミット。062fa62 は a2e7ec0 と同じ件名の末尾に「(2)」が付いたコミットで、結果の画面の変更は2つのコミットに分かれている）
- 戻し方: git revert 062fa62 a2e7ec0
- 注意点: バックエンドは変更していない（必要な値はすべて POST /lineup/evaluate と POST /batters/metrics の応答にあった）。モンテカルロ法（案B）の参考値（monte_carlo：mean・std・min・max・n_trials）は、表示の内容が計画からは決められないため、表示していない（案を報告済み）。テストは193件（左右の順番、期待得点が一覧の上にあること、非効率% が一覧より上にあること、143/162 の切替で API の値に変わること（テストの合計はわざと「1試合あたり×試合数」と違う値にしている）、キーボードでの切替、動いた打者・動かなかった打者の表示、各行の指標）。既存のテストのうち、結果の打順を「→」でつないだ文字列で探していた2か所を、新しい表示に合わせて直した。実際のバックエンドで計算し、Edge 155（ヘッドレス）で、幅 1200px で左右に並ぶこと、幅 400px（ダーク表示）で縦に積まれて入力した打順が先になること、キーボードの矢印で 162試合に切り替わること、横スクロールが出ないことを確かめた

## 2026-10-20 19:13 計算 API の応答に、推奨打順に対する入力打順の損失点を追加
- 依頼内容: POST /lineup/evaluate の応答に、1試合あたりと試合数（143・162）ごとの損失点を追加する（段階8の修正）
- 変更ファイル: backend/app/schemas/batter.py, backend/app/main.py, backend/tests/test_validation.py
- 変更理由: 画面に損失点を出すため。画面の数値は API の値だけを使う方針のため、差（推奨打順の期待得点 − 入力打順の期待得点）をサーバーで計算して返す。項目名は既存の命名に合わせ、1試合あたりを runs_lost_per_game、試合数ごとを totals_by_games[].runs_lost とした。試合数ごとの値は、同じ要素の best_order_runs − input_order_runs（表示する合計どうしの差と一致させるため）。既存の項目は変えていない（追加のみ）
- コミット: a998aa3
- 戻し方: git revert a998aa3
- 注意点: 探索は入力打順から始め、期待得点が高い打順だけを採るため、損失点は 0 以上になる。テストを2件追加（値が差と一致すること、9人とも同じ成績で推奨打順が入力打順と同じなら 0 になること）。pytest 1273件・ruff（. と ../scripts）・mypy が通った。baseline.py で、案A 16通りの差の最大 1.776e-15、案B（seed 固定）3件が完全一致、プリセットの確率の差 0 を確かめた（遷移・確率の計算は変えていない）。DESIGN・README の説明と EDIT_LOG への記録は、フロントの結果画面のコミットに含める

## 2026-10-20 19:13 結果の画面の修正（損失点、非効率の欄の余白、狭い画面でも左右表示、「入力打順」の表記、シミュレーションの欄）
- 依頼内容: 段階8の結果画面への指摘6点（損失点の表示、非効率の欄の余白、狭い画面でも左右に並べる、「入力した打順」を「入力打順」に、たためるシミュレーションの欄（案A）、テストと文書）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/api/types.ts, frontend/src/App.tsx, frontend/src/index.css, frontend/src/result.test.tsx, frontend/src/App.test.tsx, frontend/src/order.test.tsx, README.md, docs/DESIGN.md（4章）, docs/EDIT_LOG.md
- 変更理由: 損失点は API の runs_lost_per_game と、選んだ試合数の totals_by_games[].runs_lost をそのまま出す（フロントで引き算をしない。0 のときは「期待得点は同じです」と出す）。非効率の欄は、説明の注記に「.result .note」の上の余白（16px）がかかって数字との間が広がっていたため、上の余白は結果の欄の直下の注記（.result > .note）だけに付け、欄の中は margin を 0 にして grid の gap（4px）で段の間隔をそろえた（試合数の欄の注記も同じ原因で広がっていたので、同時に直った）。2つの打順は幅にかかわらず2列にし、各行の1行目を番号と表示名、印と指標を2行目以降に折り返す。幅 800px 未満では、期待得点を縦に並べ、列の内側の余白を小さくした（800px 以上では、印を表示名と同じ行に置く）。シミュレーションの欄は、入力打順の一覧の下に、初期は閉じたボタン（aria-expanded・aria-controls）で置き、monte_carlo の mean・std・n_trials だけを出す
- コミット: a2e7ec0、062fa62（2回に分けてコミット）
- 戻し方: git revert 062fa62 a2e7ec0
- 注意点: この修正は、まだコミットしていない段階8の1つ目の変更（2026-10-20 18:25 の記録）と同じファイルを変えているため、1つのコミットにまとめる（18:25 の記録とこの記録のコミット欄には同じハッシュを入れる）。「入力打順」に変えたのは、画面の文言・読み上げ・テスト・README（冒頭・使い方・フロントの状況）・DESIGN 4章の「結果の画面」。変えていないのは、API の項目名、DESIGN の要件の説明（冒頭の「ユーザーが入力した打順」など）・非効率% の計算式・探索の説明、backend のコメント、過去の EDIT_LOG。DESIGN 4章で、前回の記録で「結果の画面」を挟んだため別の項目の下に付いていた2つの補足（確率は MLB のまま、n_games の互換）を、元の項目の下に戻した。損失点の1試合あたりは、指示の「○.○○」（小数2桁）ではなく、一覧の上の期待得点と同じ小数3桁にした（2桁にすると、期待得点の差と見た目が合わないことがあるため）。test 200件・typecheck・lint・build・contrast が通った。実際のバックエンドと Edge 155（ヘッドレス）で、幅 320・360・400・800・1200px（ライト・ダーク）で、2列が左右に並ぶこと、横スクロールが出ないこと、列からはみ出す要素がないこと、文字の大きさが幅で変わらないこと、非効率の欄の段の間隔がすべて 4px であることを確かめた。幅 320px では、長い英字の表示名が単語の途中で折り返される
## 2026-10-20 19:37 結果の画面で、入力打順と推奨打順の同じ番号の行の高さをそろえる
- 依頼内容: 狭い画面や長い名前で、2つの打順の行の高さがずれる（推奨打順の印の分だけ下がる）問題を直す（段階8の追加修正）
- 変更ファイル: frontend/src/index.css, frontend/src/result.test.tsx, docs/DESIGN.md（4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 2つの列が別々に縦に並んでいたため、片側の行だけが高くなると、それ以降の行がずれていた。外側を12行（見出し・期待得点・9人・シミュレーションの欄）のグリッドにし、各列と各一覧を subgrid にして行を共有した。行が反対側に合わせて高くなっても、中身は上に詰める（align-content: flex-start）。HTML・aria・順番は変えていない（CSS だけの変更）
- コミット: a2e7ec0、062fa62（2回に分けてコミット）
- 戻し方: git revert 062fa62 a2e7ec0
- 注意点: 指定は @supports (grid-template-rows: subgrid) の中に置いたので、subgrid が使えないブラウザでは従来の表示（各列が独立して縦に並び、行の高さはそろわない）になる。打者は API が必ず9人で返す前提で、行の数（12・9）を CSS に書いている。Edge 155（ヘッドレス）で、長い名前（空白ありの40文字2人、空白なしの40文字1人）を入れ、幅 320・360・400・800・1200px で、シミュレーションの欄を閉じたときと開いたときの両方で、9行すべての上端・高さの差が 0、見出しと期待得点の上端の差も 0、横スクロールなし、列からはみ出す要素なし、名前の文字 16px を確かめた。subgrid の指定を打ち消して代わりの表示を再現すると、幅 1200px ではそろい、800px 以下ではずれる（最大 93〜309px）ことを確かめた。test 202件（構造と順番、キーボードの移動順の2件を追加）・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1273件が通った（backend は変更なし）
## 2026-10-20 20:19 結果の行を固定の構造にし、動いた打者の印と、狭い画面の表示名の短縮を変える
- 依頼内容: subgrid で高さを合わせたことで片側にできた大きな空白をなくすため、行の構造を固定し、動いた打者の印（狭い画面は「元9番」、動かない打者は読み上げだけ「変更なし」）と、狭い画面の表示名の短縮（A. Judge）を入れる（段階8の追加修正）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/format.ts, frontend/src/index.css, frontend/src/format.test.ts, frontend/src/result.test.tsx, frontend/src/App.test.tsx, docs/DESIGN.md（4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 行ごとに名前や印の折り返しで高さが変わっていたため。各行を「1行目（番号・狭い画面の印・表示名・広い画面の印。折り返さず、名前は…で省略）」と「指標の固定の格子（800px 未満は2列×3段、800px 以上は3列×2段、1100px 以上は6列×1段）」にし、どの打者でも同じ高さにした。行の上下の余白は 4px から 3px に、狭い画面の列の内側の余白と列の間隔は 8px から 6px に詰めた。subgrid による整列は残した。印は、狭い画面用「元9番」（枠なしの小さいアクセント色の文字）と広い画面用「9番→1番」を CSS で切り替え、どちらも aria-hidden にし、読み上げは1つの文（「入力打順の9番から1番へ」または「変更なし」）にまとめた。短縮のルールは format.ts の shortDisplayName の1か所に置いた
- コミット: a2e7ec0、062fa62（2回に分けてコミット）
- 戻し方: git revert 062fa62 a2e7ec0
- 注意点: 短縮は、空白で区切られた2語以上で、最初の単語がラテン文字（アクセントつきを含む）で始まり、残りに文字を含む単語がある名前だけ（「Judge (2)」のように残りが重複番号だけの名前と、「J.D. Martinez」のように最初の単語が既にイニシャルの名前は、そのまま）。テストに表示名を読む箇所があったため、結果の名前は title（フルネーム）で読むように直した。Edge 155（ヘッドレス）で、長い英字名（空白ありの40文字2人、空白なしの40文字1人）・短い名前・動いた打者・動かない打者を混ぜて実測し、幅 320・360・400・800・1200px のすべてで、9行の上端と高さの差が 0（シミュレーションの欄を開いても同じ）、横スクロールなし、指標のはみ出しなしを確かめた。1行の高さは 86px（800px 未満）・69px（800px）・52px（1200px）、9行の合計は 778・622・467px。subgrid を打ち消した再現でも行の高さは同じで、狭い画面で見出しの折り返しの分（27px）だけ片側が下がる。幅 320px では、推奨打順で動いた打者の名前は短縮しても「…」になることがある（例：T. Pla…）。結果の欄全体の高さは、幅 320px で 1642px（うち2つの打順の枠 1070px）、360px で 1574px、400px で 1549px（シミュレーションの欄は閉じた状態）。test 221件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1273件が通った（backend は変更なし）
## 2026-10-20 20:43 動いた打者の札、列の幅による名前の短縮と指標の数の切り替え
- 依頼内容: 動いた打者の印を枠と薄い背景の札にし、名前の短縮と指標の数（狭い列は AVG・OPS・HR・SB の4つ）を、画面の幅ではなく列の幅で切り替える（段階8の追加修正2）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/index.css, frontend/scripts/contrast.mjs, frontend/src/result.test.tsx, docs/DESIGN.md（4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 狭い列では名前と6つの指標が窮屈で、広い列では印が目立たなかったため。札は、アクセント色の文字と枠線、薄い背景（新しい変数 --color-badge-bg、ライト #e7f3ec・ダーク #17301f）にし、広い列では行の右端にそろえた。切り替えは container query で、各行（li）を container にした（列の section を container にすると、レイアウトの封じ込めで subgrid が効かなくなるため）。切り替えの幅は Edge 155 で実測した：「9番 Pete Crow-Armstrong 9番→1番」の1行目が 254.5px → 255px 以上でフルネームと「9番→1番」。最も広い指標 53.8px×3＋間隔 8px×2 = 177.4px に OPS が1以上の1桁分を見込み → 200px 以上で6つを3列×2段（未満は OBP・SLG を display: none で外して2列×2段）。指標の合計と間隔で 335.4px → 344px 以上で6列×1段。contrast.mjs に札の組み合わせを3つ追加した（文字と札の地、枠と札の地、枠と列の地）
- コミット: a2e7ec0、062fa62（2回に分けてコミット）
- 戻し方: git revert 062fa62 a2e7ec0
- 注意点: jsdom は container query を計算しないため、テストは DOM の構造・順番・属性と、CSS の規則の中身（index.css を読んで確認）で行い、実際の見え方は Edge で実測した。文字の幅はフォントによって変わる（実測は Windows の Edge）。container query が使えないブラウザでは、狭い列の表示（短い名前・「元9番」・指標4つ）になる。実測（長い英字名・短い名前・動いた打者・動かない打者を混ぜた状態）：幅 320・360・400・480・600・800・1200px のすべてで、入力打順と推奨打順の9行の上端と高さの差が 0、横スクロールなし、指標のはみ出しなし、札のある1行目とない1行目の高さが同じ（26px）。列の内側の幅は 120・140・160・200・260・335・508px、1行の高さは 69px（1200px のみ 52px）、9行の合計は 622px（1200px のみ 467px）、結果の欄全体は 1487・1419・1393・1323・1272・1177・996px。幅 480px（列の幅 200px）までは4つの指標と短い名前、600px からは6つの指標とフルネーム。test 227件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1273件が通った（backend は変更なし）
## 2026-10-20 20:54 狭い列の「元9番」の札を、番号の横から名前の後ろへ移す
- 依頼内容: 狭い列で「元9番」の札を名前の後ろに置き（例：「1番 A. Judge [元9番]」）、札は縮めず名前の側で省略する（段階8の追加修正3）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/index.css（説明のコメントのみ）, frontend/src/result.test.tsx, docs/DESIGN.md（4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 番号・名前・札の順に読める並びにするため。札の要素を名前の後ろへ移しただけで、札は前の段階から flex: none（縮めない）、名前は min-width: 0 と text-overflow: ellipsis（名前の側で省略）になっている。広い列の「9番→1番」（行の右端）は変えていない。札はどちらも aria-hidden のままで、読み上げの文（「入力打順の9番から1番へ」「変更なし」）は1行目の最後にあり、読み上げの順番は変わらない
- コミット: a2e7ec0、062fa62（2回に分けてコミット）
- 戻し方: git revert 062fa62 a2e7ec0
- 注意点: Edge 155（ヘッドレス）で、長い英字名3人・Pete Crow-Armstrong・一般的な長さの名前4人（Aaron Judge・Max Muncy・Fernando Tatis Jr.・Juan Soto）・短い名前1人を混ぜ、移す前と後で、名前が「…」になる数を数えた。幅 320・360・400・480px のすべてで、前後の数は同じだった（番号・名前・札の幅の合計と間隔の数が変わらないため）。一般的な長さの名前で札のある行は、320px で 3/3、360px で 1/3、400・480px で 0/3 が「…」になる（札のない行は 0/5）。札が切れた行はなかった。幅 320・360・400・480・600・800・1200px で、左右の同じ番号の行の上端と高さの差は 0、1行目の高さは札の有無によらず 26px、横スクロールなし。test 227件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1273件が通った（backend は変更なし）

## 2026-10-23 16:46 表示名の上書きの対応ファイル・スキーマと、生成スクリプトの --names-only を追加
- 依頼内容: 名前の接尾辞（Jr. / II / III）をプリセットの表示名に反映するため、対応ファイル、スキーマ、生成スクリプトの変更、テストを用意する
- 変更ファイル: data/overrides/display_names.json（新規）, schemas/display_name_overrides.schema.json（新規）, scripts/build_lahman_presets.py, backend/tests/test_display_name_overrides_schema.py（新規）, backend/tests/test_build_lahman_presets.py, .github/workflows/preset-validation.yml
- 変更理由: People.csv には接尾辞の項目がないため。対応ファイルは playerID をキーに、name・checked_at・checked_source（・note）を持つ。利用者が示した13人を、接尾辞を除いた名前でプリセット348件と照合し（アクセントと大文字・小文字は区別しない）、全員が一意に一致したので13件を入れた。checked_at は 2026-10-23、checked_source は「ユーザー確認（確認元の詳細は記録なし）」。スクリプトは、生成（--generate）で People.csv の名前に上書きを当て、新しい --names-only で既存のプリセットの name の行だけを書き換える。どちらも「元の名前の後ろに半角スペースと接尾辞を足す」以外の変更を受け付けない。preset-validation.yml は、data/overrides/** の変更でも動き、新しいスキーマのテストも実行するようにした
- コミット: f1a0139
- 戻し方: git revert f1a0139
- 注意点: スキーマの name の「ASCII のみ」は、接尾辞の部分に適用した（接尾辞より前は People.csv の表記のままとする指示のため、Ronald Acuña Jr. の「ñ」を許す）。--names-only は、name 以外の行・キーの順番・ファイル名が変わる場合、生成スクリプトの書き出しの形でないファイルがある場合、1件でも確かめに通らない場合に、何も書かずに止まる。上書きにあってプリセットにない playerID と、照合済みの2件（judgeaa01・arraelu01）は警告として一覧に出す。テストの名前・playerID はテスト用のダミー

## 2026-10-23 16:46 名前の更新：13人のプリセットの表示名に接尾辞を足す
- 依頼内容: 対応ファイルの13人のプリセットの name に、接尾辞（Jr. / II / III）を反映する
- 変更ファイル: data/presets/mlb/2025/ の13件（acunaro01, alvarna01, chishja01, garcilu04, guerrvl02, gurrilo01, harrimi04, hassero02, roberlu01, scottvi01, tatisfe02, wadela01, wittbo02 の各 _2025.json）, data/NOTICE, backend/tests/test_presets_api.py
- 変更理由: scripts/build_lahman_presets.py --season 2025 --names-only で書き換えた（Jr. が10人、II が2人、III が1人）。NOTICE の「元のデータからの改変」に、接尾辞を加えたこと（13人）と、成績・playerID・ファイル名は変えていないことを足した。テストには、対応ファイルの名前がプリセットに反映されていること、ほかのプリセットに接尾辞がないこと、検索（tatis・Tatis Jr・harris ii・hassell iii・acuna jr.）で見つかることを足した（検索の仕組みは変えていない）
- コミット: b2426f5
- 戻し方: git revert b2426f5
- 注意点: 13件とも、変わったのは3行目の name の行だけ（書き換え前に元データから作り直したものと比べて確認）。2回目の --names-only では0件で、ファイルは変わらなかった。書き換え前に、上書きなしで元データから一時フォルダに作り直した346件が当時のファイルとバイト単位で同じこと、書き換え後に、上書きありで作り直した346件が書き換え後のファイルとバイト単位で同じことを確かめた（retrieved_at は既存のプリセットに記録された 2026-10-14）。baseline.py は、案A 16通りの差の最大 1.776e-15、案B（seed 固定）3件が完全一致、プリセットの確率の差 0。照合済みの2件は変えていない

## 2026-10-23 16:46 結果画面の短縮表示：残りが接尾辞だけの名前は短縮しない
- 依頼内容: shortDisplayName に、最初の単語以外が接尾辞（Jr.・Sr.・II・III・IV）だけのときは短縮しない規則を足す
- 変更ファイル: frontend/src/format.ts, frontend/src/format.test.ts
- 変更理由: 「Tatis Jr.」が「T. Jr.」になるのを防ぐため。接尾辞の一覧は scripts/build_lahman_presets.py の NAME_SUFFIXES と同じ。「Fernando Tatis Jr.」→「F. Tatis Jr.」、「Michael Harris II」→「M. Harris II」、「Robert Hassell III」→「R. Hassell III」、「Vladimir Guerrero Jr.」→「V. Guerrero Jr.」、「Ronald Acuña Jr.」→「R. Acuña Jr.」と、「Tatis Jr.」などがそのままになることをテストした
- コミット: 8b7767f
- 戻し方: git revert 8b7767f
- 注意点: 名前が「…」で省略されるとき、末尾の接尾辞から消える問題と、「CJ Abrams」が「C. Abrams」になる件は、指示により直していない（デザイン調整の段階で扱う）

## 2026-10-23 16:46 文書：表示名の上書きと --names-only を DESIGN に記録
- 依頼内容: 対応ファイルと --names-only、確認元の記録がないことを文書に書く
- 変更ファイル: docs/DESIGN.md（2-4 に「名前の接尾辞（表示名の上書き）」、使い方の数、名前の項、4章「結果の画面」の短縮の規則）, docs/EDIT_LOG.md
- 変更理由: 生成方針（2-4）に、対応ファイルの形式、受け付ける変更の範囲、--generate と --names-only の動き、2026-10-23 の反映の結果を書いた。13人の表記は利用者が確認して手で入力したもので、checked_source が「ユーザー確認（確認元の詳細は記録なし）」であり、確認元のサイト名などは記録していないことを、事実として書いた
- コミット: 967592d
- 戻し方: git revert 967592d
- 注意点: README は変えていない。backend の ruff（. と ../scripts）・mypy・pytest 1342件、frontend の typecheck・lint・test 237件・build・contrast が通った

## 2026-10-23 17:38 3つの手順を、上部のタブで切り替える形にする
- 依頼内容: 成績の入力・打順・計算と結果の3つの手順を、上部のタブで切り替える形にする（段階9A）
- 変更ファイル: frontend/src/components/StepTabs.tsx（新規）, frontend/src/App.tsx, frontend/src/index.css, frontend/scripts/contrast.mjs, frontend/src/tabs.test.tsx（新規）, frontend/src/test/tabs.ts（新規）, frontend/src/App.test.tsx, frontend/src/order.test.tsx, frontend/src/result.test.tsx, frontend/src/preset.test.tsx, frontend/src/copy.test.tsx, docs/DESIGN.md（0章に「画面の構成（手順のタブ）」）, docs/EDIT_LOG.md
- 変更理由: 1ページを上から下まで見る作りでは、入力欄が長く、打順や結果まで遠かったため。WAI-ARIA のタブのパターン（←/→・Home/End、自動で有効化、roving tabindex）で、選んでいないパネルは hidden で隠すだけにし、状態を残す。各パネルの末尾に「次へ」のボタンを置いた。打席数が少ない打者の一覧は、これまでも「計算と結果」のすぐ上にあったので、そのタブの先頭に置いた。入力の誤りで計算できないときと、エラーの要約から欄へ移るときは、「成績の入力」のタブに切り替えてからフォーカスする（隠れたパネルの欄にはフォーカスできないため。flushSync で表示を済ませる）。タブの見た目は最小限で、選んでいるタブは太字と下線（3px）でも分かる。contrast.mjs にタブの組み合わせを4つ追加した
- コミット: eb69d3a、1c566f9（2回に分けてコミット。eb69d3a はタブ化のコードとテスト、1c566f9 は DESIGN と EDIT_LOG）
- 戻し方: git revert 1c566f9 eb69d3a
- 注意点: 既存のテストは、隠れたパネルの要素を探す前に該当のタブを選ぶように直した（削ったテストはない）。結果が「消えた」ことを確かめるテストは、隠れたパネルの中も探すようにした（hidden: true。隠れているだけで残っていても見落とさないため）。入力の誤りで計算できないとき、エラーの要約は「計算と結果」のタブにあり、画面は「成績の入力」のタブに移るので、要約は「計算と結果」のタブに戻ると見える（各欄の誤りは入力欄の下にも出る）。Edge 155（ヘッドレス）で、幅 320・360・400・480・600・800・1200px のすべてで、3つのタブが1行に収まり、高さ 45px、文字の切れなし、横スクロールなしを実測した（最初は幅 320px で「成績の入力」「計算と結果」の文字が切れたため、タブの幅を文字に合わせて分け、幅 360px 未満では番号の丸を出さないようにした）。「次へ」を押すと、タブが画面の上端に来ること（最初は、タブへのフォーカスでブラウザが先頭までスクロールしていたため、preventScroll にした）、打順のタブの中でキーボードのドラッグ（スペース → ↓ → スペース）で並べ替えられること、プリセットのダイアログを Esc で閉じるとフォーカスが開いたボタンに戻ることを確かめた。test 244件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1342件が通った（backend は変更なし）

## 2026-10-24 18:47 画面の文章を減らす（「説明」のボタン、文言の短縮、指標の状態の文を1回だけ、「プリセット」を「選手データ」に）
- 依頼内容: 補足を「説明」のボタン（その場で開閉する）の中へ移し、文を短くし、画面から「プリセット」という言葉を無くす（段階9B）
- 変更ファイル: frontend/src/components/Disclosure.tsx（新規）, frontend/src/components/WarningText.tsx（新規）, frontend/src/messages.ts（新規）, frontend/src/App.tsx, frontend/src/components/BatterCards.tsx, frontend/src/components/BatterWarnings.tsx, frontend/src/components/OrderList.tsx, frontend/src/components/ResultSummary.tsx, frontend/src/components/ErrorBanner.tsx, frontend/src/components/PresetInfo.tsx, frontend/src/components/PresetDialog.tsx, frontend/src/components/DataSources.tsx, frontend/src/api/client.ts, frontend/src/index.css, frontend/scripts/contrast.mjs, frontend/src/components/Disclosure.test.tsx（新規）, frontend/src/messages.test.ts（新規）, frontend/src/texts.test.tsx（新規）, frontend/src/order.test.tsx, frontend/src/result.test.tsx, frontend/src/preset.test.tsx, frontend/src/tabs.test.tsx, frontend/src/components/DataSources.test.tsx, README.md, docs/DESIGN.md（0章に用語と「画面の文章と『説明』のボタン」、4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 画面の説明が多すぎたため。共通の部品 Disclosure（「説明」＋▸/▾、aria-expanded・aria-controls、中身はボタンの直後、初期は閉じる、高さ 44px 以上）を作り、結果の「参考：シミュレーション」もこの部品にした。移した文は原文のまま（成績の入力の案内の先頭にだけ「成績は、率ではなく回数（カウント）で入力します。」を足した）。警告は最初の「。」までを表示し、残りを「（打者名）の注意の説明」の中に入れる（API の文は書き換えない）。結果の「計算時の注意」では、同じタブの「打席数が少ない打者」と同じ文（LOW_PA）を重ねて出さない。指標の状態の文は、各行ではなく打順の一覧の上に1回だけ出し、指標が出る前の行には見えない仮の一覧を置いて行の高さを保つ。出典の欄は、Lahman / SABR とライセンス名と、照合に使ったサイトと取得日の1文を常に表示し、詳しい内容は「出典の説明」の中に置いた。画面の「プリセット」は「選手データ」に置き換えた（コードの名前・API のパス・ファイル名・スキーマ名は変えていない）。試合数の切替の注記は、利用者の判断で、常に表示する形から「試合数の切替についての説明」の中に移した。contrast.mjs に「説明」のボタンの組み合わせを4つ足した
- コミット: f8f1e9e、e2f5e6c、94dd660（目的別に3つに分けてコミット。f8f1e9e はフロントのコード・テスト、e2f5e6c は README、94dd660 は DESIGN と EDIT_LOG）
- 戻し方: git revert 94dd660 e2f5e6c f8f1e9e
- 注意点: 近似探索の注意（40番）は、「最も期待得点が高い打順とは限らず、実行のたびに変わることがあります。」が1つの文で、途中で切ると文を書き換えることになるため、分けずにそのまま表示している（利用者の指示待ち）。キャンセルの通知は、client.ts の文を「計算をキャンセルしました。結果は表示しません。」にし、括弧の中の補足を ABORTED_DETAIL として「キャンセルについての説明」の中に原文のまま（括弧ごと）出す。指標の状態の文で、もとの「表示名を直すと、指標を表示します。」（表示名に誤りがあるとき）は、指示どおり「成績の入力が終わると、指標を表示します。」にまとめた。各行の読み上げの文（取っ手の名前など）には、指標の状態は含まれていなかった（各行の状態の文は画面の文だけだったので、削除した）。README は、画面と使い方の説明の4か所だけ「選手データ」に直し、API・ファイル・開発者向けの説明の「プリセット」は変えていない。参考文献の節は触っていない。Edge 156（ヘッドレス）で、幅 320・360・400・480・600・800・1200px のすべてで、横スクロールなし、「説明」のボタン13個の高さ 44px 以上（幅 400px 以下では、ボタンの文言が折り返して最大 61px になるものがある）・切れなし・はみ出しなし、結果の左右の行の上端と高さの差 0（説明をすべて開いたときも 0）、注意のない打順の行の高さが指標の出る前後で同じ（差 0）であることを実測した（注意のある行は、注意の文が加わる分だけ高くなる）。test 272件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1342件が通った（backend は変更なし）

## 2026-10-24 19:06 段階9Bの追加修正：近似探索の注意（一覧の40番）を短い1文にし、元の文を「説明」のボタンの中へ
- 依頼内容: 結果画面の末尾の近似探索の注意を「推奨打順は近似探索で求めたもので、最も期待得点が高いとは限りません。」にし、元の文を1文字も変えずに「推奨打順の探索についての説明」のボタンの中へ入れる
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/texts.test.tsx, docs/DESIGN.md（0章「画面の文章と『説明』のボタン」に追記）, docs/EDIT_LOG.md
- 変更理由: 段階9Bの記録（直前の記録）では、文の途中で分けると書き換えになるため分けずに指示を待っていた。利用者が表示する1文を決めたので、その文を表示し、元の文（「推奨打順は、期待得点が高くなる打順を近似探索で求めたものです。最も期待得点が高い打順とは限らず、実行のたびに変わることがあります。」）は原文のままボタンの中に置いた。ボタンは表示する文の直後で、結果の左右の打順の欄の外
- コミット: f8f1e9e、94dd660（2つに分けてコミット。f8f1e9e はフロントのコード・テスト、94dd660 は DESIGN と EDIT_LOG）
- 戻し方: git revert 94dd660 f8f1e9e
- 注意点: Edge 156（ヘッドレス）で、幅 320・400・800・1200px のすべてで、結果の左右の行の上端と高さの差が 0（説明をすべて開いたときも 0）、横スクロールなし、説明のボタン（このボタンを含めて14個）の切れ・はみ出しなしを実測した。test 272件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1342件が通った（backend は変更なし）

## 2026-10-24 19:48 注意の文の時制を、計算の前にも後にも使える言い方にする
- 依頼内容: 警告・注意の文で、計算が済んだかのような言い方（「行っています」など）を探し、計算の前にも後にも使える言い方に直す（段階9Bの追加修正2の作業2）
- 変更ファイル: backend/app/schemas/batter.py, backend/tests/test_metrics_api.py, frontend/src/messages.test.ts, frontend/src/order.test.tsx, frontend/src/texts.test.tsx
- 変更理由: 注意の文は stats_warning_items の1か所で作り、POST /batters/metrics（計算の前。warnings・warning_items）と POST /lineup/evaluate（計算の後。warnings）の両方で同じ文を返している（既存のテスト test_evaluate_and_metrics_return_the_same_warning_text で確認済み）。計算の前にも出るので、LOW_PA の「計算はそのまま行っています。」を「計算はそのまま行います。」に、PA_SUM_MISMATCH の「…正規化して計算しています。」を「…正規化して計算します。」にした（意味は同じ）。探した範囲（backend、frontend/src、schemas、docs、README、data/NOTICE）で、該当は この2つの文と、それを期待値に持つテストだけだった。schemas/batter_stats_validation_cases.json と docs には該当なし。フロントの画面の検証の文（「このままでも計算できますが…」）は、計算の前にも後にも使える言い方なので変えていない。データの出典の「打席数は…で計算しています」と NOTICE の「計算しました」は、選手データを作ったときの処理の説明で、注意の文ではないので対象外。注意の文に「ています」が無いことを確かめるテストを足した
- コミット: c89d7fd、f8f1e9e（2つに分けてコミット。c89d7fd はバックエンドの文とそのテスト、f8f1e9e はフロントのテストの期待値）
- 戻し方: git revert c89d7fd f8f1e9e
- 注意点: 数値の計算は変えていない。baseline.py で、案A 16通りの差の最大 1.776e-15、案B（seed 固定）3件が完全一致、プリセットの確率の差 0 を確かめた。ruff（. と ../scripts）・mypy・pytest 1344件が通った。uvicorn を再起動し、POST /batters/metrics が新しい文を返すことを確かめた

## 2026-10-24 19:48 段階9Bの追加修正2：「説明」のボタンの見た目を小さくする
- 依頼内容: 「説明」のボタンを、枠と地の無い、下線付きの小さな控えめの文字にする。押せる範囲は 44px 以上のまま
- 変更ファイル: frontend/src/components/Disclosure.tsx, frontend/src/index.css, frontend/scripts/contrast.mjs, docs/DESIGN.md（0章「画面の文章と『説明』のボタン」に追記）, docs/EDIT_LOG.md
- 変更理由: ボタンが目立ちすぎたため。文字は 0.85rem、色は --color-muted、下線は文言だけに付けた（▸ / ▾ はそのまま、下線なし）。押せる範囲は、ボタンそのものの高さ（min-height 44px）で確保し、文字を上下の中央に置いた（見えない余白。ボタンの外に広げる疑似要素は使っていないので、隣の部品と重ならない）。フォーカスの枠は、ほかの部品と同じ 3px の枠。contrast.mjs の「説明」のボタンの組み合わせを、新しい色（ページの地・結果の欄とバナーの地・注意の地の上の muted の文字）とフォーカスの枠（注意の地）に置き換えた
- コミット: f8f1e9e、94dd660（2つに分けてコミット。f8f1e9e はフロントのコード、94dd660 は DESIGN と EDIT_LOG）
- 戻し方: git revert 94dd660 f8f1e9e
- 注意点: Edge 156（ヘッドレス）で、幅 320・400・800・1200px のすべてで、14個のボタンの押せる高さが 44px、見た目の高さ（文字の高さ）が 22px（1行）、切れ・はみ出しなし、ほかのボタン・入力欄との重なりなし、結果の左右の行の上端と高さの差 0（説明をすべて開いたときも 0）、横スクロールなしを実測した。「参考：シミュレーション」は、幅 400px 以下で 61px だった件は解消した（押せる高さ 44px）。ただし幅 320px では、狭い列の中で文言が2行に折り返す（見た目の高さ 44px、押せる高さ 44px）。キーボードで移ったとき、フォーカスの枠（3px）が見えることを、幅 400px の撮影で確かめた。test 272件・typecheck・lint・build・contrast が通った

## 2026-10-24 20:29 成績の入力を、選手データを既定にする形に作り直す（カードの状態：未選択・選手データの要約／編集中・手入力）
- 依頼内容: 各打者のカードを、初めは未選択（「選手を選ぶ」「手入力する」だけ）にし、選手データを読み込んだら要約、「編集する」で入力欄、「手入力する」で入力欄を出す形にする（段階9D）
- 変更ファイル: frontend/src/state/lineup.ts, frontend/src/components/BatterCards.tsx, frontend/src/components/CopyControls.tsx, frontend/src/components/ErrorSummary.tsx, frontend/src/App.tsx, frontend/src/index.css, frontend/scripts/contrast.mjs, frontend/src/test/cards.tsx（新規）, frontend/src/cards.test.tsx（新規）, frontend/src/state/lineup.test.ts, frontend/src/App.test.tsx, frontend/src/copy.test.tsx, frontend/src/order.test.tsx, frontend/src/result.test.tsx, frontend/src/texts.test.tsx, frontend/src/tabs.test.tsx, frontend/src/preset.test.tsx, README.md（使い方の流れ、フロントエンドの説明）, docs/DESIGN.md（0章に「成績の入力のカード」）, docs/EDIT_LOG.md
- 変更理由: 選手データから選ぶことを既定にし、入力欄が9人分並ぶ長い画面をやめるため。打者の枠（BatterSlot）に、カードの状態 mode（unselected・preset・manual）と editing（選手データの編集中か）を足した。API に送る値（成績の入力値と表示名）は、これまでと同じものから作る。要約の数値は POST /batters/metrics の値（今の成績に対する値）を使い、まだ無いときは、編集していなければ GET /presets の summary を使う（どちらも API の値）。未選択のまま計算したときは入力エラー（「選手を選ぶか、手入力してください。」）にし、最初のエラーのカードの「選手を選ぶ」へフォーカスを移す。コピーの操作と、コピー元・コピー先は、入力欄を出しているカード（手入力・編集中）と未選択のカードに限り、要約のカードは上書きしない。上書きの確認は、利用者が入力した値（手入力の値、選手データを編集した値）が消える場合だけ出す。カードの操作のボタンは 44px 以上で、読み上げ名に打者名を入れた。contrast.mjs にカードのボタン・見出し・要約の組み合わせを足した
- コミット: 2cde07a、e559a61、8e9969f（目的別に3つに分けてコミット。2cde07a はフロントのコード・テスト、e559a61 は README、8e9969f は DESIGN と EDIT_LOG）
- 戻し方: git revert 8e9969f e559a61 2cde07a
- 注意点: 初めの状態は、もともと9人とも空（サンプルの値は無かった）。既存のテストは、入力欄を使う前に「手入力する」を押す補助（src/test/cards.tsx）を使うように直し、選手データのテストは「編集する」を押してから入力欄を見るように直した（削ったテストはない）。「成績の入力」の「入力のしかたの説明」の中の文「MLB の選手の成績は「選手データから読み込む」で入れられます。」は、ボタンの文言が「選手を選ぶ」に変わったため、ボタンの名前と合わなくなっている（文章は変えないルールのため、変えていない。利用者に報告済み）。「この打者の成績を、ほかの全員にコピー」の文言も変えていないが、要約のカードはコピー先から除く。Edge 156（ヘッドレス）で、幅 320・360・400・480・600・800・1200px のすべてで、未選択9人・要約9人・手入力9人のいずれでも横スクロールなし、ボタンの切れなし、ボタンの高さ 44px を実測した。成績の入力のタブの高さは、未選択9人で 1418〜604px、要約9人で 3251〜1054px、手入力9人で 7613〜2600px（幅 320px〜1200px）。読み込んだあとフォーカスが「編集する」へ移ることも確かめた。test 293件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）

## 2026-10-24 20:38 段階9Dの追加修正：選手を選ぶダイアログの見出しと、コピーの文言
- 依頼内容: 「入力のしかたの説明」のボタン名を「選手を選ぶ」に直し、ダイアログの見出しを「選手を選ぶ」に、コピーのボタンを「この打者の成績を、ほかの打者にコピー」にし、説明に「選手データを選んだ打者には、コピーされません。」を足す
- 変更ファイル: frontend/src/App.tsx, frontend/src/components/PresetDialog.tsx, frontend/src/components/CopyControls.tsx, frontend/src/components/BatterCards.tsx（コメントのみ）, frontend/src/copy.test.tsx, frontend/src/preset.test.tsx, frontend/src/texts.test.tsx, README.md（フロントエンドの説明のコピーの部分）, docs/DESIGN.md（0章「成績の入力のカード」）, docs/EDIT_LOG.md
- 変更理由: 段階9Dでボタンの文言が「選手を選ぶ」に変わり、説明の文とダイアログの見出しが合わなくなったため。ダイアログの名前は見出し（aria-labelledby）から付くので、見出しを変えるだけで読み上げ名も「選手を選ぶ」になる。開くボタンの見える文言「選手を選ぶ」・読み上げ名「打者Aの選手を選ぶ」と合う。コピーは要約のカードを除くため、ボタンの文言を「ほかの打者にコピー」にし、説明のコピーの文の直後に「選手データを選んだ打者には、コピーされません。」を足した。コピー後の通知（実際の人数）は変えていない
- コミット: 2cde07a、e559a61、8e9969f（目的別に3つに分けてコミット。2cde07a はフロントのコード・テスト、e559a61 は README、8e9969f は DESIGN と EDIT_LOG）
- 戻し方: git revert 8e9969f e559a61 2cde07a
- 注意点: 「選手データから読み込む」は、画面（文・aria-label・title）には残っていない（新しいテストで確認）。frontend/src に残るのは、そのことを確かめるテストの名前と期待値だけ。test 294件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）

## 2026-10-24 20:58 選手を選ぶダイアログに「続けて次の打者を選ぶ」を足す
- 依頼内容: 選手を選ぶダイアログにスイッチ「続けて次の打者を選ぶ」を置き、オンのときは読み込んでも閉じずに、読み込み先を次の未選択の打者へ移す（段階9E）。あわせて段階9Dの記録にコミットのハッシュを記入する
- 変更ファイル: frontend/src/components/PresetDialog.tsx, frontend/src/components/BatterCards.tsx, frontend/src/index.css, frontend/scripts/contrast.mjs, frontend/src/preset.test.tsx, README.md（使い方の流れに1文）, docs/DESIGN.md（0章に「続けて次の打者を選ぶ」）, docs/EDIT_LOG.md（段階9Dの2件の記録のコミット・戻し方の行にハッシュを記入し、この記録を追記）
- 変更理由: 9人を選手データから選ぶとき、打者ごとにダイアログを開き直す手間を減らすため。スイッチは初めオフで、値はダイアログの部品の状態として持つ（ダイアログは閉じてもアンマウントしないので、ページを開いている間は残る。localStorage には保存しない）。次の読み込み先は、今の読み込み先より後ろの最初の未選択の打者で、いなければ先頭から探す。読み込み先が変わったことは、ダイアログの中の知らせ（role="status"、aria-live="polite"）で伝える。未選択の打者が残っていなければ、閉じて最後に読み込んだ打者の「編集する」へフォーカスを移し、「9人の選手がそろいました。」（人数は実際の数）と知らせる。閉じる・Esc のときのフォーカスは、読み込んだ打者がいれば最後の打者の「編集する」、いなければ開いたボタン。オフのときの動作は変えていない。contrast.mjs にスイッチの文字とチェックの組み合わせを足した
- コミット: 525c5c6、282b147、4b329d0（目的別に3つに分けてコミット。525c5c6 はフロントのコード・テスト、282b147 は README、4b329d0 は DESIGN と EDIT_LOG）
- 戻し方: git revert 4b329d0 282b147 525c5c6
- 注意点: 9人を同じ球団から選ぶ操作の回数を、テストで数えた：スイッチありで12回、スイッチなしで19回。Edge 156（ヘッドレス）で、幅 320・400・800・1200px のすべてで、スイッチは 169×44px で切れないことを実測した。幅 400px 以上ではダイアログに横スクロールは無いが、幅 320px ではダイアログの中に 22px の横スクロールが出る（原因は検索の入力欄（幅 16em）で、スイッチを隠しても同じ。この段階より前からあり、範囲外のため直していない。利用者に報告済み）。9人を続けて読み込むと、閉じて最後の打者の「編集する」へフォーカスが移り、「9人の選手がそろいました。」が出ることも実機で確かめた。test 302件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）

## 2026-10-24 21:08 段階9Eの追加修正：幅 320px で選手を選ぶダイアログに出ていた横スクロールを直す
- 依頼内容: 幅 320px で選手を選ぶダイアログに出る横スクロール（約22px）を、検索の入力欄の幅を width: min(16em, 100%) にする案を基本に直し、ほかの部品にはみ出しがないことを実測で確かめる
- 変更ファイル: frontend/src/index.css, frontend/src/preset.test.tsx, docs/DESIGN.md（0章「続けて次の打者を選ぶ」の実測の項目を、直したことに更新）, docs/EDIT_LOG.md
- 変更理由: 検索の入力欄が 16em（256px）のままで、幅 320px のダイアログの中の幅（218px）を超えていたため。修正前に幅 320・360・400px で、初め・球団の一覧・検索の結果・上書きの確認の4つの状態のダイアログの中の部品をすべて測り、はみ出していたのは検索のフォーム（入力欄とそれを包む欄・項目名）だけ（+38px）であることを確かめた。案のとおり width: min(16em, 100%) だけにすると、入力欄を包む .field が中身の幅（項目名の幅）で決まるため、どの幅でも入力欄が 193px（約12em）に縮んでしまった。そこで .preset-search .field に flex: 0 1 16em と min-width: 0 を足し、包む欄を 16em から縮められるようにした（.field は枠も地も無いので、見た目が変わるのは入力欄の幅だけ）
- コミット: 525c5c6、4b329d0（目的別に分けてコミット。525c5c6 はフロントのコード・テスト、4b329d0 は DESIGN と EDIT_LOG。README の変更は無い）
- 戻し方: git revert 4b329d0 525c5c6
- 注意点: 段階9Eの記録（2026-10-24 20:58）の注意点に書いた「幅 320px では 22px の横スクロールが出る」は、この修正で解消した。Edge 156（ヘッドレス）で、幅 320・360・400・800・1200px、4つの状態のすべてで、ダイアログとページの横スクロールが 0、はみ出す部品なし、スイッチの高さ 44px を実測した。検索の入力欄は幅 360px 以上で 256px（16em。以前と同じ）、幅 320px で 218px で、「Vladimir Guerrero Jr.」を入れても文字は切れない。球団のボタンと選手の行の幅は修正の前後で同じ。jsdom は幅を計算しないため、テストは CSS の規則（width: min(16em, 100%) と、包む欄の flex・min-width）を確かめる形にした（元の規則に戻すと失敗することを確かめた）。test 304件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）

## 2026-10-24 21:31 段階9Eの追加修正2：「続けて次の打者を選ぶ」を初期オンにし、読み込めたことを選手の行の下に出す
- 依頼内容: 「続けて次の打者を選ぶ」の初期状態をオンにし、読み込んだ選手の行の下に「打者Aに読み込みました」を出す（ダイアログを閉じるまで残す）
- 変更ファイル: frontend/src/components/PresetDialog.tsx, frontend/src/index.css, frontend/scripts/contrast.mjs, frontend/src/preset.test.tsx, README.md（使い方の流れの1文）, docs/DESIGN.md（0章「続けて次の打者を選ぶ」）, docs/EDIT_LOG.md
- 変更理由: 9人を選ぶ流れを既定にするため、スイッチの初期値を true にした（オンのとき・オフのときの動きは変えていない）。読み込めたことが行で分かるよう、ダイアログの部品に「選手のID → 読み込んだ打者名」を持ち、行の下に出す（開いたときに空にする。同じ選手をほかの打者に読み込み直すと上書き）。表示は aria-live の領域に置かず、「読み込む」ボタンの aria-describedby に結びつけ、読み込んだ直後の読み上げは従来の知らせの領域だけにした。行を折り返せるようにし（flex-wrap）、選手の情報を flex: 1 1 0 にして、ボタンは同じ行のまま表示を行の幅で出す。実測で、ダイアログが一番上にあるとき、最初の読み込みで上に知らせが出ると押した行が下へずれ（幅 320px で 89px、画面の外へ出た）、ブラウザのスクロールの自動調整も働かなかったため、押す前のボタンの位置を覚えて、描画の直後にダイアログのスクロール位置をその差だけずらすようにした。contrast.mjs に表示の文字の組み合わせを足した
- コミット: 525c5c6、282b147、4b329d0（目的別に3つに分けてコミット。525c5c6 はフロントのコード・テスト、282b147 は README、4b329d0 は DESIGN と EDIT_LOG）
- 戻し方: git revert 4b329d0 282b147 525c5c6
- 注意点: 初期オフを前提にしたテストは、削らずに直した（スイッチの初期値の確かめ、オフの動きのテストはスイッチをオフにしてから、オンの動きのテストはスイッチを押す操作を外した。上書きして閉じるテストはスイッチをオフにしてから行う。キーボードのテストは、読み込み先が打者Bへ移ることを確かめてから Esc で閉じる）。共通の補助 loadPlayer は、読み込んだあとダイアログが開いていれば「閉じる」で閉じる形にした。操作の回数はテストで数え直し、スイッチありで11回、スイッチなしで20回（初期オフのときは12回と19回）。「選び直す」は、9人とも読み込み済みならダイアログを閉じ、未選択が残っていれば次の未選択へ移ることを、テストと実機で確かめた。後者では、行の下に「（前の選手名）に読み込みました」と出るため分かりにくい（利用者に報告し、案を出した。未対応）。スクリーンリーダーでの実際の読み上げ（二重にならないか）は未確認（DOM の構成で確認：表示は aria-live の領域の外にある）。スクロール位置の調整は jsdom では幅や位置を計算しないためテストにできず、Edge の実測で確かめた（幅 320・400・800・1200px、スクロールした状態と一番上の状態で、押した行の位置の変化は 0〜1px）。幅 320・400・800px で表示の切れ・横スクロールなし。test 310件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）

## 2026-10-24 21:40 段階9Eの追加修正3：「選び直す」などで開いたときは1人で閉じる／入れ替えの文言
- 依頼内容: 「続けて次の打者を選ぶ」が働くのは未選択のカードから開いたときだけにし、「選び直す」や手入力・編集中のカードから開いたときは1人読み込んだら閉じる。入れ替えのときの文言（読み込み先の行・行の下の表示・知らせ）を変える
- 変更ファイル: frontend/src/components/PresetDialog.tsx, frontend/src/components/BatterCards.tsx, frontend/src/preset.test.tsx, README.md（使い方の流れの1文）, docs/DESIGN.md（0章「続けて次の打者を選ぶ」）, docs/EDIT_LOG.md
- 変更理由: 1人だけ直すつもりで「選び直す」を押したのに、次の未選択の打者へ進み、行の下に「（前の選手名）に読み込みました」と出て分かりにくかったため。ダイアログに continuable（読み込み先が未選択のカードか）と targetReplacing（読み込み先が選手データのカードか）を渡す。どちらも読み込み先のカードの状態（mode）から決める（続けて移る先はいつも未選択なので、流れの途中で変わらない）。continuable が false のときはスイッチを出さず「1人を読み込むと、この画面を閉じます。」と出し、スイッチの値は保つ（無効のスイッチより、押せない部品が無いほうが分かりやすいと判断した）。入れ替えのときは、読み込み先の行に「（入れ替え）」を付け、行の下は「（前の選手名） と入れ替えました」、ダイアログの中の知らせは「（前の選手名） を （新しい選手名） に入れ替えました。」。手入力のカードのときは「（表示名）に読み込みました」「（表示名）に （新しい選手名） を読み込みました。」。選手名の前後の空白は、これまでの知らせ（「打者Aに Test Alpha を読み込みました。」）に合わせた
- コミット: 525c5c6、282b147、4b329d0（目的別に3つに分けてコミット。525c5c6 はフロントのコード・テスト、282b147 は README、4b329d0 は DESIGN と EDIT_LOG）
- 戻し方: git revert 4b329d0 282b147 525c5c6
- 注意点: 入れ替え・手入力のカードへの読み込みは1人で閉じるため、行の下の表示とダイアログの中の知らせは、実際には画面に出ず、読み上げられない（Edge の実測で、押した直後の最初の描画でダイアログはもう閉じていた。知らせの文は閉じたダイアログの中に書かれる）。閉じたあとにダイアログの外で読まれるのは、これまでのカードの知らせ「選手データ「（名前）」を読み込みました。」（利用者に報告し、カードの知らせを入れ替えの文にする案を出した。未対応）。行の下の文言は、ダイアログの部品だけを描画するテストで確かめた。既存のテストは削らず、新しい規則に合わせて2件を直した（入力済みの手入力のカードから開いて上書きすると1人で閉じる。未選択が残っていても「選び直す」からは1人で閉じる）。読み込み先の行の文言のテスト1件も「（入れ替え）」付きに直した。操作の回数のテスト（11回・20回）は変わらない。幅 320・400・800px で、新しい文言の切れ・横スクロールなし（行の下の表示は、長い文を同じ形で足して測った）。test 314件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）

## 2026-10-26 13:10 段階9Eの追加修正4：入れ替えと手入力のカードのとき、カードの知らせを変える
- 依頼内容: 読み込んだあとダイアログが閉じる場合（入れ替え、手入力・編集中のカードへの読み込み）は、閉じたあとに読まれるカードの知らせを「（前の選手名）を（新しい選手名）に入れ替えました。」「（表示名）に（新しい選手名）を読み込みました。」にする。ダイアログの中の入れ替え用の表示と知らせは、残すか削るか判断する
- 変更ファイル: frontend/src/components/BatterCards.tsx, frontend/src/components/PresetDialog.tsx, frontend/src/preset.test.tsx, docs/DESIGN.md（0章「続けて次の打者を選ぶ」の入れ替えの文言）, docs/EDIT_LOG.md
- 変更理由: 段階9Eの追加修正3で入れ替え用の文をダイアログの中の知らせと行の下に出したが、1人で閉じるため画面に出ず読み上げられなかった（Edge の実測で、押した直後の最初の描画でダイアログはもう閉じていた）。カードの知らせ（ダイアログの外の role="status"）は閉じたあとに読まれるので、そこに出す。runLoadPreset にカードの知らせの文を渡せるようにし、読み込み先のカードの状態（mode）で文を選ぶ（preset は入れ替え、manual は表示名、unselected は今までの「選手データ「（名前）」を読み込みました。」）。ダイアログの中の入れ替え用の知らせと、行の下の「（前の選手名） と入れ替えました」は削った（どちらも閉じる場合にしか使わず、画面に出ないまま残る文になるため。同じ内容はカードの知らせで伝わる）。読み込み先の行の「（入れ替え）」は、読み込む前に見えるので残した。選手名の前後の空白と句読点は、これまでの知らせに合わせた
- コミット: 525c5c6、4b329d0（目的別に分けてコミット。525c5c6 はフロントのコード・テスト、4b329d0 は DESIGN と EDIT_LOG。README の変更は無い）
- 戻し方: git revert 4b329d0 525c5c6
- 注意点: 再開時、node・uvicorn・ブラウザは止まっていた。frontend/node_modules と frontend/dist は残っていた（前回の後片付けの前のため）。npm ci のあと、既存のテストが前回と同じ（フロント314件、バックエンド1344件）であることを確かめてから作業した。テストは件数を変えずに期待値を直した（選び直す・手入力のカードのテストは、ダイアログの中の知らせではなくカードの知らせを確かめ、ダイアログの中の知らせが空であることも確かめる。オフのときのテストに、未選択の打者のカードの知らせが今までの文であることを足した。ダイアログの部品のテストの入れ替えの1件は、行の下の文言の代わりに「（入れ替え）」とスイッチを出さないこと、入れ替えの文を出さないことを確かめる形にした）。Edge（ヘッドレス）で、幅 320・400・800px のいずれでも、入れ替えのあとダイアログが閉じ、フォーカスが「編集する」へ移り、カードの知らせ（role="status"）に「Abraham Toro を Alex Bregman に入れ替えました。」が出ることを確かめた。README は、画面の説明に影響がないため変えていない。test 314件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）

## 2026-10-26 13:32 フロントエンドの CI（frontend-ci.yml）を追加し、段階9Eの記録にハッシュを記入する
- 依頼内容: 段階9Eの記録（5件）のコミット・戻し方にハッシュを記入し、フロントエンドの CI（push・pull_request で npm ci → typecheck → lint → test → build → contrast）を追加する
- 変更ファイル: .github/workflows/frontend-ci.yml（新規）, docs/DESIGN.md（5章の末尾に「CI（自動チェック）」）, docs/EDIT_LOG.md（段階9Eの5件の記録のコミット・戻し方の行にハッシュを記入し、この記録を追記）
- 変更理由: フロントエンドのテストなどを GitHub 上でも自動で動かすため。Action は既存のワークフローに合わせて actions/checkout@v7（persist-credentials: false）を使い、既存に無い actions/setup-node は、GitHub のリリース（v7.1.0 が Latest）と v7 の action.yml で、版と入力（node-version-file・cache・cache-dependency-path）を確かめて v7 にした。Node の版は frontend/.nvmrc（24.19.0）から読む（手元と CI の版を1か所で合わせるため。package.json に engines は無い）。npm のキャッシュは frontend/package-lock.json をキーにする。権限は contents: read、concurrency で同じブランチの古い実行を取り消し、timeout-minutes は 15。npm run test は vitest run なので、そのまま1回だけ実行される。ハッシュは、各記録の変更ファイルに合わせて、コード・テスト（525c5c6）、README（282b147）、文書（4b329d0）を入れた（README を変えていない2件は 525c5c6 と 4b329d0）
- コミット: dc35eaf、b8d50a6（目的別に分けてコミット。dc35eaf は .github/workflows/frontend-ci.yml、b8d50a6 は DESIGN と EDIT_LOG）
- 戻し方: git revert b8d50a6 dc35eaf
- 注意点: GitHub Actions での実行は未確認（push のあとに利用者が確認する）。手元では、frontend の node_modules と dist を消してから、ワークフローと同じ順で npm ci → typecheck → lint → test（314件）→ build → contrast がすべて終了コード 0 で通った（Windows 11・Node 24.19.0・npm 11.17.0）。ワークフローの YAML は、frontend/node_modules にある js-yaml 4.3.2（推移的な依存。新しく取得していない）で3つとも読み込めた。Python の yaml（PyYAML）は appvenv に無いため使っていない。run の npm run の5つは、すべて package.json の scripts にある。Linux との違いの確認：相対パスの import など 123件が実際のファイル名と大文字小文字まで一致（一時スクリプトで確認。リポジトリには残していない）、改行コードは .gitattributes で LF、スナップショットのテストは無い、日時・タイムゾーン・ロケールに依存するテストは無い、パスの区切りに依存するスクリプトは無い。フロントエンドのテストは schemas/ と data/presets/mlb/2025/ の一部のファイルも読み込むが、paths は指示どおり frontend/** とこのファイルだけにした（それらだけを変えたときは frontend-ci は動かない。利用者に報告済み）。README のバッジは、最初の実行が緑になってから利用者の指示で足す

## 2026-10-26 13:38 フロントエンドの CI の追加修正：paths に schemas/** と data/presets/** を足す
- 依頼内容: frontend-ci.yml の paths（push と pull_request）に schemas/** と data/presets/** を足す。あわせて npm の脆弱性の警告を調べる（調べるだけ）
- 変更ファイル: .github/workflows/frontend-ci.yml, docs/DESIGN.md（5章「CI（自動チェック）」の表の frontend-ci の動く条件と、paths の説明の1項目）, docs/EDIT_LOG.md
- 変更理由: フロントエンドのテストは schemas/ の検証の例と data/presets/mlb/2025/ の2件を読み込むので、それらだけを変えたときも frontend-ci を動かすため。ほかの設定は変えていない
- コミット: dc35eaf、b8d50a6（目的別に分けてコミット。dc35eaf は .github/workflows/frontend-ci.yml（paths を足したあとの内容を、CI の追加と1つのコミットにした）、b8d50a6 は DESIGN と EDIT_LOG）
- 戻し方: git revert b8d50a6 dc35eaf
- 注意点: 変更後の frontend-ci.yml と既存の2つのワークフローは、frontend/node_modules の js-yaml 4.3.2 で読み込めた。GitHub Actions での実行は未確認。npm audit --package-lock-only の結果（high 2件：undici 8.11.2（jsdom 30.1.2 から）、zod 4.6.5（eslint-plugin-react-hooks 7.1.1 から）。どちらも開発・テスト用の依存で、build した dist には含まれない）は利用者に報告しただけで、package.json と package-lock.json は変更していない（npm audit fix・npm update・npm install は実行していない）

## 2026-10-26 13:54 開発用の依存（undici、zod）を lock ファイルの範囲内で更新する
- 依頼内容: npm audit の警告（high 2件）に対応するため、frontend で npm update undici zod を実行し、undici と zod だけを package-lock.json の範囲内で更新する
- 変更ファイル: frontend/package-lock.json, docs/EDIT_LOG.md
- 変更理由: npm audit --package-lock-only で high が2件出ていたため。undici 8.11.2（jsdom 30.1.2 の依存。jsdom の指定は ^8.11.2）は GHSA-4qv8-2p9j-2685・GHSA-f72v-6w45-q472・GHSA-xjj6-f33q-929c、zod 4.6.5（eslint-plugin-react-hooks 7.1.1 の依存。指定は ^3.25.0 || ^4.0.0）は GHSA-mrhx-c7xc-m3w5 の対象だった。どちらも devDependencies から入る推移的な依存で、build した dist には含まれない。修正版はどちらも親の指定の範囲内にあるため、package.json は変えずに lock だけを更新した
- コミット: 5bad7f7、e369884（目的別に分けてコミット。5bad7f7 は frontend/package-lock.json、e369884 は EDIT_LOG）
- 戻し方: git revert e369884 5bad7f7
- 注意点: package-lock.json で変わったのは、node_modules/undici 8.11.2 → 8.12.3 と node_modules/zod 4.6.5 → 4.6.7 の2件だけ（どちらも version・resolved・integrity のみ。追加・削除されたパッケージは無く、lockfileVersion なども変わらない。改行は LF、末尾の改行ありのまま）。package.json は、更新前にスクラッチパッドへ保存したコピーと完全に一致（変わっていない）。npm audit --package-lock-only は、更新前 high 2件、更新後 0件。更新の前と後のそれぞれで、node_modules と dist を消してから、ワークフローと同じ順で npm ci → typecheck → lint → test → build → contrast を実行し、どちらもすべて終了コード 0、test は 314件が通った（Windows 11・Node 24.19.0・npm 11.17.0）。npm ci は lock を書き換えなかった（ハッシュが update 直後と同じ）。docs/DESIGN.md には依存全般の記述が無いため変えていない。npm audit fix・npm install・パッケージ名なしの npm update は実行していない。以前の npm audit が0件だったのは利用者の記憶によるもので、いつ警告が増えたかは分からない

## 2026-10-27 08:40 CI でのテストの時間切れの対策（上限を上げ、CI では並列数を2にする）
- 依頼内容: GitHub Actions の frontend-ci で2件（result.test.tsx「入力打順と推奨打順を、入力打順を先にして並べる」、tabs.test.tsx「入力・打順・計算結果・試合数の選択・開いた欄は、タブを行き来しても消えない」）が「Test timed out in 5000ms」で失敗したため、テストの内容を変えずに時間切れを防ぐ
- 変更ファイル: frontend/vite.config.ts, frontend/src/result.test.tsx, frontend/src/texts.test.tsx, docs/DESIGN.md（5章「CI（自動チェック）」に時間切れの対策の1項目）, docs/EDIT_LOG.md
- 変更理由: 失敗した2件は、9人分の成績を入れて計算するテストで、手元の既定の並列実行でも 4.16秒・4.03秒（上位1位・2位）と、上限 5000ms に近かった。vite.config.ts の test に testTimeout: 30000・hookTimeout: 30000 を足し、環境変数 CI があるときだけ maxWorkers: 2 にした（vitest 5.0.3 の設定の型で、この3つの名前を確かめた。GitHub Actions は CI を自動で設定するので、ワークフローは変えていない）。30000ms は、手元の1ワーカー実行の最大 2.52秒の約12倍、既定の並列実行の最大 4.16秒の約7倍。共通の補助のうち userEvent.setup() を呼ぶ calculate（result.test.tsx と texts.test.tsx）で delay: null を指定した（操作の間の待ち時間をなくすだけで、操作の内容と順番は同じ）。user.type は preset.test.tsx の検索の4か所（4〜5文字）だけで、検索の入力を確かめるテストなので置き換えていない。テストの期待値・検査の範囲は変えていない
- コミット: c972933、517755d（目的別に分けてコミット。c972933 はテストの設定と補助（vite.config.ts、result.test.tsx、texts.test.tsx）、517755d は DESIGN と EDIT_LOG）
- 戻し方: git revert 517755d c972933
- 注意点: 原因は CI の実行環境の遅さ（CPU の取り合い）と推測しているが、未確認（CI の CPU の性能も未確認）。CI での効果は push 後に利用者が確認する。手元（Windows 11・Node 24.19.0）の測定：変更前は、既定の並列実行で全体 58.8秒・1件の最大 4.16秒、1ワーカー実行（--maxWorkers=1）で全体 155.2秒・最大 2.52秒。変更後は、既定の並列実行で全体 49.1秒・最大 3.20秒、1ワーカー実行で全体 143.0秒・最大 2.42秒、CI=true（2ワーカー）で全体 73.4秒・最大 2.41秒（2ワーカーになったことは、全体の時間が既定と1ワーカーの間になったことからの判断）。変更しなかった tabs.test.tsx の対象のテストも 4.16秒 → 3.04秒になっており、前後の差には実行ごとのばらつきが含まれる（delay: null だけの効果は切り分けていない）。どの実行でも 314件がすべて通った

## 2026-10-27 09:10 EDIT_LOG の4件の記録にコミットのハッシュを記入する
- 依頼内容: 「（Mac側でコミット後に記入）」が残っている記録に、利用者から受け取ったコミットのハッシュを記入する。あわせて README に CI のバッジを足す
- 変更ファイル: docs/EDIT_LOG.md（2026-10-26 13:32・13:38・13:54、2026-10-27 08:40 の4件の記録のコミット・戻し方の行にハッシュを記入し、この記録を追記）
- 変更理由: 各記録の変更ファイルに合わせてハッシュを入れた。frontend-ci.yml の追加（13:32）と paths の追加（13:38）は、ワークフローが dc35eaf、DESIGN と EDIT_LOG が b8d50a6。依存の更新（13:54）は、package-lock.json が 5bad7f7、EDIT_LOG が e369884。時間切れの対策（08:40）は、テストの設定と補助が c972933、DESIGN と EDIT_LOG が 517755d。戻し方は、これまでの記録に合わせて新しいコミットから並べた
- コミット: 83adf3f（段階9C の記録と同じコミットに含めた。この記録の変更は EDIT_LOG.md のみ）
- 戻し方: git revert 83adf3f（段階9C の DESIGN と EDIT_LOG の変更も戻る）
- 注意点: README のバッジは足していない。README に GitHub のリポジトリの URL（所有者名とリポジトリ名）が書かれておらず、推測で書かない指示のため、作業を止めて利用者に報告した。README は変更していない。ハッシュはコミットの内容と照らし合わせていない（git を実行しないため。利用者から受け取った対応のとおりに記入した）

## 2026-10-27 11:39 見た目のトークンを整理し、2つの案（案A：紺の帯／案B：スレートと落ち着いた青緑）を作る（段階9C）
- 依頼内容: 画面の見た目を整えるため、デザインのトークン（CSS 変数）を整理し、見比べ用の2案を作る。案は html の data-design 属性（URL の ?design=a / ?design=b、初期値 a）で切り替え、開発サーバーだけ右下に切り替えボタンを出す
- 変更ファイル: frontend/src/index.css, frontend/src/design.ts（新規）, frontend/src/components/DesignSwitcher.tsx（新規）, frontend/src/components/NumberWithUnit.tsx（新規）, frontend/src/main.tsx, frontend/src/components/ResultSummary.tsx, frontend/src/components/OrderList.tsx, frontend/scripts/contrast.mjs, frontend/src/design.test.tsx（新規）, frontend/src/App.test.tsx, docs/DESIGN.md（0章に「見た目（デザインのトークンと2つの案）」）, docs/EDIT_LOG.md
- 変更理由: 画面がシンプルすぎたため。index.css の直接書かれた色・角の丸み・文字の大きさ・影をトークンに置き換え、色は「案 × ライト／ダーク」の4つのパレット（同じ名前の変数）にした。部品の規則はトークンだけを参照し、案の違いはトークンの値だけで表す。案Aの全幅の帯は、ヘッダーを main の中に置いたまま box-shadow と clip-path で左右に伸ばした（100vw は使わない）。数値は太字の等幅数字にし、単位が元の文にあるところ（%・点・試合）だけ span（.unit）で包んで小さく添えた（文字列は変えない）。結果の主要な数値（1試合あたりの期待得点、非効率%）は幅 800px 未満 1.75rem、以上 2rem。切り替えボタンは main.tsx で import.meta.env.DEV のときだけ App の外に描画し、本番のビルドからは取り除かれる。contrast.mjs は4つのパレットを印（@palette）で読み、32の組み合わせを確かめる形にした
- コミット: a51bfa8、83adf3f（目的別に分けてコミット。a51bfa8 はフロントのコード・テスト、83adf3f は DESIGN と EDIT_LOG。README の変更は無い）
- 戻し方: git revert 83adf3f a51bfa8
- 注意点: 既存のテストは削っていない。App.test.tsx の1件（getByText('2.62%')）は、「%」を span で包んだため要素の中の文字だけで探す照合が成り立たなくなり、textContent が「2.62%」と完全に一致する要素がちょうど1つあることを確かめる形に直した（利用者の承認済み）。CSS の規則を確かめる既存のテスト（検索欄の幅、結果の札・列の幅の切り替え）は、規則の書き方と順番を残して、そのまま通る。副のボタンの文字を強調の色から本文の色に変えた（主と副は面の有無で分かる）。成績の入力欄の項目名は 0.875rem にすると幅 400px でもはみ出したため 0.8rem にした（幅 320・360px のはみ出しは以前の 0.85rem からあり、直していない。利用者に報告）。dist の CSS には .design-switcher の規則が残る（JS には切り替えボタンの文字も部品も無い）。Edge 156（ヘッドレス）で、幅 320〜1200px の7つ × 2案 × ライト・ダークの28通りで、横スクロール 0、結果の左右の行の高さの差 0 を実測した。test 324件（既存314件＋新規10件）・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）。実際のスマホ（実機）での見え方は未確認

## 2026-10-27 12:42 見た目を案A（紺の帯）に確定し、タイトル・見出しを変え、項目名のはみ出しと OPS のはみ出しを直す（段階9C の仕上げ）
- 依頼内容: 見た目の案A（紺の帯）に確定して案Bと切り替えの仕組みを削除し、タイトルを「打順シミュレーター」にしてページ上部の説明の文を削除し、タブと見出しの数字の丸を外して見出しに縦線を付け、成績の入力欄の項目名のはみ出し（幅 320・360px）と、結果の OPS が1以上のときのはみ出し（幅 320px）を直す
- 変更ファイル: frontend/src/index.css, frontend/src/main.tsx, frontend/src/design.ts（削除）, frontend/src/components/DesignSwitcher.tsx（削除）, frontend/src/design.test.tsx（削除）, frontend/src/main.test.tsx（新規）, frontend/scripts/contrast.mjs, frontend/src/App.tsx, frontend/src/components/StepTabs.tsx, frontend/index.html, frontend/src/App.test.tsx, frontend/src/order.test.tsx, frontend/src/preset.test.tsx, frontend/src/tabs.test.tsx, frontend/src/texts.test.tsx, frontend/src/result.test.tsx, README.md（先頭の見出し）, docs/DESIGN.md（0章のタブの記述と「見た目」の節）, docs/EDIT_LOG.md
- 変更理由: 2つの案を見比べて、利用者が案Aを採用したため。案Aの値を属性なしの :root とダークの @media に統合し、[data-design] の規則・案Bの値・切り替えの部品と CSS を削除した。案Aでしか使わない色の変数のうち、ほかと同じ値だったもの（選んだ選択肢・選んだタブの下線は primary、選んだタブの文字は text、フォーカスの枠は accent）は1つにまとめた。数字の丸を外したことで使われなくなった --color-on-accent と、説明の文を削除したことで使われなくなった --color-on-band-muted も削除した。見出しの縦線は疑似要素（読み上げに含まれない）。項目名は最大2行で折り返し、同じまとまりの項目名の高さを subgrid でそろえた。結果の指標は、狭い列（列の幅 200px 未満）だけ 0.75rem にした
- コミット: a51bfa8、4287997、83adf3f（目的別に3つに分けてコミット。a51bfa8 はフロントのコード・テスト、4287997 は README、83adf3f は DESIGN と EDIT_LOG）
- 戻し方: git revert 83adf3f 4287997 a51bfa8
- 注意点: 案の取り違えがあった。利用者は最初に「案Bに確定する」と指示し、作業の途中でそれを取り消して「案Aに確定する」と指示した。取り消しの前に、index.css の案Aの規則と値、design.ts・DesignSwitcher.tsx・design.test.tsx（削除）、main.tsx の切り替え、contrast.mjs の案Aのパレットを、案Bに確定する形に変えていた。index.css は、書き換えの直前にスクラッチパッドへ保存したコピー（45,345バイト）で上書きして復元し、そこから案Aに統合した。切り替えの3ファイルと main.tsx は、案Aに確定しても不要なため、戻していない（main.tsx は段階9C より前の形）。案Aの見た目が統合の前後で変わらないことは、Edge 156（ヘッドレス）で、統合前は html に data-design="a" を一時的に設定して、ライト・ダーク × 5つの画面 × 7つの幅（70画面）の主要な要素の色・大きさ・位置を記録し、統合後と比べて確かめた（24,276の値のうち差は 0）。contrast の比は、段階9C の案Aの32組の値と、ライト・ダークの64件すべてで一致した（その後、使われなくなった2組を外し、見出しの縦線の1組を足して31組）。「打順の得点期待値」は、画面・index.html・テストから無くなった（README の「入力打順の得点期待値」と DESIGN の「入力した打順の得点期待値」などは、タイトルではなく文の一部なので残した）。test 316件（段階9C の324件から design.test.tsx の10件を削除し、main.test.tsx の2件を追加）・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）。実際のスマホ（実機）での見え方は未確認

## 2026-10-27 14:58 タイトルの左にダイヤモンドの印を置き、タイトルを大きく太くする／項目名の折り返しを確かめる（段階9C の追加修正）
- 依頼内容: 幅 320px の項目名の折り返しが必要以上でないかを実測して、必要なら直す。タイトルが質素すぎるので、紺の帯のまま、左に野球のダイヤモンドの印を置き、タイトルを大きく太くし、幅 800px 以上で帯の余白を広げる。フォントの候補を調べる（調べるだけ）
- 変更ファイル: frontend/src/components/DiamondMark.tsx（新規）, frontend/src/App.tsx, frontend/src/index.css, frontend/scripts/contrast.mjs, frontend/src/texts.test.tsx, docs/DESIGN.md（0章の「見た目」の節のヘッダー・文字・項目名・コントラスト・実測、ページ上部の文の注記）, docs/EDIT_LOG.md
- 変更理由: 印はインライン SVG（回した正方形の細い線と、4つの塁の点）で、色は帯の文字の色、読み上げなし（aria-hidden）。タイトルは太さ 800・字間 0.03em・文字の大きさ clamp(1.5rem, 1rem + 2.5vw, 2.25rem)、印は文字の 1.35 倍、間隔は文字の 0.6 倍。帯の上下の余白は幅 800px 以上だけ 24px から 32px にした。項目名は、折り返している項目名がどれも1行の自然な幅が使える幅（列の幅）を超えていて、折り返す項目名の無いまとまりは既に1行の高さだったため、変更しなかった
- コミット: a51bfa8、83adf3f（目的別に分けてコミット。a51bfa8 はフロントのコード・テスト、83adf3f は DESIGN と EDIT_LOG。README の変更は無い）
- 戻し方: git revert 83adf3f a51bfa8
- 注意点: Windows（Edge 156）では、タイトルは Yu Gothic UI の Bold で表示され、800 の太さが無いため見た目は 700 と同じ。幅 320px の「死球 HBP」は、自然な幅 51.7px に対して使える幅 51px で、0.7px 足りずに折り返している。「併殺打 GIDP」が収まって見えるのは、右隣の4列目が空いているため。contrast は印と帯の1組を足して32組（ライト 13.32:1、ダーク 16.82:1）。フォントの調査では、何も変更していない（候補のパッケージは、スクラッチパッドの空のフォルダで npm pack して調べ、package.json には入れていない）。調査の中で、Windows では結果の数字（太字）が Yu Gothic UI の Bold で表示され、tabular-nums を指定しても「1」の幅だけ狭い（20px で 8.05px、ほかの数字は 10.73〜11.53px）ことを実測した。これは以前からのことで、直していない（利用者に報告）。test 317件（既存316件＋新規1件）・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1344件が通った（backend は変更なし）。Edge 156（ヘッドレス）で、幅 320〜1200px の7つ × ライト・ダークの14通りで、横スクロール 0、文字の切れ 0、結果の左右の行の高さの差 0 を実測した。実際のスマホ（実機）での見え方は未確認