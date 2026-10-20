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
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: バックエンドは変更していない（必要な値はすべて POST /lineup/evaluate と POST /batters/metrics の応答にあった）。モンテカルロ法（案B）の参考値（monte_carlo：mean・std・min・max・n_trials）は、表示の内容が計画からは決められないため、表示していない（案を報告済み）。テストは193件（左右の順番、期待得点が一覧の上にあること、非効率% が一覧より上にあること、143/162 の切替で API の値に変わること（テストの合計はわざと「1試合あたり×試合数」と違う値にしている）、キーボードでの切替、動いた打者・動かなかった打者の表示、各行の指標）。既存のテストのうち、結果の打順を「→」でつないだ文字列で探していた2か所を、新しい表示に合わせて直した。実際のバックエンドで計算し、Edge 155（ヘッドレス）で、幅 1200px で左右に並ぶこと、幅 400px（ダーク表示）で縦に積まれて入力した打順が先になること、キーボードの矢印で 162試合に切り替わること、横スクロールが出ないことを確かめた

## 2026-10-20 19:13 計算 API の応答に、推奨打順に対する入力打順の損失点を追加
- 依頼内容: POST /lineup/evaluate の応答に、1試合あたりと試合数（143・162）ごとの損失点を追加する（段階8の修正）
- 変更ファイル: backend/app/schemas/batter.py, backend/app/main.py, backend/tests/test_validation.py
- 変更理由: 画面に損失点を出すため。画面の数値は API の値だけを使う方針のため、差（推奨打順の期待得点 − 入力打順の期待得点）をサーバーで計算して返す。項目名は既存の命名に合わせ、1試合あたりを runs_lost_per_game、試合数ごとを totals_by_games[].runs_lost とした。試合数ごとの値は、同じ要素の best_order_runs − input_order_runs（表示する合計どうしの差と一致させるため）。既存の項目は変えていない（追加のみ）
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: 探索は入力打順から始め、期待得点が高い打順だけを採るため、損失点は 0 以上になる。テストを2件追加（値が差と一致すること、9人とも同じ成績で推奨打順が入力打順と同じなら 0 になること）。pytest 1273件・ruff（. と ../scripts）・mypy が通った。baseline.py で、案A 16通りの差の最大 1.776e-15、案B（seed 固定）3件が完全一致、プリセットの確率の差 0 を確かめた（遷移・確率の計算は変えていない）。DESIGN・README の説明と EDIT_LOG への記録は、フロントの結果画面のコミットに含める

## 2026-10-20 19:13 結果の画面の修正（損失点、非効率の欄の余白、狭い画面でも左右表示、「入力打順」の表記、シミュレーションの欄）
- 依頼内容: 段階8の結果画面への指摘6点（損失点の表示、非効率の欄の余白、狭い画面でも左右に並べる、「入力した打順」を「入力打順」に、たためるシミュレーションの欄（案A）、テストと文書）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/api/types.ts, frontend/src/App.tsx, frontend/src/index.css, frontend/src/result.test.tsx, frontend/src/App.test.tsx, frontend/src/order.test.tsx, README.md, docs/DESIGN.md（4章）, docs/EDIT_LOG.md
- 変更理由: 損失点は API の runs_lost_per_game と、選んだ試合数の totals_by_games[].runs_lost をそのまま出す（フロントで引き算をしない。0 のときは「期待得点は同じです」と出す）。非効率の欄は、説明の注記に「.result .note」の上の余白（16px）がかかって数字との間が広がっていたため、上の余白は結果の欄の直下の注記（.result > .note）だけに付け、欄の中は margin を 0 にして grid の gap（4px）で段の間隔をそろえた（試合数の欄の注記も同じ原因で広がっていたので、同時に直った）。2つの打順は幅にかかわらず2列にし、各行の1行目を番号と表示名、印と指標を2行目以降に折り返す。幅 800px 未満では、期待得点を縦に並べ、列の内側の余白を小さくした（800px 以上では、印を表示名と同じ行に置く）。シミュレーションの欄は、入力打順の一覧の下に、初期は閉じたボタン（aria-expanded・aria-controls）で置き、monte_carlo の mean・std・n_trials だけを出す
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: この修正は、まだコミットしていない段階8の1つ目の変更（2026-10-20 18:25 の記録）と同じファイルを変えているため、1つのコミットにまとめる（18:25 の記録とこの記録のコミット欄には同じハッシュを入れる）。「入力打順」に変えたのは、画面の文言・読み上げ・テスト・README（冒頭・使い方・フロントの状況）・DESIGN 4章の「結果の画面」。変えていないのは、API の項目名、DESIGN の要件の説明（冒頭の「ユーザーが入力した打順」など）・非効率% の計算式・探索の説明、backend のコメント、過去の EDIT_LOG。DESIGN 4章で、前回の記録で「結果の画面」を挟んだため別の項目の下に付いていた2つの補足（確率は MLB のまま、n_games の互換）を、元の項目の下に戻した。損失点の1試合あたりは、指示の「○.○○」（小数2桁）ではなく、一覧の上の期待得点と同じ小数3桁にした（2桁にすると、期待得点の差と見た目が合わないことがあるため）。test 200件・typecheck・lint・build・contrast が通った。実際のバックエンドと Edge 155（ヘッドレス）で、幅 320・360・400・800・1200px（ライト・ダーク）で、2列が左右に並ぶこと、横スクロールが出ないこと、列からはみ出す要素がないこと、文字の大きさが幅で変わらないこと、非効率の欄の段の間隔がすべて 4px であることを確かめた。幅 320px では、長い英字の表示名が単語の途中で折り返される
## 2026-10-20 19:37 結果の画面で、入力打順と推奨打順の同じ番号の行の高さをそろえる
- 依頼内容: 狭い画面や長い名前で、2つの打順の行の高さがずれる（推奨打順の印の分だけ下がる）問題を直す（段階8の追加修正）
- 変更ファイル: frontend/src/index.css, frontend/src/result.test.tsx, docs/DESIGN.md（4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 2つの列が別々に縦に並んでいたため、片側の行だけが高くなると、それ以降の行がずれていた。外側を12行（見出し・期待得点・9人・シミュレーションの欄）のグリッドにし、各列と各一覧を subgrid にして行を共有した。行が反対側に合わせて高くなっても、中身は上に詰める（align-content: flex-start）。HTML・aria・順番は変えていない（CSS だけの変更）
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: 指定は @supports (grid-template-rows: subgrid) の中に置いたので、subgrid が使えないブラウザでは従来の表示（各列が独立して縦に並び、行の高さはそろわない）になる。打者は API が必ず9人で返す前提で、行の数（12・9）を CSS に書いている。Edge 155（ヘッドレス）で、長い名前（空白ありの40文字2人、空白なしの40文字1人）を入れ、幅 320・360・400・800・1200px で、シミュレーションの欄を閉じたときと開いたときの両方で、9行すべての上端・高さの差が 0、見出しと期待得点の上端の差も 0、横スクロールなし、列からはみ出す要素なし、名前の文字 16px を確かめた。subgrid の指定を打ち消して代わりの表示を再現すると、幅 1200px ではそろい、800px 以下ではずれる（最大 93〜309px）ことを確かめた。test 202件（構造と順番、キーボードの移動順の2件を追加）・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1273件が通った（backend は変更なし）
## 2026-10-20 20:19 結果の行を固定の構造にし、動いた打者の印と、狭い画面の表示名の短縮を変える
- 依頼内容: subgrid で高さを合わせたことで片側にできた大きな空白をなくすため、行の構造を固定し、動いた打者の印（狭い画面は「元9番」、動かない打者は読み上げだけ「変更なし」）と、狭い画面の表示名の短縮（A. Judge）を入れる（段階8の追加修正）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/format.ts, frontend/src/index.css, frontend/src/format.test.ts, frontend/src/result.test.tsx, frontend/src/App.test.tsx, docs/DESIGN.md（4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 行ごとに名前や印の折り返しで高さが変わっていたため。各行を「1行目（番号・狭い画面の印・表示名・広い画面の印。折り返さず、名前は…で省略）」と「指標の固定の格子（800px 未満は2列×3段、800px 以上は3列×2段、1100px 以上は6列×1段）」にし、どの打者でも同じ高さにした。行の上下の余白は 4px から 3px に、狭い画面の列の内側の余白と列の間隔は 8px から 6px に詰めた。subgrid による整列は残した。印は、狭い画面用「元9番」（枠なしの小さいアクセント色の文字）と広い画面用「9番→1番」を CSS で切り替え、どちらも aria-hidden にし、読み上げは1つの文（「入力打順の9番から1番へ」または「変更なし」）にまとめた。短縮のルールは format.ts の shortDisplayName の1か所に置いた
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: 短縮は、空白で区切られた2語以上で、最初の単語がラテン文字（アクセントつきを含む）で始まり、残りに文字を含む単語がある名前だけ（「Judge (2)」のように残りが重複番号だけの名前と、「J.D. Martinez」のように最初の単語が既にイニシャルの名前は、そのまま）。テストに表示名を読む箇所があったため、結果の名前は title（フルネーム）で読むように直した。Edge 155（ヘッドレス）で、長い英字名（空白ありの40文字2人、空白なしの40文字1人）・短い名前・動いた打者・動かない打者を混ぜて実測し、幅 320・360・400・800・1200px のすべてで、9行の上端と高さの差が 0（シミュレーションの欄を開いても同じ）、横スクロールなし、指標のはみ出しなしを確かめた。1行の高さは 86px（800px 未満）・69px（800px）・52px（1200px）、9行の合計は 778・622・467px。subgrid を打ち消した再現でも行の高さは同じで、狭い画面で見出しの折り返しの分（27px）だけ片側が下がる。幅 320px では、推奨打順で動いた打者の名前は短縮しても「…」になることがある（例：T. Pla…）。結果の欄全体の高さは、幅 320px で 1642px（うち2つの打順の枠 1070px）、360px で 1574px、400px で 1549px（シミュレーションの欄は閉じた状態）。test 221件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1273件が通った（backend は変更なし）
## 2026-10-20 20:43 動いた打者の札、列の幅による名前の短縮と指標の数の切り替え
- 依頼内容: 動いた打者の印を枠と薄い背景の札にし、名前の短縮と指標の数（狭い列は AVG・OPS・HR・SB の4つ）を、画面の幅ではなく列の幅で切り替える（段階8の追加修正2）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/index.css, frontend/scripts/contrast.mjs, frontend/src/result.test.tsx, docs/DESIGN.md（4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 狭い列では名前と6つの指標が窮屈で、広い列では印が目立たなかったため。札は、アクセント色の文字と枠線、薄い背景（新しい変数 --color-badge-bg、ライト #e7f3ec・ダーク #17301f）にし、広い列では行の右端にそろえた。切り替えは container query で、各行（li）を container にした（列の section を container にすると、レイアウトの封じ込めで subgrid が効かなくなるため）。切り替えの幅は Edge 155 で実測した：「9番 Pete Crow-Armstrong 9番→1番」の1行目が 254.5px → 255px 以上でフルネームと「9番→1番」。最も広い指標 53.8px×3＋間隔 8px×2 = 177.4px に OPS が1以上の1桁分を見込み → 200px 以上で6つを3列×2段（未満は OBP・SLG を display: none で外して2列×2段）。指標の合計と間隔で 335.4px → 344px 以上で6列×1段。contrast.mjs に札の組み合わせを3つ追加した（文字と札の地、枠と札の地、枠と列の地）
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: jsdom は container query を計算しないため、テストは DOM の構造・順番・属性と、CSS の規則の中身（index.css を読んで確認）で行い、実際の見え方は Edge で実測した。文字の幅はフォントによって変わる（実測は Windows の Edge）。container query が使えないブラウザでは、狭い列の表示（短い名前・「元9番」・指標4つ）になる。実測（長い英字名・短い名前・動いた打者・動かない打者を混ぜた状態）：幅 320・360・400・480・600・800・1200px のすべてで、入力打順と推奨打順の9行の上端と高さの差が 0、横スクロールなし、指標のはみ出しなし、札のある1行目とない1行目の高さが同じ（26px）。列の内側の幅は 120・140・160・200・260・335・508px、1行の高さは 69px（1200px のみ 52px）、9行の合計は 622px（1200px のみ 467px）、結果の欄全体は 1487・1419・1393・1323・1272・1177・996px。幅 480px（列の幅 200px）までは4つの指標と短い名前、600px からは6つの指標とフルネーム。test 227件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1273件が通った（backend は変更なし）
## 2026-10-20 20:54 狭い列の「元9番」の札を、番号の横から名前の後ろへ移す
- 依頼内容: 狭い列で「元9番」の札を名前の後ろに置き（例：「1番 A. Judge [元9番]」）、札は縮めず名前の側で省略する（段階8の追加修正3）
- 変更ファイル: frontend/src/components/ResultSummary.tsx, frontend/src/index.css（説明のコメントのみ）, frontend/src/result.test.tsx, docs/DESIGN.md（4章「結果の画面」）, docs/EDIT_LOG.md
- 変更理由: 番号・名前・札の順に読める並びにするため。札の要素を名前の後ろへ移しただけで、札は前の段階から flex: none（縮めない）、名前は min-width: 0 と text-overflow: ellipsis（名前の側で省略）になっている。広い列の「9番→1番」（行の右端）は変えていない。札はどちらも aria-hidden のままで、読み上げの文（「入力打順の9番から1番へ」「変更なし」）は1行目の最後にあり、読み上げの順番は変わらない
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: Edge 155（ヘッドレス）で、長い英字名3人・Pete Crow-Armstrong・一般的な長さの名前4人（Aaron Judge・Max Muncy・Fernando Tatis Jr.・Juan Soto）・短い名前1人を混ぜ、移す前と後で、名前が「…」になる数を数えた。幅 320・360・400・480px のすべてで、前後の数は同じだった（番号・名前・札の幅の合計と間隔の数が変わらないため）。一般的な長さの名前で札のある行は、320px で 3/3、360px で 1/3、400・480px で 0/3 が「…」になる（札のない行は 0/5）。札が切れた行はなかった。幅 320・360・400・480・600・800・1200px で、左右の同じ番号の行の上端と高さの差は 0、1行目の高さは札の有無によらず 26px、横スクロールなし。test 227件・typecheck・lint・build・contrast、backend の ruff・mypy・pytest 1273件が通った（backend は変更なし）