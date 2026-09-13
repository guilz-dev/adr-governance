# ADR Governance — 複数コーディングエージェント共通運用設計

> **正本:** このファイルが単独リポジトリ `adr-governance` の authoritative source of truth である。
> guilz monorepo の旧文書は historical pointer とし、以後の設計変更はこのファイルへ反映する。

- **作成日:** 2026-08-22
- **ステータス:** 実装中（[guilz-dev/adr-governance](https://github.com/guilz-dev/adr-governance) **v0.1.8** — 詳細はリポジトリ [`docs/IMPLEMENTATION-STATUS.md`](https://github.com/guilz-dev/adr-governance/blob/main/docs/IMPLEMENTATION-STATUS.md)）
- **成果物:** 単独リポジトリ `adr-governance`（https://github.com/guilz-dev/adr-governance）
- **対象ランタイム:** Cursor、Claude Code、Codex CLI、Gemini CLI
- **Skill名:** `managing-adrs`

## 1. 決定

ADR運用を単独リポジトリ `adr-governance` として実装する。リポジトリは、共通Agent Skill、依存を同梱したNode.js CLI、リポジトリ解析、ADRライフサイクル管理、各ランタイムのhookアダプターを提供する。

対象プロジェクトでは `.agents/skills/managing-adrs/` をSkillの正本とし、各ランタイム固有の設定にはADR判断ロジックを複製しない。Cursor、Claude Code、Codex CLI、Gemini CLIのhookは、共通の `.adr-governance/bin/hook.mjs` を呼び出して同一ポリシーを受け取る。

新規プロジェクトの既定レイアウトは次とする。

- `docs/adr/`: accepted、superseded、deprecatedのADR
- `docs/proposed-adr/`: proposed、rejectedのADR
- `CONTEXT.md`: 単一コンテキストのユビキタス言語
- `CONTEXT-MAP.md`: 複数コンテキストの索引。必要な場合だけ生成する

既存ADR運用があるプロジェクトでは、`init` が現在のディレクトリ、命名、status管理を検出し、移行を強制せず `adr.config.json` に取り込む。

acceptedへの昇格は既定で人間の承認を要求しない。設定を `requireHumanAcceptance: true` にした場合だけ、Skillは明示的な承認を得るまでproposedのまま保持する。この設定は運用ガードであり、人間の本人性を暗号学的に証明するセキュリティ境界ではない。

## 2. 目的

本システムは次を満たす。

1. 4つの対象ランタイムで、同じADR判定基準と文書ライフサイクルを使う。
2. 各ユーザープロンプトでADR運用が評価対象になる。
3. 重要な判断が確定した場合、必要なADRまたはCONTEXT更新を通常作業の一部として行う。
4. 軽微な変更でADRを増殖させず、将来の読者に必要な理由だけを残す。
5. 初回 `init` でコードと既存文書を解析し、CONTEXTとADR候補のベースを作る。
6. 既存設定ファイルを上書きせず、生成部分だけを冪等に導入・更新する。
7. CLIとCIで採番、status、リンク、生成物driftを機械検証する。

## 3. 非目標

- ADR本文を生成するための外部LLM APIまたは中央MCPサービス
- 人間承認の本人性・署名・組織ID連携
- すべての既存ADRフォーマットの自動変換
- Gitブランチをまたぐ連番の中央採番サービス
- 会話全文またはプロンプト本文の永続保存
- ADR作成件数を増やすこと自体の最適化
- コードから設計理由を事実として捏造すること

## 4. 基本原則

### 4.1 ADRを書く条件

次の3条件をすべて満たす判断だけをADRにする。

1. **Hard to reverse:** 後から変える費用が有意に大きい。
2. **Surprising without context:** 理由を知らない将来の読者が、実装を誤りまたは意図的な設計を戻す可能性がある。
3. **Real trade-off:** 現実的な代替案があり、明示的な理由で一つを選んだ。

いずれかが欠ける場合はADRを作らない。一般的な実装詳細、容易に戻せる選択、唯一の実行可能案は、コード、テスト、通常の文書へ記録する。

### 4.2 ADRとCONTEXTの責務

- ADRは「何を、なぜ選んだか」を記録する。
- CONTEXTはドメイン固有語の意味と避ける表現を記録する。
- 実装手順、作業メモ、未整理の案、API一覧をCONTEXTへ置かない。
- 用語の意味が確定しただけならCONTEXTを更新し、設計判断がなければADRを作らない。

### 4.3 accepted ADRの更新

accepted ADRは完全な不変文書にはしない。

- 判断の同一性を保つ説明改善、誤字、リンク、実装後に判明した補足、Consequencesの追記は直接更新する。
- 結論、主要な制約、責務境界、採用技術、重要なトレードオフが変わる場合は新ADRを作り、旧ADRをsupersededにする。
- 判断基準は「修正前後が同じ設計判断を表すか」とする。
- 細かな編集履歴はGitを正本とし、ADR内に変更履歴表を持たない。

## 5. システム構成

### 5.1 単独リポジトリ

```text
adr-governance/
├── skill/
│   └── managing-adrs/
│       ├── SKILL.md
│       └── references/
│           ├── decision-policy.md
│           ├── adr-format.md
│           └── context-format.md
├── src/
│   ├── core/
│   │   ├── config.ts
│   │   ├── lifecycle.ts
│   │   ├── numbering.ts
│   │   ├── repository-state.ts
│   │   ├── risk-signals.ts
│   │   └── validation.ts
│   ├── analysis/
│   │   ├── repository-scan.ts
│   │   ├── evidence-bundle.ts
│   │   └── existing-layout.ts
│   ├── cli/
│   │   ├── main.ts
│   │   └── commands/
│   │       ├── init.ts
│   │       ├── check.ts
│   │       ├── sync.ts
│   │       ├── create.ts
│   │       ├── promote.ts
│   │       ├── supersede.ts
│   │       └── turn-close.ts
│   ├── hooks/
│   │   ├── common.ts
│   │   ├── before-turn.ts
│   │   ├── after-turn.ts
│   │   └── adapters/
│   │       ├── cursor.ts
│   │       ├── claude.ts
│   │       ├── codex.ts
│   │       └── gemini.ts
│   └── installer/
│       ├── merge-jsonc.ts
│       ├── generated-files.ts
│       └── manifest.ts
├── templates/
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── behavior/
├── package.json
└── tsconfig.json
```

TypeScriptで実装し、ESMへビルドする。CLIとhookは依存をbundleした単一 `.mjs` として対象プロジェクトへ配置する。対象プロジェクト側にnpm installを要求しない。実行要件はNode.js 20以降とGitとする。

### 5.2 対象プロジェクトへ生成する構成

```text
target-repo/
├── adr.config.json
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   └── README.md
│   └── proposed-adr/
├── .agents/
│   └── skills/
│       └── managing-adrs/
│           ├── SKILL.md
│           └── references/
├── .adr-governance/
│   ├── .gitignore
│   ├── bin/
│   │   ├── cli.mjs
│   │   └── hook.mjs
│   ├── schema/
│   │   ├── adr-config.schema.json
│   │   └── init-plan.schema.json
│   └── manifest.json
├── .cursor/
│   ├── rules/adr-governance.mdc
│   └── hooks/adr-governance.mjs
├── .claude/
│   ├── commands/adr.md
│   └── hooks/adr-governance.mjs
├── .codex/
│   └── hooks/adr-governance.mjs
└── .gemini/
    └── hooks/adr-governance.mjs
```

`.agents/skills/managing-adrs/` はCursor、Codex CLI、Gemini CLIが直接発見する正本である。Claude Codeは `UserPromptSubmit` hookから必要時に正本を読むよう指示される。明示実行用に `.claude/commands/adr.md` を生成するが、判断ロジックは含めず正本へルーティングするだけにする。

## 6. 設定契約

設定はhookを依存なしで起動できるようJSONとし、`adr.config.json` に置く。

```json
{
  "$schema": ".adr-governance/schema/adr-config.schema.json",
  "version": 1,
  "layout": {
    "mode": "split",
    "acceptedDir": "docs/adr",
    "proposedDir": "docs/proposed-adr",
    "contextFile": "CONTEXT.md",
    "contextMapFile": "CONTEXT-MAP.md"
  },
  "promotion": {
    "requireHumanAcceptance": false
  },
  "documents": {
    "language": "ja",
    "idDigits": 4,
    "allowAcceptedClarifications": true
  },
  "hooks": {
    "enabled": true,
    "afterTurnAudit": true,
    "maxFollowUps": 1
  },
  "analysis": {
    "maxFiles": 2000,
    "maxBytesPerFile": 262144,
    "exclude": [
      ".git/**",
      "node_modules/**",
      "vendor/**",
      "dist/**",
      "build/**",
      "**/.env*",
      "**/*secret*",
      "**/*credential*"
    ]
  }
}
```

### 6.1 設定規則

- 新規導入の既定は `layout.mode: split` とする。
- 既存の単一ディレクトリ運用を検出した場合は `layout.mode: single` とし、`acceptedDir` と `proposedDir` に同じパスを設定できる。
- `promotion.requireHumanAcceptance` の既定は `false` とする。
- `false` は自動acceptedを許可する設定であり、未決事項があるADRまでacceptedにする命令ではない。
- 設計判断が未確定、理由が不明、Open Pointsが残る場合は設定値にかかわらずproposedとする。
- `documents.language` は `init` の解析結果で `ja` または `en` を提案し、適用前レビューで確定する。
- 不明な設定キーは将来互換性のため保持するが、`check` でwarningを出す。
- 未対応の `version` はhookをfail-openし、`check` をerrorにする。

## 7. 文書契約

### 7.1 ファイル名と採番

- ファイル名は `NNNN-kebab-case-slug.md` とする。
- acceptedDirとproposedDirの両方を走査し、最大番号+1を次の番号とする。
- proposedでも番号を確保し、昇格時に番号を変更しない。
- rejectedになったproposedは削除せず、proposedDirに保持する。
- 同一worktree内の採番は排他ロックとatomic renameで競合を防ぐ。
- 別ブランチ・別worktree間の同時採番は中央サービスなしでは保証できない。`check --base <ref>` が重複を検出し、merge前に未accepted側を再採番する。

### 7.2 frontmatter

新規ADRは次のfrontmatterを使う。

```yaml
---
status: proposed
date: 2026-08-22
---
```

accepted時は受理方法を追加する。

```yaml
---
status: accepted
date: 2026-08-22
acceptance: automatic
---
```

`requireHumanAcceptance: true` で人間が承認した場合は `acceptance: human` とする。CLIは承認の方法と時刻をローカル監査ログへ記録するが、個人名を推測してADRへ書かない。

superseded時は次とする。

```yaml
---
status: superseded
date: 2026-08-22
superseded_by: ADR-0008
---
```

既存ADRにfrontmatterがない場合、`init` は即時書き換えず互換モードを設定する。新規・変更対象になったADRから正規形式へ移行する。

### 7.3 本文

本文の最小契約は次とする。

```md
# 短い判断タイトル

判断が必要になった文脈、採用した結論、選んだ理由を1〜3段落で記述する。
```

次の節は情報価値がある場合だけ追加する。

- `## Considered Options`: 後から再提案されやすい代替案がある
- `## Consequences`: 非自明な負担、制約、移行影響がある
- `## Open Points`: proposedだけで使用し、未解決事項を列挙する

テンプレートの節を埋めるためだけの文章は追加しない。acceptedにOpen Pointsを残してはならない。

### 7.4 CONTEXT

- 単一コンテキストではルート `CONTEXT.md` を使う。
- 複数コンテキストではルート `CONTEXT-MAP.md` と各コンテキストの `CONTEXT.md` を使う。
- 定義は1〜2文とし、必要なら `_Avoid_:` で避ける同義語を示す。
- 一般的なプログラミング語、物理テーブル名、APIパス、実装手順は記載しない。
- ADRへのリンクは、その用語の意味を決めた判断を読む必要がある場合だけ付ける。

## 8. 初期化フロー

`init` は解析と適用を分離し、既存tracked fileを承認前に変更しない。

```text
User: adr-governance init
  │
  ├─ 1. Git rootと実行要件を確認
  ├─ 2. tracked fileを安全な上限内で走査
  ├─ 3. 既存ADR / CONTEXT / agent設定 / hook設定を検出
  ├─ 4. evidence bundleをOS一時ディレクトリへ出力
  ├─ 5. Agentがbundleと根拠ファイルを読み、init planを作る
  ├─ 6. 作成・更新候補をUserへ提示
  │      └─ この時点でtarget repoのtracked file変更は0件
  └─ 7. User承認後に init --apply <plan> を実行
         ├─ plan schemaと対象パスを再検証
         ├─ 既存設定へ管理entryだけをmerge
         ├─ Skill / hook bundle / config / docsをatomic write
         └─ checkを実行して結果を返す
```

### 8.1 解析対象

CLIは `git ls-files` を正本として、次を優先的に収集する。

- README、AGENTS.md、CLAUDE.md、GEMINI.md、既存設計文書
- package/workspace manifest、lockfile、build設定
- トップレベルディレクトリとpackage境界
- DB schemaとmigration名
- API route、公開型、schema、イベント名
- IaC、deploy設定、CI設定
- 既存ADRとCONTEXT

CLIはファイル一覧、見出し、manifestの構造、候補根拠位置をevidence bundleへ記録する。secret候補、env file、credential file、binary、大容量生成物は読まない。

### 8.2 Agentによる意味解析

コードから確認できるのは現在の構造であり、選択理由とは限らない。Agentは次のように扱う。

- README、既存文書、コメント、commit可能な履歴に明示された理由だけをADRの根拠として使う。
- コードだけから見える構造は「観測された事実」としてinit planへ示す。
- 理由または代替案が不明なものはADR候補の質問として提示し、事実を補わない。
- Userが理由を確認した候補は、3条件を満たせばADRにする。
- `requireHumanAcceptance: false` でも、理由が未確認の候補はproposedまたは非生成とする。
- CONTEXT候補には、複数箇所で意味を持つドメイン固有語だけを含める。

### 8.3 single / multi-context判定

`CONTEXT-MAP.md` は、独立した用語、責務、データ所有、統合境界を持つコンテキストが複数確認できる場合だけ提案する。monorepoまたは複数packageであることだけではmulti-contextにしない。判断できない場合は単一の `CONTEXT.md` を提案する。

### 8.4 evidence bundleとinit plan契約

evidence bundleは意味的な結論ではなく、Agentが確認すべき根拠の索引である。

```ts
type EvidenceBundle = {
  schemaVersion: 1
  repository: {
    rootHash: string
    headSha: string | null
    trackedFileCount: number
  }
  existingLayout: {
    acceptedDirs: string[]
    proposedDirs: string[]
    contextFiles: string[]
    agentConfigFiles: string[]
  }
  manifests: Array<{
    path: string
    kind: 'package' | 'workspace' | 'build' | 'deploy' | 'ci' | 'infra'
    headingsOrKeys: string[]
  }>
  candidateEvidence: Array<{
    category: 'term' | 'boundary' | 'technology' | 'integration' | 'constraint'
    path: string
    line: number | null
    excerptHash: string
    summary: string
  }>
  warnings: string[]
}
```

Agentが作るinit planは、applyがそのまま検証・実行できる構造化データとする。

```ts
type InitPlan = {
  schemaVersion: 1
  planId: string
  repositoryRootHash: string
  sourceHeadSha: string | null
  createdAt: string
  detectedLayout: 'none' | 'split' | 'single' | 'custom'
  proposedConfig: AdrConfig
  operations: Array<
    | {
        kind: 'create'
        path: string
        content: string
      }
    | {
        kind: 'replace-generated'
        path: string
        expectedCurrentHash: string | null
        content: string
      }
    | {
        kind: 'merge-jsonc'
        path: string
        expectedCurrentHash: string | null
        edits: JsoncEdit[]
      }
  >
  evidenceReferences: Array<{
    operationIndex: number
    sourcePaths: string[]
    rationale: string
  }>
}
```

`init --apply` はplan作成後に変更された対象ファイルだけをhash照合する。無関係なworking tree変更は妨げない。planはdelete、repo外path、symlink経由のrepo外writeを表現できないschemaにする。

## 9. 毎プロンプト処理フロー

### 9.1 before-turn

4ランタイムのbefore-turn hookは毎プロンプトで共通処理を呼ぶ。

```text
Prompt submitted
  │
  ├─ configとmanifestを読み込む
  ├─ prompt本文を保存せずSHA-256とrisk signalだけ計算
  ├─ 現在のGit / ADR / CONTEXT fingerprintを記録
  ├─ prompt語彙と監視対象pathから risk = none | possible | likely を判定
  ├─ accepted/proposed ADRのtitleから関連候補を最大5件選ぶ
  ├─ runtime固有形式へ追加contextを変換
  └─ turn stateを.gitignore対象のstate directoryへ保存
```

risk判定はADR要否の最終判断ではない。hookはSkillを呼ぶべき可能性を絞り、Agentが3条件を意味的に評価する。

### 9.2 risk signal

既定のhigh-signal語には、architecture、boundary、database、storage、migration、auth、permission、API contract、event、queue、provider、deployment、infrastructure、dependency、monorepo、deprecation、delete policy、および英日両方の語を含める。英語語は語境界（alias付き）で評価し、`author` などの部分一致誤検出を避ける。

`adr.config.json` の `riskSignals` で `highSignalTerms`（既定置換）、`additionalTerms`（追記）、`watchPaths`（既定監視pathへの追記）を任意設定できる。

既定の監視pathには次を含める。

- package/workspace manifestとlockfile
- Python / Go / Rust / JVM / Ruby manifest
- DB schemaとmigration
- API/public contract/schema
- auth/permission/policy
- event/queue/workflow
- infra/deploy/CI
- トップレベルのpackageまたはapplication境界設定

riskが `none` の場合は短い常駐通知だけを渡す。`possible` または `likely` の場合は、設定、文書path、関連ADR、3条件、turn終了前の監査指示を渡す。Cursor は before-turn hook が context を返せないため、`.cursor/rules/adr-governance.mdc` が `.adr-governance/state/current-turn/` の elevated risk と `relevantAdrPaths` を読ませる。

### 9.3 Agentの判断

Agentは次の順で処理する。

1. 現在のCONTEXT、関連accepted ADR、関連proposed ADRを読む。
2. 今回の会話で新しい判断が確定したかを特定する。
3. 3条件を一つずつ評価する。
4. 既存ADRと同じ判断なら、必要な説明だけを既存ADRへ追記する。
5. 既存判断の結論が変わるなら、新ADRを作り旧ADRをsupersededにする。
6. 用語の意味が確定または変更された場合はCONTEXTを更新する。
7. ADRを作らない場合は理由コードをturn stateへ記録する。

ADRを作らない理由コードは次に限定する。

- `no-decision`: 判断がまだ行われていない
- `reversible`: 容易に戻せる
- `obvious`: 文脈なしでも意外性がない
- `no-tradeoff`: 現実的な代替案がない
- `implementation-detail`: 通常のコード・テスト・文書で十分
- `already-recorded`: 既存ADRが今回の判断を十分に表す

### 9.4 status決定

```text
判断が未確定、理由不明、Open Pointsあり
  └─ proposed

判断が確定し、3条件を満たす
  ├─ requireHumanAcceptance = false
  │    └─ acceptedを直接作成、またはproposedを昇格可能
  └─ requireHumanAcceptance = true
       ├─ 明示承認なし → proposed
       └─ 明示承認あり → accepted
```

自動acceptedが許可されていても、Agentは判断が確定した根拠を説明できなければproposedを選ぶ。

### 9.5 after-turn監査

after-turn hookは、AgentがADR評価を飛ばした可能性だけを検出する。hook自身が `reversible`、`implementation-detail`、その他のno-ADR理由を生成または記録してはならない。

```text
Agent attempts to finish
  │
  ├─ before-turn fingerprintと現在状態を比較
  ├─ ADR / CONTEXTが更新済み → 完了を許可
  ├─ Agentが明示的receiptを記録済み → 完了を許可
  ├─ actual changeなし かつ risk != likely → 完了を許可
  └─ actual changeあり または risk likely
       ├─ follow-up未実行 → ADR監査を1回だけ自動継続
       └─ 既にfollow-up済み → 完了を許可しwarningを記録
```

fingerprintまたはGit状態を信頼して比較できない場合、interactive hookはfail-openする。after-turn監査は最大1回だけAgentを継続させ、上限到達時は `ADR evaluation unresolved; CI decision gate remains authoritative` と警告する。最終的な許可判断はCIのDecision Authority Gateが担う。

## 10. ランタイムアダプター

| Runtime     | before-turn                                                                        | after-turn                                | Skill接続                                                     |
| ----------- | ---------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Cursor      | `beforeSubmitPrompt`でstate記録。`sessionStart`とalways-apply Ruleで共通指示を注入 | `stop.followup_message`                   | `.agents/skills` + `.cursor/rules`                            |
| Claude Code | `UserPromptSubmit.additionalContext`                                               | `Stop`のcontinuation                      | hookが`.agents/skills`正本を読むよう指示。明示用commandも生成 |
| Codex CLI   | `UserPromptSubmit.additionalContext`                                               | `Stop`の継続decision                      | `.agents/skills`                                              |
| Gemini CLI  | `BeforeAgent.additionalContext`                                                    | `AfterAgent decision: deny`による1回retry | `.agents/skills`                                              |

Cursorの `beforeSubmitPrompt` はpromptを検証またはblockできるが、追加contextを返せない。そのためCursorだけは、`sessionStart` の `additional_context` と `alwaysApply: true` のRuleを常駐指示として使い、`beforeSubmitPrompt` はturn state作成に限定する。

各アダプターはruntimeのJSON入出力を共通型へ正規化し、stdoutにはruntimeが要求するJSON以外を出力しない。診断ログはstderrまたは `.adr-governance/state/logs/` へ出す。

### 10.1 生成するhook entry

Cursorのproject hookはproject rootから動くため、相対pathを使う。

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "node .cursor/hooks/adr-governance.mjs session-start" }],
    "beforeSubmitPrompt": [{ "command": "node .cursor/hooks/adr-governance.mjs before-turn" }],
    "stop": [
      {
        "command": "node .cursor/hooks/adr-governance.mjs after-turn",
        "loop_limit": 1
      }
    ]
  }
}
```

Cursor Ruleは常時適用にするが、本文は正本Skillへのルーティングと短いstanding policyだけにする。

```md
---
description: Keep ADR and CONTEXT records aligned with architectural decisions.
alwaysApply: true
---

ADR governance is active. When the hook reports possible or likely architectural
impact, read `.agents/skills/managing-adrs/SKILL.md` completely and follow it.
```

Claude Codeはproject rootを示す公式環境変数を使う。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/adr-governance.mjs\" before-turn"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/adr-governance.mjs\" after-turn"
          }
        ]
      }
    ]
  }
}
```

Codex CLIはsession cwdがsubdirectoryの場合に備え、POSIX側はGit rootを解決し、Windows側には `commandWindows` を生成する。installerは次の固定templateを使い、ユーザー入力をcommandへ埋め込まない。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$(git rev-parse --show-toplevel)/.codex/hooks/adr-governance.mjs\" before-turn",
            "commandWindows": "powershell.exe -NoProfile -Command \"$r=(git rev-parse --show-toplevel); node \\\"$r/.codex/hooks/adr-governance.mjs\\\" before-turn\"",
            "timeout": 3
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$(git rev-parse --show-toplevel)/.codex/hooks/adr-governance.mjs\" after-turn",
            "commandWindows": "powershell.exe -NoProfile -Command \"$r=(git rev-parse --show-toplevel); node \\\"$r/.codex/hooks/adr-governance.mjs\\\" after-turn\"",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

Gemini CLIはproject root環境変数を使う。

```json
{
  "hooks": {
    "BeforeAgent": [
      {
        "hooks": [
          {
            "name": "adr-governance-before-turn",
            "type": "command",
            "command": "node \"$GEMINI_PROJECT_DIR/.gemini/hooks/adr-governance.mjs\" before-turn",
            "timeout": 3000
          }
        ]
      }
    ],
    "AfterAgent": [
      {
        "hooks": [
          {
            "name": "adr-governance-after-turn",
            "type": "command",
            "command": "node \"$GEMINI_PROJECT_DIR/.gemini/hooks/adr-governance.mjs\" after-turn",
            "timeout": 3000
          }
        ]
      }
    ]
  }
}
```

各runtime shimは自分の実ファイル位置からrepo rootを上方向に探索し、`adr.config.json` と `.adr-governance/manifest.json` の両方が見つかったrootだけを採用する。hook payloadの `cwd` は対象worktreeの特定に使い、session開始元のmain checkoutへ誤って書かない。

## 11. CLI契約

初期導入後は対象プロジェクトに同梱されたCLIを使える。

```bash
node .adr-governance/bin/cli.mjs <command>
```

### 11.1 `init`

```bash
adr-governance init [--repo <path>]
adr-governance init --apply <plan.json> [--repo <path>]
```

- 第1形式はread-only scanとinit plan作成支援を行う。
- 第2形式だけがtracked fileを作成・更新する。
- apply前にplan内の全pathがrepo root配下であることを検証する。
- 既存ファイルの削除は行わない。
- 既存設定との競合はapplyを停止し、差分を表示する。

### 11.2 `sync`

```bash
node .adr-governance/bin/cli.mjs sync --from <release-or-path>
```

- Skill、reference、bundle、runtime shim、manifestの管理対象を更新する。
- ユーザー管理ファイルの未知fieldと既存hookを保持する。`adr.config.json` は現在の内容をそのまま保持し、runtime登録JSONもファイル全体のchecksum管理から除外する。旧manifestのこれらのhashは無視し、managed entryの構造検証とmergeは継続する。
- 管理entryが手編集されていた場合は上書きせずconflictを返す。
- `--force` は設けない。競合は明示的に解消してから再実行する。

### 11.3 `check`

```bash
node .adr-governance/bin/cli.mjs check [--base <git-ref>] [--evidence <json-path> | --github-event <event-path>] [--json]
```

常時検証する項目:

- config schemaとversion
- accepted/proposed両ディレクトリを通した番号一意性
- filename、frontmatter、path、statusの整合
- acceptedにOpen Pointsがないこと
- `superseded_by` / `supersedes` の存在・status・双方向整合
- CONTEXT内の相対リンク
- runtime hook entryの存在
- manifest checksumと生成物drift

`--base` 指定時はbase treeとworking treeを比較し、番号競合、status lifecycle、変更path、changed proposed ADR、base decision corpus hash、DecisionEvidenceを検証する。ADR/CONTEXTおよびbase manifest管理の生成済みガバナンスファイル以外の変更には、accepted ADR参照または明示的no-ADR outcomeのどちらか一つを要求する。設定、runtime登録JSON、実行用bundle・shimの変更は証跡を必要とする。mode、exemptPaths、layout、人間承認metadata要件はimmutable baseの設定を使用し、headの設定・manifest変更で免除を拡張しない。baseに設定がない初回導入はstructural checkと人間のreviewで先に確立する。

`--evidence` はprovider-neutralなJSON file、`--github-event` はGitHub event fileの `pull_request.body` にある単一の fenced `adr-governance` blockを読む。両flagの同時指定はusage errorとし、GitHub APIまたはその他のnetwork callは行わない。

enforce modeではbase ref、証跡、参照ADR、decision corpus、比較処理のいずれかを読めない場合にfail-closedとする。warn modeはchange-gate固有findingと比較取得失敗をwarningへ下げ、従来の構造検証errorはerrorのまま維持する。baseの設定自体が読めない場合はtrusted modeを確定できないため `base-policy-unavailable` errorとする。

主なvalidation codeは `base-policy-unavailable`、`human-acceptance-required`、`base-ref-unavailable`、`decision-evidence-required`、`decision-evidence-invalid`、`decision-evidence-legacy`、`decision-baseline-stale`、`decision-base-stale`、`decision-changeset-stale`、`decision-ref-not-accepted`、`decision-ref-stale`、`changed-proposal-unreviewed`、`invalid-status-transition`、`accepted-without-acceptance`、`proposed-with-acceptance` とする。

#### DecisionEvidence v2

schemaVersion 2 は次のフィールドを持つ。

- `baseCommit`: attest時点のimmutable base commit（40または64文字のlowercase hex）
- `decisionCorpusHash`: base ref上のdecision corpus hash
- `changeSet.algorithm`: 常に `git-change-set-v1`
- `changeSet.digest`: canonical changesetのSHA-256 digest

`git-change-set-v1` は `git merge-base <baseCommit> HEAD` をcomparison baseとし、immutable base tipとHEADのthree-dot差分、index/worktree status、untracked filesの和集合から変更pathを列挙する。rename heuristicは使わず、旧pathのdeleteと新pathのaddとして表現する。Gateの変更分類にも同じentriesを使用する。current contentはGit clean filterと改行変換を通したblob bytesをSHA-256でhashし、modeはGitのfilemode/symlink設定とindexを尊重する。stateディレクトリとgitignore対象fileは含めない。

canonical payloadの1 entryは次のNUL区切り形式とする。

```text
path NUL base-mode NUL base-sha256 NUL current-mode NUL current-sha256 NUL
```

存在しないsideはmode/hashとも `-`。pathはrepository-relative POSIX path、sortはUTF-8 bytes昇順、hash表記は `sha256:` に64文字のlowercase hexを続けたものとする。

schemaVersion 1はv0.2.xでは `decision-evidence-legacy` warningとして受理し、v0.3.0でrejectする。`changedPathsHash`（path集合のみのhash）は棄却案であり実装しない。

exit codeは `0=success`、`1=validation/policy error`、`2=configuration/runtime/usage error` とする。

### 11.4 `create`

```bash
node .adr-governance/bin/cli.mjs create \
  --status proposed|accepted \
  --title "<title>" \
  --body-file <path>
```

- 排他ロックを取得して採番する。
- temp fileへ書いた後、atomic renameする。
- accepted指定時はconfigと本文のOpen Pointsを検証する。
- 既存ADRを直接上書きしない。

### 11.5 `promote`

```bash
node .adr-governance/bin/cli.mjs promote ADR-0007 \
  [--approval automatic|human]
```

- split layoutではfrontmatter更新とディレクトリ移動を一つの操作として行う。
- tracked fileの移動にはGit管理下であることを確認し、`git mv` を使う。
- single layoutではpathを変えずfrontmatterだけ更新する。
- `requireHumanAcceptance: true` の場合、`--approval human` とSkillが確認した明示承認が必要である。
- CLI単体は会話上の人間本人性を証明しない。`check --base` はtrusted設定に従い、新規・変更されたaccepted ADRに `acceptance: human` を要求するが、これは本人認証を意味しない。

### 11.6 `supersede`

```bash
node .adr-governance/bin/cli.mjs supersede ADR-0002 --by ADR-0008
```

- 旧ADRを `status: superseded` にする。
- 新ADRがacceptedであり、旧ADRを参照していることを検証する。
- 片側だけ更新された状態を残さないようtemp fileとrollback情報を使う。

### 11.7 `turn-close`

Hookが提示する実際の `--session-id` を使う。ID未指定または未知のIDで対応するturnが見つからない場合はerrorとし、孤立receiptを生成しない。legacy pointerの読込みは互換のため保持する。

```bash
node .adr-governance/bin/cli.mjs turn-close \
  --outcome docs-updated|no-change \
  --session-id <hookが提示したID> \
  [--reason <reason-code>]
```

- after-turn hook用のuntracked receiptを保存する。
- `no-change` では定義済みreason codeを必須にする。
- receiptにはprompt本文、会話本文、secretを保存しない。

## 12. 内部型と責務境界

```ts
type AdrStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'deprecated'

type Acceptance = 'automatic' | 'human'

type RiskLevel = 'none' | 'possible' | 'likely'

type NoAdrReason =
  | 'no-decision'
  | 'reversible'
  | 'obvious'
  | 'no-tradeoff'
  | 'implementation-detail'
  | 'already-recorded'

type TurnState = {
  schemaVersion: 1
  sessionId: string
  turnId: string
  promptHash: string
  risk: RiskLevel
  signals: string[]
  beforeFingerprint: RepositoryFingerprint
  relevantAdrPaths: string[]
  followUpCount: number
  receipt: TurnReceipt | null
  createdAt: string
}
```

責務は次のように分離する。

- `core`: filesystemやruntime JSONに依存しない判断可能な純粋ロジック
- `analysis`: read-onlyなリポジトリ観測とevidence bundle生成
- `hooks`: turn stateとruntime入出力変換。ADR本文を生成しない
- `cli`: 明示コマンド、atomic file operation、validation
- `installer`: runtime設定の部分mergeと生成物manifest
- `Skill`: 3条件、意味的判断、文書内容、Userとの承認対話

## 13. 設定ファイルの安全なmerge

- JSONとJSONCは `jsonc-parser` のedit APIで対象pathだけを変更し、既存コメントと整形を保持する。
- 各管理hookは一意なcommand pathまたは `name: adr-governance` で識別する。
- 配列全体を置換しない。
- 同一管理entryが複数ある場合は自動削除せずerrorにする。
- `.codex/config.toml` は変更せず、`.codex/hooks.json` を使用する。
- runtimeがproject hookを信頼する必要がある場合、`init --apply` の完了メッセージにtrust確認手順を表示する。
- `manifest.json` は生成ファイル単位のSHA-256、generator version、設定entry識別子を保持する。

## 14. 状態、プライバシー、性能

### 14.1 状態保存

turn stateは `.adr-governance/state/` に保存し、`.adr-governance/.gitignore` で除外する。7日より古いstateはsession start時に削除する。

保存してよい情報:

- session/turn ID
- promptのSHA-256
- risk levelと検出signal名
- file pathとcontent hash
- 関連ADR path
- receiptとreason code
- timestamp

保存してはいけない情報:

- prompt本文
- transcript本文
- source file本文
- environment variable値
- secret、token、credential

### 14.2 fingerprint

fingerprintは監視対象fileの相対path、Git status、content hashから作る。ファイル本文はstateへ保存しない。最大500 fileまでとし、上限超過時は各entryのnormalized path、size、`Math.trunc(mtimeMs)` をhash化するmetadata fallbackへ縮退する。

`collectionMode` は `content` | `metadata` | `unavailable` のいずれかを明示する。untracked file数が501以上、単一fileが1MB超、Git command失敗時は縮退し、`degradationReason` をstderrへ1回だけ警告する。縮退中は「CI decision gateが最終権威である」旨をターン指示へ含める。

### 14.3 性能目標

- before-turn hook: 通常リポジトリでp95 300ms未満
- after-turn hook: p95 500ms未満
- hook timeout: Codex/Geminiの外側timeoutは3秒。runtime shimは既定1500ms、設定可能範囲100〜1900msで直ちにfail-openを出力し、起動・終了処理の余裕を外側予算に確保する。
- hook failure: 通常作業はfail-openしwarningを出す。shimは子プロセスstdoutをbufferし、正常exit時のみ単一JSONを出力する
- `check`: validation errorをfail-closedでCIへ返す

hookは外部network、LLM、package installを実行しない。

## 15. エラー処理

| 状況              | hook                          | CLI                             |
| ----------------- | ----------------------------- | ------------------------------- |
| configなし        | 何も注入せず終了              | `init` を案内                   |
| config不正        | warningしてfail-open          | exit 2                          |
| manifest drift    | 短いwarningを注入             | `sync` を案内しexit 1           |
| Git利用不可       | prompt riskだけ評価           | repository commandはexit 2      |
| state書込失敗     | follow-up監査を無効化して継続 | exit 2                          |
| 採番lock競合      | 該当なし                      | timeout後に再試行案内、書込なし |
| 既存設定merge競合 | 既存hookを維持                | apply/syncを停止                |
| runtime未知schema | stdoutを汚さず無操作          | adapter contract error          |

一部だけ書き換えた状態を残さない。複数ファイル更新は、事前検証、temp file作成、rename、失敗時rollbackの順で行う。Gitのworking treeに既存変更があること自体はerrorにしないが、同一対象ファイルが変更済みなら自動適用を停止する。

## 16. 並行実行

- 同一worktreeでは `.adr-governance/state/locks/` に、owner UUID付きmetadataを入れたdirectoryをatomic renameしてlockを公開する。採番とpromotionを各lock名で直列化し、解放・回収は観測したownerのfileだけを削除する。
- lock directory内のowner fileにはPID、開始時刻、command、owner UUIDを記録する。旧JSON file形式もstale回収対象として読める。
- 生存していないPIDかつ10分を超えたlockだけをstaleとして回収できる。
- 別worktree間ではlockを共有しない。`check --base` で番号重複を検出する。
- 重複解消で再採番できるのは未accepted ADRだけとする。accepted同士が衝突した場合は自動修正せず人間へ返す。

## 17. Skillの発見と誤起動防止

Skill descriptionは、設計判断、architecture decision、ADR、CONTEXT、技術選定、責務境界、永続化・統合方式の変更を具体的triggerとして含める。一方、通常の小規模実装、単純なbug fix、formatting、文言修正だけでは暗黙起動しない境界を明記する。

hookは毎promptで動くが、Skill本文を毎回全量注入しない。risk `none` では短いstanding reminderだけにし、risk `possible|likely` のときにSkillを完全に読むよう指示する。これにより毎prompt監視とcontext効率を両立する。

## 18. テスト戦略

### 18.1 Skill behavior TDD

Skill変更前に、Skillなしまたは現行releaseのエージェントへ同じpressure scenarioを与え、再現可能なRED baselineを記録する。Decision Authority Gateでは次のfixtureを固定する。

- `proposed-with-implementation`: proposedを本番実装authorityにせず、実装前に停止する
- `existing-proposal-as-authority`: 既存proposed参照をaccepted evidenceとして拒否する
- `stale-decision-corpus`: base corpus変更後に再読込・再attestする
- `context-redefinition`: CONTEXTの狭義化だけで未解決判断を確定扱いしない
- `trivial-change`: 新規ADRを作らず、明示的no-ADR evidenceを作る

Cursor、Claude Code、Codex CLI、Gemini CLIの利用可能な4 runtimeで、各fixtureを最低3回実行する。runtime、model、run番号、結果、破られた不変条件、transcript hashだけを保存し、prompt本文やtranscript本文は保存しない。

GREENでは同じmatrixを再実行し、すべてのrunがauthority invariantを満たすまでSkillを最小修正する。単一サンプルの成功をbehavior acceptanceに使わない。

### 18.2 Unit test

- config parsingとdefault
- 3条件の構造化結果
- risk signalとpath分類
- 採番、slug、status/path整合
- accepted直接更新とsupersedeの分岐
- relevant ADR ranking
- fingerprintとreceipt
- runtime output serializer

### 18.3 Integration test

一時Git repositoryをfixtureとして次を検証する。

- 空repoへのinit planとapply
- 既存split layoutの検出
- 既存single layoutの維持
- 既存hooks/settingsを保持したmerge
- syncの冪等性
- 管理entry手編集時のconflict
- create/promote/supersedeのatomicity
- human acceptance true/false
- concurrent create
- `check --base` の番号競合検出

### 18.4 Adapter contract test

公式schemaに基づくJSON fixtureを各runtimeごとに保持する。

- Cursor: `sessionStart`、`beforeSubmitPrompt`、`stop`
- Claude Code: `UserPromptSubmit`、`Stop`
- Codex CLI: `UserPromptSubmit`、`Stop`
- Gemini CLI: `BeforeAgent`、`AfterAgent`

同じ共通入力に対し、各adapterが意味的に同じ追加指示と最大1回のfollow-upを返すことをgolden testで確認する。

### 18.5 Security / privacy test

- prompt本文がstate、log、manifestに現れない
- `.env`、secret、credential patternがscanされない
- repo外pathをinit planへ含められない
- symlink経由のrepo外writeを拒否する
- stdoutが各runtimeのJSON以外で汚染されない
- untrusted hookの確認手順がinstall結果に表示される

## 19. CI契約

DecisionEvidenceの意味契約はCI provider非依存とし、CIは意味的なADR要否を推測しない。形式、参照、freshness、番号競合、status lifecycle、変更proposal申告を検証する。

provider-neutral CIはJSON fileを渡す。

```bash
node .adr-governance/bin/cli.mjs check --base <immutable-base-ref> --evidence <evidence.json>
```

GitHub pull requestではfull historyをcheckoutし、immutableなbase SHAとevent fileを渡す。

```bash
node .adr-governance/bin/cli.mjs check \
  --base "${{ github.event.pull_request.base.sha }}" \
  --github-event "$GITHUB_EVENT_PATH"
```

GitHub adapterは証跡が必要な変更に限りPR本文の単一 fenced `adr-governance` blockを読み、API callは行わない。workflowは `opened, edited, synchronize, reopened` を購読し、immutable baseからbundleをrunner tempへ抽出して実行する。PR headのbundleへfallbackしない。workflow定義とbase選択はrepository protection/reviewの信頼境界に含む。protected branchへのpushでは、PR evidenceを要求しないstructural checkを別に実行する。

`init` は既存CIがGitHub Actionsの場合だけworkflow追加候補とPR templateをplanへ含める。CI providerを検出できない場合はworkflowを生成せず、導入コマンドを結果へ表示する。明示baseを取得できないenforce checkは失敗する。

## 20. 配布と更新

- 単独Git repositoryをrelease単位でversioningする。
- 初回導入はreleaseされたCLIを使い、対象プロジェクトへself-contained bundleをvendorする。
- 対象プロジェクトは `manifest.json` に導入versionを固定する。
- 更新は新versionのCLIによる `sync` で行い、差分をreviewしてcommitする。
- runtime adapterの公式schema変更はadapter contract testとrelease noteで管理する。
- target projectの通常作業中にnetwork経由で最新版へ自動更新しない。

## 21. 受け入れ条件

1. 新規Git repositoryで `init` の解析段階がtracked fileを変更しない。
2. apply後、4ランタイムのproject hookと共通SkillがGit管理可能な形で生成される。
3. 既存のruntime hookとsettingsが保持される。
4. 4ランタイムすべてで毎promptにbefore-turn処理が実行される。
5. actual changeまたはlikely riskがあり、ADR/CONTEXT更新も明示receiptもない場合だけ、after-turn監査が最大1回継続する。
6. hookはno-ADR理由やparent receiptを自動生成しない。
7. `requireHumanAcceptance: false` では、確定済み判断を人間承認なしでacceptedにできる。
8. `requireHumanAcceptance: true` では、Skillが明示承認を得るまでproposedに留める。
9. 未確定、理由不明、Open PointsありのADRは設定にかかわらずacceptedにならない。
10. accepted ADRの同一判断内の説明改善は直接更新できる。
11. accepted ADRの結論変更は新ADRの `supersedes` と旧ADRの `superseded_by` の双方向参照になる。
12. proposed ADRは実装authorityまたはaccepted decision referenceに指定できない。
13. ADR/CONTEXT/manifest管理生成物以外の変更は、accepted ADRまたは明示的no-ADR evidenceを一つ持つ。
14. no-ADR evidenceはvalid reasonと非空rationaleを持つ。
15. base branchのADR/CONTEXT集合または参照accepted ADRの内容変更で既存evidenceが失効する。
16. 同じchange setのchanged proposed ADRは `reviewedProposals: unrelated` がなければ失敗する。
17. base refまたは比較入力を読めないenforce checkは失敗する。
18. 禁止status遷移と不完全なsupersessionは失敗する。
19. docs-only proposalはimplementation evidenceなしで許可される。
20. config v1を読み込み、gate offとmigration warningを返す。
21. new initはconfig v2、enforced gate、full-history exact-base CIを生成する。
22. accepted/proposedを通した番号重複、壊れた参照、生成物driftを `check` が検出する。
23. init解析がsecret候補とrepo外fileを読まない。
24. prompt本文とtranscript本文が永続化されない。
25. RED behavior fixtureがSkillありの4-runtime複数runですべて解消される。

## 22. 公式仕様上の根拠

- Cursorは `.agents/skills/` をproject Skillとして読み込み、`sessionStart` でcontext注入、`stop` でfollow-upを実行できる。一方、`beforeSubmitPrompt` の出力は送信可否に限定される。
  - https://prod.cursor.com/docs/skills
  - https://prod.cursor.com/docs/hooks
- Claude Codeは `UserPromptSubmit` の `additionalContext` とStop継続を利用できる。
  - https://code.claude.com/docs/en/skills
  - https://code.claude.com/docs/en/hooks
- Codex CLIは `.agents/skills/` を読み込み、`UserPromptSubmit` とStop hookでdeveloper context追加と継続を実行できる。
  - https://learn.chatgpt.com/docs/build-skills
  - https://learn.chatgpt.com/docs/hooks
- Gemini CLIは `.agents/skills/` alias、`BeforeAgent.additionalContext`、`AfterAgent` retryを利用できる。
  - https://geminicli.com/docs/cli/skills/
  - https://geminicli.com/docs/hooks/reference/

## 23. 実装境界の確定事項

- 単独repository名は `adr-governance`、Skill名は `managing-adrs` とする。
- Node.js 20以降とGitを実行要件とし、target側configはJSONとする。
- 新規repoはsplit layout、既存repoは検出したlayoutを維持する。
- config v2の新規既定はDecision Authority Gate enforce、config v1は明示移行までgate offとする。
- 自動accepted許可を既定とするが、proposed ADRは本番実装のauthorityにしない。
- initは解析とapplyの二段階とする。
- semantic判断とaccepted/no-ADR outcomeの表明は人間またはAgentが担う。hookはriskを観測できるが判断内容を生成しない。
- provider-neutralな `DecisionEvidence` とpure change-gate policyをcoreに置き、GitHub固有のPR本文処理はadapterへ隔離する。
- evidenceは作成時のimmutable base commit、base decision corpus、exact changeset digestに束縛し、base corpus、base commit、changeset、参照ADRの変更で失効させる。
- after-turnのdocs更新判定はdecision corpus content hashを使い、filesystem mtimeは使わない。
- interactive hookはfail-open、CI `check --base` は検証不能時fail-closedとする。
- targetへ配布するbundleはNode.js 20+とGit以外を要求しない。
- prompt、transcript、source本文、secret、token、credentialをevidenceまたはstateへ保存しない。
- central service、外部LLM API、暗号学的人間承認は導入しない。
- このreleaseではproposed ADRに基づくexperimentのmerge例外を設けない。

本設計内に未決事項はない。実装前後に同じ4-runtime behavior matrixを実行し、観測された失敗に対する最小Skill指示とDecision Authority Gateの機械契約を検証する。

## 24. 実装追補（2026-08-22）

単独リポジトリ [`adr-governance`](https://github.com/guilz-dev/adr-governance) の実装状況は同梱 [`docs/IMPLEMENTATION-STATUS.md`](https://github.com/guilz-dev/adr-governance/blob/main/docs/IMPLEMENTATION-STATUS.md) を正とする。

v0.1.5 時点の主な追補:

- v0.1.2 — `documents.legacyFrontmatter`、init plan hash 照合、hook merge、CONTEXT リンク check、after-turn fingerprint、human promotion audit
- v0.1.3–v0.1.5 — バンドル CLI 修正、`check --json`、`init --apply` / `sync` の package root 検証（`--from`）、hook stdin 転送、promote / check / turn-close 回帰修正

未完了（backlog）: Skill behavior TDD（§18.1）、全 runtime 公式 schema golden（§18.4）、concurrent create 統合テスト（§18.3）。
