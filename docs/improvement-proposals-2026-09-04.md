# adr-governance 改善提案（2026-09-04）

## 0. この文書の位置づけ

- **基準点:** `feature/decision-authority-gate` の先端 `e21beff`（package version `0.1.11` + CHANGELOG `Unreleased` の Decision Authority Gate）
- **追補確認:** `fix/docs-update-mtime` の `b19c114` まで確認済み。基準点との差は mtime の1秒許容とその回帰テストであり、本提案の主要評価を変えない。
- **根拠:** [`docs/specs/adr-governance-design.md`](./specs/adr-governance-design.md) と実装の突き合わせ、および基準点での実測（`pnpm test` = 15 files / 127 tests pass, Node v22.17.0）。追補として `b19c114` でも 15 files / 127 tests pass を確認した（Node v25.9.0での補助確認であり、Node 20 / 22 matrixの代替ではない）。
- **評価軸:** 「エージェントが設計判断を素通りさせない」という製品目的への寄与度
- **性質:** 提案であり決定ではない。採用する項目は通常どおり ADR 化する。

事実確認のうち、判断の前提になるものを先に置く。

| 観測 | 値 |
|------|-----|
| 実装規模 | `src/` 6,820 行 / 44 ファイル、tracked file 115 |
| テスト | 15 file / 127 test すべて green |
| 自リポジトリの `adr.config.json` | `hooks.enabled: false`、`changeGate.mode: "warn"` |
| 自リポジトリの CI | `pnpm lint` と `pnpm test` のみ（`check --base` を実行していない） |
| リリース自動化 | なし（`.github/workflows/` は `ci.yml` のみ） |
| ADR 実績 | accepted 1 件（[`docs/adr/0001-decision-authority-gate.md`](./adr/0001-decision-authority-gate.md)） |

### 0.1 保証範囲と脅威モデル

本製品が機械的に保証するのは、判断の**意味的な正しさ**ではなく、次の監査可能性である。

- 証跡が特定の base と変更内容に対して新鮮である
- ADR の参照先、内容ハッシュ、status lifecycle、変更 proposal の申告が整合している
- no-ADR 判断が理由コードと rationale を伴って明示されている
- hook が検証不能になった場合、その縮退が利用者から見える

自由文 rationale の真偽や、ADR の内容が変更に対して十分かどうかは機械判定しない。意図的に虚偽の rationale や無意味な文書変更を作る主体まで防ぐには、branch protection、CODEOWNERS、人間レビューなど別の信頼境界が必要である。本提案は、善意だが最短経路を選びがちなエージェントや運用上の stale evidence を主な対象とする。

## 1. 結論（優先順位付き）

| ID | 提案 | 種別 | 効果 | 工数 | 優先 | 主な依存 |
|----|------|------|------|------|------|----------|
| 1 | 証跡を exact changeset へ束縛する | 正しさ | 大 | 中 | P0 | なし |
| 2 | after-turn の docs 更新判定を corpus hash へ | 正しさ | 大 | 小 | P0 | なし |
| 3 | untracked file 由来の無言デグレを可視化する | 正しさ | 大 | 小 | P0 | なし |
| 4 | 生成 CI と自リポジトリ CI を正し、warn dogfooding する | 信頼性 | 大 | 中 | P0 | 1 |
| 5 | hook shim にウォッチドッグを入れる | 堅牢性 | 中 | 小 | P0 | なし |
| 6 | privacy の中心主張と Node 20 下限を検証する | 品質 | 大 | 中 | P0 | なし |
| 7 | `npx` 一発導入 | 採用 | 大 | 中 | P1 | 4, 6, 21 |
| 8 | `init` を最小 plan と候補レビューへ分離する | 採用 | 大 | 中 | P1 | なし |
| 9 | risk 語彙と watch path を設定可能にする | 精度 | 大 | 中 | P1 | なし |
| 10 | bot PR・非設計変更の安全な例外導線 | 運用 | 中 | 中 | P1 | 1, 4 |
| 11 | `check` の GitHub annotation / SARIF 出力 | 運用 | 中 | 中 | P1 | 4 |
| 12 | no-ADR 可視化と telemetry 契約 | 価値証明 | 中 | 中 | P1 | 1 |
| 13 | Cursor のターン指示を実測スパイクする | 精度 | 中 | 中 | P2 | 5 |
| 14 | 関連 ADR の抽出精度を上げる | 精度 | 中 | 中 | P2 | 9 |
| 15 | `doctor` コマンド | 運用 | 中 | 中 | P2 | 3, 5 |
| 16 | 死に設定 `requireNoAdrRationale` の解消 | 一貫性 | 小 | 小 | P2 | 1 |
| 17 | 残る security / privacy と concurrent create テスト | 品質 | 中 | 中 | P2 | 6 |
| 18 | behavior TDD の実測化と baseline 文書の訂正 | 品質 | 中 | 大 | P2 | 4, 5, 13 |
| 19 | fingerprint の計算コスト削減 | 性能 | 中 | 中 | P2 | 3 |
| 20 | 既定言語と注入メッセージの i18n | 採用 | 小 | 小 | P2 | 9 |
| 21 | npm publish 自動化と Windows CI | 品質 | 中 | 中 | P1/P2 | 6 |
| 22 | `report` コマンド | 価値証明 | 中 | 中 | P3 | 12 |
| 23 | OSS 公開に向けた README とポジショニング | 採用 | 大 | 小 | P3 | 4, 7, 18, 21 |

P0 は「v0.2.0 を信頼性確立リリースとして出す前のブロッカー」と定義する。保証不成立だけでなく、公開している privacy・runtime・Node 下限の中心主張と、利用者へ生成する CI の正しさを含む。

---

## 2. 正しさ・ガバナンス強度

### 2.1 [P0] 証跡を exact changeset へ束縛する

**現状.** `DecisionEvidence` は `decisionCorpusHash`、`outcome`、`reviewedProposals` の 3 要素だけを持つ（[`src/core/decision-evidence.ts`](../src/core/decision-evidence.ts)）。`attest` は base ref に対してのみ実行され（[`src/cli/commands/attest.ts`](../src/cli/commands/attest.ts)）、変更内容そのものを見ない。

**問題.** 証跡が「何を変更したか」に紐づいていない。PR を開いた直後に `attest --no-adr reversible --rationale "..."` を貼っておけば、その後 base の ADR 集合と参照 ADR が変わらない限り、**どれだけ大きな設計変更を追加 push しても gate は通る**。仕様 §21-13 の受け入れ条件「ADR/CONTEXT/生成物以外の変更は accepted ADR か明示的 no-ADR evidence を一つ持つ」は、文言としては満たされるが、証跡の freshness を保証できていない。

**棄却する案.** 変更パスを連結した `changedPathsHash` だけを保存し、現在の集合が証跡の集合の部分集合か判定する案は採らない。ハッシュから元の集合を復元できないため包含判定ができず、仮にパス一覧を保存しても同一ファイル内の後続変更を検出できない。

**提案.** `DecisionEvidence` を schemaVersion 2 にし、証跡を base と exact changeset に束縛する。

```ts
type DecisionEvidenceV2 = {
  schemaVersion: 2
  baseCommit: string
  decisionCorpusHash: string
  changeSet: {
    algorithm: 'git-change-set-v1'
    digest: string
  }
  outcome: DecisionEvidenceOutcome
  reviewedProposals: Array<{ id: string; relation: 'unrelated' }>
}
```

`git-change-set-v1` は、`git merge-base <baseCommit> HEAD` のtreeと現在snapshotのpath和集合から差があるentryだけを取り出し、正規化した path、比較base側の file mode / content hash、現在側の file mode / content hash（存在しない側は sentinel）をバイト順でソートし、NUL区切りで連結した SHA-256 とする。rename判定のheuristicは使わず、旧pathのdeleteと新pathのaddとして表現する。ローカルの現在snapshotは HEAD に staged / unstaged / untracked を重ねた状態、CIではcheckoutされたhead treeである。stateやgitignore対象は含めず、`attest` と `check --base` は同じ pure function を使用する。base commit 自体も証跡へ保存し、CLI に渡された immutable base SHA と一致させる。これによりPR差分の意味を維持しつつ、base tip更新時には再attestを要求する。

これにより、パス追加だけでなく、同一ファイルの後続編集、削除、rename、mode 変更でも証跡を stale とし、`decision-changeset-stale` を返す。rebase で commit ID だけが変わっても base と最終treeが同じなら同じ digest になる。schemaVersion 1 の証跡は v0.2 系では warning、v0.3 で reject とする。

**受け入れ条件.** 次の統合テストが green。

- attest 後の新規パス追加が enforce で失敗する
- attest 後に同じパスの内容だけ変えても失敗する
- add / modify / delete / rename（delete + add）/ mode change が安定して digest に反映される
- 列挙順が異なっても同じ changeset は同じ digest になる
- base SHA が異なれば同じtreeでも stale になる
- schemaVersion 1 は warn と enforce の移行規約どおりに扱われる

### 2.2 [P0] after-turn の docs 更新判定を corpus hash に置き換える

**現状.** ターンが解決したかの判定に `detectDocsPathsUpdated` を使い、ADR ディレクトリと CONTEXT ファイルの **mtime がターン開始時刻以降か**だけを見る（[`src/core/fingerprint-build.ts:163`](../src/core/fingerprint-build.ts#L163)）。

**問題.** 3 つの誤りが同居している。

1. `touch docs/adr/0001-*.md` だけでも「文書が更新された」と判定され、監査が解決したことになる。
2. 逆に、ADR を編集した後に checkout やフォーマッタが mtime を巻き戻すと、更新が見落とされる。
3. 判定粒度が「ディレクトリ配下のどれか」なので、どの ADR がどう変わったかを state に残せていない。

**提案.** 既に `buildWorkingDecisionCorpus` / `hashDecisionCorpus`（[`src/core/decision-corpus.ts`](../src/core/decision-corpus.ts)）が内容ハッシュを計算できる。before-turn で corpus entries と corpus hash を `TurnState` に保存し、after-turn で再計算する。hash が異なるときだけ「docs 更新あり」とし、差分 path も state に残す。計算対象は ADR Markdown と CONTEXT / CONTEXT-MAP に限定する。

これは `touch` と mtime の巻き戻しを解決するが、**内容変更が判断に対して意味のある更新かは判定しない**。無関係な typo でも corpus hash は変わる。意味的な妥当性は §0.1 のとおり人間レビューと CI の構造検証に委ね、hook の主張は「governance corpus の内容が変わった」までに限定する。

**受け入れ条件.** ADR を `touch` しただけのターンが監査を解決しないこと、内容変更と追加・削除が mtime に依らず検出されること、README や非Markdownファイルの変更では解決しないことの回帰テスト。

### 2.3 [P0] untracked file 由来の無言デグレを可視化する

**現状.** `observeRepositoryState` は untracked file をすべて内容ハッシュ化する。ファイル数が 500 を超える、または単一ファイルが 1MB を超えると `hashUntrackedFiles` が `null` を返し、observation 全体が `null` になる（[`src/core/fingerprint-build.ts:33-72`](../src/core/fingerprint-build.ts#L33-L72)）。その結果 `repositoryFingerprintChanged` が `null` を返し（[`src/core/fingerprint.ts:23`](../src/core/fingerprint.ts#L23)）、after-turn は「実変更なし」として扱う。

**問題.** untracked な 1MB のログやデータセットが 1 つ置かれているだけで、**そのリポジトリでは実変更ベースの監査が恒久的に無効化される**。fail-open 自体は設計どおり（仕様 §14.3）だが、警告も痕跡も出ないため、利用者は「hook は動いているが検出していない」状態に気づけない。ADR ガバナンスとしては、静かに効かなくなるのが最悪の壊れ方である。

**提案.**

1. 予算超過時は内容ハッシュを諦め、`path\0size\0mtime` のメタデータハッシュへ**縮退**する（仕様 §14.2 の縮退方針と同じ考え方）。誤検出は増えるが、検出漏れよりは安全側。
2. 縮退したことを `TurnState` に `degraded: 'untracked-budget'` として記録し、stderr に一度だけ警告を出す。
3. 縮退中は「CI の decision gate が最終権威である」旨をターン指示に含める。

メタデータ縮退は同サイズ・同mtimeの内容変更を見逃しうるため、完全な代替ではない。`collectionAvailable` を true に偽装せず、`collectionMode: 'content' | 'metadata' | 'unavailable'` として精度を明示する。

**受け入れ条件.** 1MB 超の untracked file がある fixture repo で、変更検出が縮退モードで動作し警告が出る。

### 2.4 [P1] no-ADR 理由の検証可能性を上げる

**現状.** `no-adr` の `rationale` は非空の自由文であればよい（[`src/core/decision-evidence.ts:87`](../src/core/decision-evidence.ts#L87)）。

**問題.** エージェントは「reversible / 通常の実装詳細のため」と書けば常に通過できる。理由コードの分布を後から検査する手段もないため、ガバナンスが形骸化しても気づけない。

**提案.** 拒否ではなく可視化で対処する。まず provider-neutral な telemetry event schema を定義し、`attest` と `check` が privacy を保った構造化イベントを出力できるようにする。保存先、保持期間、CIからの収集方法は利用者が明示的に選ぶ。`check --json` には当該実行の理由コードと rationale を含める。

その後 `report`（§7.1）で「直近 N 件の no-ADR 理由分布」「同一 rationale の再利用率」を出し、同一 rationale の連続使用が閾値を超えたら warning にする。機械が意味を判定しない（仕様 §19）という原則は維持する。rationale は機密情報を含みうるため、既定の永続ログには本文を保存せず、理由コードと rationale hash のみを記録する。

**受け入れ条件.** telemetry無効時は永続ファイルを増やさず、有効時もprompt / transcript / source / rationale本文がlogへ現れないこと。同一rationaleの再利用をhashで集計できること。

---

## 3. 検出精度

### 3.1 [P1] risk 語彙と watch path を設定可能にする

**現状.** high-signal 語と watch path はソース内のハードコード配列（[`src/core/risk-signals.ts:5-67`](../src/core/risk-signals.ts#L5-L67)）。`adr.config.json` から一切変更できない。

**問題.**

- **語彙の誤検出.** 判定は `normalized.includes(term)` の部分一致で、語境界を見ない。`auth` は "author" に、`context` は "in this context" に、`event` は "eventually" に当たる。signal 3 件で `likely` になるため、通常の実装依頼が `likely` へ跳ね上がりうる。自リポジトリの `hooks.enabled: false` との因果関係は確認できていないため、dogfooding で計測する。
- **エコシステム偏り.** watch path は `package.json` / `pnpm-lock.yaml` / `drizzle/` / `wrangler.toml` など JS/TS 前提である。Python（`pyproject.toml`、`alembic/`）、Go（`go.mod`）、Rust（`Cargo.toml`）、JVM（`pom.xml`、`build.gradle`）、Ruby（`Gemfile`）、`Dockerfile`、`openapi.yaml`、k8s マニフェストが対象外。JS 以外のリポジトリでは実変更検出がほぼ効かない。
- 日本語語彙は `documents.language === 'ja'` のときだけ有効なので、en 設定のリポジトリで日本語プロンプトを書くと signal が 0 になる。

**提案.**

1. 英語はtoken単位のmatchへ変更する。`auth` だけを境界一致させると `authentication` / `authorization` を落とすため、短縮語と正式語をaliasとして定義する。日本語は正規化後の部分一致を維持する。語彙は言語設定に関わらず英日両方を常に評価する。
2. `adr.config.json` に `signals: { terms: string[], watchPaths: string[], mode: "extend" | "replace" }` を追加する。既定はプリセット、`extend` で追記。
3. 既定 watch path にエコシステム別プリセットを追加し、`init` の解析結果（検出した manifest 種別）から選択して plan に載せる。
4. `likely` の閾値（現在 3）を設定可能にする。

**受け入れ条件.** "Please refactor the author list rendering" が `none` になる、`pyproject.toml` 変更が watch path として検出される、の 2 テスト。

### 3.2 [P2] Cursor でターン単位の指示が届かない

**現状.** before-turn は risk に応じた `fullInstruction`（3 条件、関連 ADR パス、レイアウト）を組み立てるが（[`src/hooks/common.ts:16`](../src/hooks/common.ts#L16)）、Cursor 向け出力は `{ continue: true }` だけで、この指示を捨てている（[`src/hooks/adapters/cursor.ts:23`](../src/hooks/adapters/cursor.ts#L23)）。`sessionStart` では `standingReminder` の 1 行しか渡らない。Cursor の `beforeSubmitPrompt` が context を返せない公式仕様（仕様 §10）に由来する、設計上既知の制約である。

**問題.** 結果として **Cursor だけ、関連 ADR の提示も 3 条件の再掲もターン単位では届かない**。alwaysApply Rule の常駐 1 行のみで判断させることになり、4 ランタイム等価という製品の中心主張（仕様 §2-1）が Cursor で最も弱い。

**提案.** 直ちに単一の `.adr-governance/state/current-turn-instruction.md` を導入せず、time-boxed な実測スパイクを先に行う。単一ファイルは複数Cursorウィンドウや並行turnで上書き競合し、別セッションの指示を読ませるおそれがある。

スパイクでは次を確認する。

- alwaysApply Rule からgitignore対象の動的ファイルを安定して読ませられるか
- beforeSubmitPrompt とRule評価の順序が期待どおりか
- conversation / generation 単位のファイルをRuleから選択できるか
- 2ウィンドウ並行時に指示が混線しないか
- ファイルがstaleまたは欠損したときに通常作業を阻害しないか

セッション分離を保証できない場合はこの回避策を採用せず、Cursorではstanding reminder + stop follow-upを明示的な能力差として文書化する。Cursorが将来context注入に対応した場合は公式経路へ切り替える。

**受け入れ条件.** 採用判断、runtime / Cursor version、各試行結果、並行2セッションの結果をスパイク記録へ残す。混線が1回でも起きる方式は不採用とする。

### 3.3 [P2] 関連 ADR の抽出精度

**現状.** `rankRelevantAdrs` はタイトルと slug に対するトークン部分一致のみ（[`src/core/risk-signals.ts:95`](../src/core/risk-signals.ts#L95)）。

**提案.** 本文見出しと CONTEXT 用語を対象に含め、変更中のファイルパスと ADR 本文中のパス言及を突き合わせる。外部 API や埋め込みは使わない（仕様 §3 の非目標）。素朴な TF-IDF 相当で十分効果が出る。

**受け入れ条件.** 固定fixtureでtop-5 recallを現行より改善し、無関係ADRだけを返す回帰を増やさない。評価fixtureと期待順位をrepositoryへ保存する。

---

## 4. 導入体験（採用のボトルネック）

### 4.1 [P1] `npx` 一発導入

**現状.** README の Quick start は、adr-governance を別途 clone し、`node /path/to/adr-governance/dist/bundle/cli.mjs` を絶対パスで叩き、`--from` でパッケージルートを渡す手順になっている。`package.json` は `bin` と `files` を持つので npm 配布の準備自体は済んでいる。

**問題.** 「試すのに clone とパス管理が要る」は OSS ツールとしては致命的な摩擦である。ADR ツールは導入判断が軽いほど広がる。

**提案.**

```bash
npx @guilz-dev/adr-governance init            # scan
npx @guilz-dev/adr-governance init --apply <plan>
```

を第一の導線にし、README の先頭に置く。`--from` は「clone 済みで開発している場合」の補助手段へ降格する。npm 公開（§7.3）とセットで実施。

**受け入れ条件.** 空の一時repoでpack済みtarballからscanとapplyが完了し、global installやpackage sourceの絶対pathを要求しないこと。

### 4.2 [P1] `init` を最小 plan と候補レビューへ分離する

**現状.** `init` は既に、適用可能な operation、evidence-informed な CONTEXT 草案、最大3件の proposed ADR候補、`reviewQuestions` を自動生成する（[`src/installer/init-plan-builder.ts`](../src/installer/init-plan-builder.ts)、[`src/installer/init-evidence-plan.ts`](../src/installer/init-evidence-plan.ts)）。一方、candidate evidence の `summary` は `"<path> observed in repository"` という定型文で、判断材料としては薄い（[`src/analysis/repository-scan.ts:123`](../src/analysis/repository-scan.ts#L123)）。

**問題.** 未自動化ではなく、初回 apply plan に、理由が未確認の proposed ADR候補まで含まれることが問題である。導入成功に不要な文書を初回から生成すると、利用者は候補の妥当性を評価する前にノイズを受け取る。

**提案.**

1. `init` の既定出力を **適用可能な最小 plan** にする（config、ディレクトリ、Skill、hook、CONTEXT スタブ、CI候補。ADR候補ゼロ）。
2. ADR候補と質問は `review-candidates.json` へ分離し、`init --include-adr-candidates` を明示した場合だけplanへ取り込む。
3. CONTEXT 草案内の「観測事実」と「理由未確認」を構造上分け、scan結果を決定事項として見せない。
4. evidence の `summary` を、manifest のキー、見出し、検出したframeworkなど具体的な観測事実に置き換える。

**受け入れ条件.** 既定planが proposed ADRを含まず、そのままapplyできること、opt-in時だけ候補を含むこと、既存レイアウトの文書を上書きしないことの統合テスト。

### 4.3 [P2] `doctor` コマンド

**現状.** 導入後の不具合（hook が登録されていない、Cursor の trust 未承認、`hooks.enabled: false`、Node バージョン、`check` が base ref を読めない）を切り分ける手段が `check` の error 一覧しかない。

**提案.** `adr-governance doctor` を追加し、ランタイム別の hook 登録状況、bundle の実行可否、state ディレクトリの書き込み権限、直近ターンの risk / 解決状況、縮退モード（§2.3）を 1 画面で出す。サポートコストを直接下げる。

**受け入れ条件.** 正常、hook欠損、trust未確認を案内すべき状態、bundle実行不可、base ref不可、fingerprint縮退のfixtureで、診断codeと修復案をJSONと人間可読形式の両方へ出す。

### 4.4 [P2] 既定言語と注入メッセージの i18n

**現状.** 文書テンプレートは `documents.language` を見る一方、hookのstanding reminder、audit follow-up、CLIの主要messageは英語固定である。init時の言語検出も `CONTEXT.md` と `AGENTS.md` の先頭部分に依存する。

**提案.** 保存・判定に使うreason codeは英語の安定識別子のまま維持し、利用者向けmessageだけを `ja` / `en` のmessage catalogへ分離する。未知localeへの一般化や翻訳framework導入は行わない。言語検出結果はplanへ根拠とともに表示し、apply前に変更できるようにする。

**受け入れ条件.** 同じ入力についてreason codeとJSON shapeは言語に依存せず、表示文だけが切り替わるgolden test。

---

## 5. CI・運用

### 5.1 [P0] 生成 CI と自リポジトリ CI を正し、dogfooding する

**現状.** 自リポジトリの `adr.config.json` は `hooks.enabled: false` / `changeGate.mode: "warn"`、CI は `lint` と `test` のみ。また `init` が生成する `ciWorkflowSuggestion` は `fetch-depth: 0` と `--github-event` を持たず、base が `origin/main` 固定で、仕様 §19 の immutable base SHA + PR evidence 契約を満たしていない（[`src/analysis/init-hints.ts`](../src/analysis/init-hints.ts)）。

**問題.** ADR ガバナンス製品が自分自身にガバナンスを適用しておらず、利用者には不完全なCI候補を生成する。`check --base` を実際のPR eventで通していないため、gate の統合リグレッションもテスト以外では検出されない。

**提案.** v0.2.0 の必須条件として次を実施する。

1. `ciWorkflowSuggestion` をPR用とprotected branch push用に分ける。PRでは `fetch-depth: 0`、immutable base SHA、`--github-event "$GITHUB_EVENT_PATH"` を使う。pushではPR evidenceを要求しないstructural checkにする。
2. 自リポジトリCIにも同じテンプレート由来のPR jobを追加し、テンプレートとdogfood設定のdriftをテストする。
3. `warn` のまま運用し、**14日以上かつ20 PR以上**を観測する。false positive 率が5%未満、unexplained degradationが0件、bot PR導線がgreen、P0 findingが0件になったら v0.2.x で `enforce` へ移行する。
4. `hooks.enabled: true` を復帰させる（[`docs/IMPLEMENTATION-STATUS.md`](./IMPLEMENTATION-STATUS.md) の再有効化手順が既にある）。
5. 自リポジトリの ADR を増やす。少なくとも「4 ランタイム対応」「bundle vendoring」「hook fail-open / CI fail-closed の非対称性」は ADR 化に値する既存判断である。

**受け入れ条件.** 生成workflowのgolden test、自リポジトリPRでのwarn実行、shallow cloneではなくbase SHAを読めること、push jobがPR evidence不足で失敗しないこと。

### 5.2 [P1] bot PR と非設計変更の導線

**現状.** enforce モードでは、ガバナンスパス以外の変更はすべて証跡を要求する。`exemptPaths` は完全一致か `/` 終端の前方一致のみで、glob を解釈しない（[`src/core/change-gate.ts:37-48`](../src/core/change-gate.ts#L37-L48)）。

**問題.** Dependabot の lockfile 更新 PR は本文に証跡ブロックを書けないため、enforce では必ず落ちる。自リポジトリには Dependabot が有効で、実際に 7 本の dependabot ブランチが存在する。「gate を入れると bot PR が全部赤くなる」は enforce 化を止める最大の実務障壁になる。

**提案.**

1. `exemptPaths` を glob 対応にする（`**/*.lock`、`**/pnpm-lock.yaml` など）。glob単独では自動免除せず、actorまたは明示ラベルとの組み合わせ条件に使う。
2. `changeGate.exemptActors: string[]`（例: `dependabot[bot]`）を追加し、**信頼済み actor AND 全変更pathが許可globに一致**するときだけdecision evidenceを免除する。PR作成者ではなく、検証対象headを生成した主体を判定できない場合は免除しない。
3. `adr-exempt` ラベルは権限のある人間が付与した場合だけ有効とし、actor、label、matched paths、理由を `check` の構造化出力へ必ず記録する。
4. bot PRへ人間が追加pushした場合、または許可外pathが1件でもある場合は通常gateへ戻す統合テストを追加する。
5. `attest` の出力を PR にコメント投稿する GitHub Action テンプレートを `templates/` に置く。

**受け入れ条件.** 純粋なbot lockfile PRだけが免除され、人間の追加push、許可外path、主体不明、権限不明ラベルの各fixtureは通常gateへ戻ること。全免除結果が構造化出力に残ること。

### 5.3 [P1] `check` の出力形式

**現状.** 人間可読テキストか `--json` の 2 択で、CI 上では Actions のログを開かないと内容がわからない。

**提案.** `--format sarif` と `--format github-annotations` を追加する。SARIF は GitHub code scanning にそのまま載り、ファイル・行に紐づいた指摘として PR に表示される。ADR ガバナンスは「指摘が見えるところに出る」ことが遵守率に直結する。

**受け入れ条件.** 同じfinding集合からtext / JSON / GitHub annotation / SARIFを生成し、code、severity、pathの意味が一致するgolden test。pathを持たないfindingもrepository-level resultとして欠落しないこと。

### 5.4 [P2] `requireNoAdrRationale` が実装されていない

**現状.** `changeGate.requireNoAdrRationale` は型・スキーマ・既定値・テスト fixture には存在するが、判定ロジックのどこからも参照されていない。rationale は `parseDecisionEvidence` が常に必須にしているため、`false` にしても挙動は変わらない。

**提案.** 設定キーを削除し、rationaleを常時必須にする。config v2はまだ `Unreleased` なので、v0.2.0を出す前に型・schema・既定config・fixtureから削除し、versionは2のまま確定させる。既にUnreleased版を試したcheckout向けには、旧キーをunknown key warningとして一時的に受理する。公開済みschemaの互換変更として扱わない。

**受け入れ条件.** 新規config v2に旧キーがなく、no-ADR rationale空は常に拒否され、旧キー付きUnreleased configは明示warning付きで読み込めること。

---

## 6. 性能・堅牢性・品質保証

### 6.1 [P0] hook shim のウォッチドッグ

**現状.** ランタイム shim は bundle された hook を子プロセスとして起動し、spawn 失敗時のみ fail-open する（[`templates/cursor/hooks/adr-governance.mjs:43`](../templates/cursor/hooks/adr-governance.mjs#L43)）。子プロセスが**ハングした場合のタイムアウトがない**。

**問題.** Cursor と Codex はランタイム側 2 秒タイムアウトがあるが、Claude Code の Stop hook は既定 60 秒である。巨大リポジトリで `git diff --binary HEAD` が詰まると、ターン終了が最大 1 分止まる。仕様 §14.3 の「hook timeout 2 秒」は shim 側で担保されていない。

**提案.** shim に既定1.5秒のウォッチドッグを入れ、超過したら子プロセスとその出力pipeを終了して、runtimeごとの正しいfail-open JSONを一度だけ返す。timeoutは2秒未満という上限を守る範囲で設定可能にする。4ランタイム分のshimは静的templateとして複製されているため、共通templateから生成するbuild stepか、共有runner moduleのどちらかに寄せる。

**受け入れ条件.** 意図的にhangするhook fixtureについて、全runtimeのshimが2秒以内に終了し、子プロセスが残らず、stdoutが単一の有効JSONであること。

### 6.2 [P2] fingerprint の計算コスト

**現状.** before-turn と after-turn の両方で、`git status --porcelain -z --untracked-files=all`、`git rev-parse HEAD`、`git diff --no-ext-diff --binary HEAD` を実行し、さらに全 untracked file を読んでハッシュ化する。加えて watch path の内容ハッシュも取る。

**問題.** `git diff --binary HEAD` は作業ツリー全体の差分を（バイナリ込みで）実体化するため、変更量に比例してコストが上がる。仕様 §14.3 の p95 300ms / 500ms を大きなリポジトリで満たせない。

**提案.** `git diff --name-only HEAD` と `git status` の結果から**変更されたパスのみ**を内容ハッシュ化する方式に変える。バイナリ差分の実体化は不要。1MB 超のファイルはサイズと mtime で代替する（§2.3 の縮退と同じ規約）。ベンチマークを `tests/` に置き、代表的なリポジトリサイズで回帰を検出する。

**受け入れ条件.** clean、既存dirty、同一path再編集、大容量binary、500超untrackedのfixtureで変更判定を維持し、代表fixtureのbefore-turn p95 300ms / after-turn p95 500msを満たす。未達環境では計測値と縮退理由を出す。

### 6.3 [P0/P2] 仕様が要求しているのに存在しないテスト

仕様 §18.5（security / privacy）と §18.3（concurrent create）のテストが未実装である。前者はプライバシーが製品の主張（prompt 本文を保存しない）そのものなので、テストがないこと自体がリスクになる。

**提案.** 公開中の中心主張を守る次の3件と、`engines` 下限である Node 20 のフルテストを v0.2.0 の P0 にする。

- prompt 本文が state / log / manifest のどこにも現れないこと
- `.env` / secret / credential パターンが evidence bundle に含まれないこと
- repo 外パスと symlink 経由の書き込みが init plan で拒否されること
- Node 20で `pnpm lint` と `pnpm test` がgreenであること

残りはP2として追加する。

- stdout が各ランタイムの JSON 以外で汚染されないこと（`console.log` 混入の回帰）
- 同一 worktree での `create` 同時実行で採番が重複しないこと

**受け入れ条件.** P0 testはNode 20と22でgreen、privacy fixtureの禁止文字列検索が0件。concurrent createは複数processを同時開始して番号重複と部分ファイルが0件。

### 6.4 [P2] behavior baseline 文書の扱い

**現状.** [`docs/behavior-baseline/2026-09-03-decision-authority-red.md`](./behavior-baseline/2026-09-03-decision-authority-red.md) は「静的解析と代表的シミュレーション」と明記している一方、各 fixture に `transcript hash: sha256:...` を併記している。実際にはこれらは 56〜63 桁で、SHA-256（64 桁）として成立していない。

**問題.** 読者は「4 ランタイムで実測した記録」と誤読しうる。仕様 §18.1 は「単一サンプルの成功を behavior acceptance に使わない」と明示しており、記録の見え方が実態より強い。

**提案.** 短期的には、実測でない行から `transcript hash` を削除し、`method: static-analysis` と明記する。中期的には §7.2 のとおり実測へ移行する。

**受け入れ条件.** static analysis記録にruntime実測を示すfieldがなく、実測記録のhashは64桁のSHA-256としてschema検証されること。

---

## 7. プロダクトとしての次の一手

### 7.1 [P3] `report` コマンド — ガバナンスが効いている証拠を出す

ADR ガバナンスは「導入したが効果がわからない」で捨てられる。ただし現状の手元データだけでは、次の全指標は再構成できない。audit logは主にhuman promotionだけを記録し、turn stateとその配下のlogは7日でpruneされ、CIの `check` 結果とPR evidenceは永続化されない。

先に §2.4 の telemetry 契約を実装し、opt-inで収集された構造化イベントとADRのgit履歴から次を出す `report` を作る。

- ADR 作成数と status 遷移の推移
- no-ADR 理由コードの分布（`reversible` 偏重は形骸化のサイン）
- 監査 follow-up の発生率と解決率
- `check --base` の失敗コード分布

イベントにはprompt / transcript / source本文を含めず、rationaleは既定でhashだけを保存する。保持期間の既定は30日、ローカル保存はgitignore対象とし、CI横断集約は本体の非目標としてexport formatだけを提供する。これは §2.4 の可視化とも共有できる。

**受け入れ条件.** 30日分のfixture eventから4指標を再現でき、欠損期間や収集無効を0件として誤表示しない。exportに禁止本文が含まれないこと。

### 7.2 [P2] behavior TDD を実測に載せる

仕様 §18.1 が要求する「4 ランタイム × 各 fixture 3 回」は現在未実施（`docs/IMPLEMENTATION-STATUS.md` の backlog にも記載）。全自動化は難しいが、Claude Code と Codex CLI は非対話実行が可能で、fixture repo に対する実行を script 化できる。まず 2 ランタイムを自動化し、Cursor と Gemini CLI は手動実行の記録フォーマットを固定する。**GREEN の根拠が実測であることが、この製品の中心的な主張の裏づけになる。**

**受け入れ条件.** 4 runtime × 5 fixture × 3 runの全記録がschema検証を通り、authority invariant違反が0件。runtime未提供などによる未実施をpassとして扱わない。

### 7.3 [P1/P2] リリース自動化

P1として、タグ push で `npm publish --provenance` を行う workflow を追加し、CHANGELOG の `Unreleased` を release version として切る。`npx` 導線を公開する前に provenance 付きpublishとdry-run package内容検証を必須にする。

P2としてWindowsをCI matrixへ追加する。Node 20検証は §6.3 のP0として先行する。`commandWindows` テンプレートを生成しているのにWindowsで一度も検証していない状態を解消する。

**受け入れ条件.** `npm pack --dry-run` の内容検証、provenance付きpublishのdry-runまたはstaging確認、既存tagへの再publish拒否、Windowsでのlint / test / bundle smoke testがgreen。

### 7.4 [P3] OSS 公開に向けたポジショニング

README は機能の羅列から入っており、「なぜ必要か」がない。公開時は次を先頭に置く。

- **課題:** コーディングエージェントは設計判断を黙って行い、その理由がリポジトリに残らない
- **解:** 4 ランタイム共通の判断基準 + CI の decision gate
- **既存ツールとの差:** `adr-tools` / `log4brains` は文書のフォーマットと閲覧が対象。本製品はエージェントのターンと CI に判断の記録を強制する点が異なる
- 生成される ADR の実例、before/after のリポジトリ例

MIT ライセンスかつ非公開リポジトリという現状も、公開時期の判断とあわせて整理する。

**受け入れ条件.** README先頭だけで対象課題、保証範囲、非保証、最短導入、生成物例を確認できる。公開前チェックリストにlicense、security contact、package provenance、self-hosting enforce実績を含める。

---

## 8. ロードマップ案

| リリース | 内容 |
|----------|------|
| **v0.2.0**（gate の信頼性確立） | §2.1 exact changeset束縛 / §2.2 corpus hash / §2.3 縮退可視化 / §5.1 生成CI修正とwarn dogfood / §6.1 watchdog / §6.3 privacy中心テストとNode 20 / §5.4 死に設定の方針決定 |
| **v0.2.x**（enforce移行） | §5.2 bot例外の安全な最小実装 / §5.1 の14日・20 PR・品質閾値を満たした時点で自リポジトリを `enforce` |
| **v0.3.0**（採用の摩擦除去） | §7.3 npm publish自動化 / §4.1 npx / §4.2 init分離 / §3.1 signal設定化 / §5.3 GitHub annotation・SARIF / §2.4 telemetry event出力 |
| **v0.4.0**（品質の外形証明） | §3.2 Cursor実測 / §3.3 関連ADR / §4.3 doctor / §4.4 i18n / §6.2 性能 / §6.3 残テスト / §6.4 baseline訂正 / §7.2 behavior実測 / §7.3 release・Windows |
| **v1.0.0** | §7.1 report / §7.4 公開 / config v2のみ / DecisionEvidence v2のみ / self-hosting enforce実績をrelease evidenceとして提示 |

## 9. 本提案の非目標

仕様 §3 の非目標は維持する。以下は本提案でも扱わない。

- 外部 LLM API / 中央 MCP サービスによる ADR 本文生成
- 人間承認の暗号学的証明
- ブランチ横断の中央採番サービス
- 会話本文・プロンプト本文の永続化
- ADR 作成件数を増やすこと自体の最適化

特に §2.1 と §2.4 は「機械が意味を判定しない」原則（仕様 §19）の内側に収まるよう設計してある。ゲートが検証するのは形式・参照・鮮度・変更集合の対応であり、判断の妥当性ではない。
