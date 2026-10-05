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
- コミット: （Mac側でコミット後に記入）
- 戻し方: git revert <ハッシュ>
- 注意点: APIの返す得点期待値が変わる（例: Judge/Arraez交互の9人で 7.428→7.345）。steal_probs/steals 省略時は従来と同一の値。DEFAULT_ADVANCE_PROBS は変更していない。案Bの盗塁なしの乱数列は従来と同一に保った
