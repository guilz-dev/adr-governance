# Decision Authority Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** proposed または古い設計判断を暗黙に本番実装の根拠とすることを防ぎ、すべての非ガバナンス変更に、明示的で最新かつ機械検証可能な判断証跡を要求する。

**Architecture:** provider-neutral な `DecisionEvidence` を core に追加する。hook は判断を要求できるが判断内容を生成せず、`attest` が accepted ADR または明示的 no-ADR 判断から証跡を作り、`check --base` が ADR lifecycle、参照先、decision corpus の鮮度と証跡を検証して CI を fail-closed にする。GitHub Actions は PR 本文の fenced block、その他の CI は JSON file で同じ契約を渡す。

**Tech Stack:** TypeScript 5.7、Node.js 22（実行要件は Node.js 20 以上を維持）、ESM、Vitest 3.2.6、Git CLI、esbuild bundle、JSON Schema draft-07、GitHub Actions。

**Spec:** guilz monorepo の `docs/superpowers/specs/2026-08-22-adr-governance-design.md`。Task 2 で `docs/specs/adr-governance-design.md` へ正本を移し、本計画の Decision Authority Gate Contract で after-turn、check、CI、Skill behavior の各契約を改訂する。

## Global Constraints

- ADR の3条件（hard to reverse、surprising without context、real trade-off）は維持する。
- `proposed` は未確定であり、本番実装の authority にはならない。
- ADR参照または no-ADR reason を表明できるのは人間またはエージェントだけとし、hook は意味判断を捏造しない。
- interactive hook の障害は fail-open、CI `check` の検証不能は fail-closed とする。
- hook/core に外部LLM API、中央サービス、network callを追加しない。
- prompt、transcript、source本文、secret、token、credentialを証跡やstateへ保存しない。
- core は CI provider 非依存とし、GitHub 固有処理は adapter に隔離する。
- config v1 は移行期間中読み込み可能とし、新規 init は config v2 を生成する。
- legacy ADR は未変更なら grandfather し、新規・変更された accepted ADR には厳格な lifecycle rule を適用する。
- target repository へ配布する bundle は Node.js 20+ と Git 以外を要求しない。
- production code は RED → GREEN → refactor、Skill は pressure test の RED を確認してから変更する。
- このリリースでは proposed ADR に基づく experiment の merge 例外を設けない。

---

## Decision Authority Gate Contract

### 不変条件

1. proposed ADR は調査・議論・候補の記録には使えるが `outcome.refs` に指定できない。
2. ADR/CONTEXT/生成済みガバナンスファイル以外の変更は、`accepted-adr` または `no-adr` のどちらか一つを持つ。
3. ADR/CONTEXT を更新しただけでは判断確定や実装許可にならない。
4. hook は risk を観測できるが、`reversible` や `implementation-detail` を自動記録できない。
5. 証跡は作成時に参照した base branch の ADR/CONTEXT 集合にだけ有効である。
6. base branch の decision corpus が変わった場合、実装ファイルに conflict がなくても証跡を失効させる。
7. base ref、証跡、参照ADR、比較処理を読めない場合、enforce mode の `check --base` は失敗する。
8. 同じ change set で変更した proposed ADR は `reviewedProposals` に `unrelated` として明示しない限り失敗する。

### Canonical types

```ts
export type ChangeGateConfig = {
  mode: 'off' | 'warn' | 'enforce'
  exemptPaths: string[]
  requireNoAdrRationale: boolean
}

export type DecisionEvidence = {
  schemaVersion: 1
  decisionCorpusHash: string
  outcome:
    | {
        kind: 'accepted-adr'
        refs: Array<{ id: string; contentHash: string }>
      }
    | {
        kind: 'no-adr'
        reason: NoAdrReason
        rationale: string
      }
  reviewedProposals: Array<{
    id: string
    relation: 'unrelated'
  }>
}
```

`exemptPaths` は repository-relative な完全一致ファイル、または `/` で終わる directory prefix とする。既定値は空配列。ADR、CONTEXT、manifestで管理される生成物は設定ではなく layout/manifest から計算する。

### Evidence transport

```text
adr-governance attest --base <ref> --adr ADR-NNNN [--adr ADR-NNNN] [--reviewed-proposal ADR-NNNN] --format json|github-markdown
adr-governance attest --base <ref> --no-adr <reason> --rationale <text> [--reviewed-proposal ADR-NNNN] --format json|github-markdown
adr-governance check --base <ref> --evidence <json-path>
adr-governance check --base <ref> --github-event <event-path>
```

GitHub Markdown は PR 本文に置く fenced `adr-governance` block とする。GitHub adapter は `$GITHUB_EVENT_PATH` の `pull_request.body` だけを読み、API call は行わない。`--evidence` と `--github-event` の同時指定は usage error とする。

### Validation codes

| Code | enforce時 | 条件 |
|---|---:|---|
| `base-ref-unavailable` | error | 指定baseを読めない |
| `decision-evidence-required` | error | 非ガバナンス変更に証跡がない |
| `decision-evidence-invalid` | error | schema不正 |
| `decision-baseline-stale` | error | base decision corpus hash不一致 |
| `decision-ref-not-accepted` | error | 参照ADRが不存在または非accepted |
| `decision-ref-stale` | error | 参照ADRのcontent hash不一致 |
| `changed-proposal-unreviewed` | error | changed proposed ADRの関係未申告 |
| `invalid-status-transition` | error | lifecycleの禁止遷移 |
| `accepted-without-acceptance` | error | 新規/newly acceptedに受理方法がない |
| `proposed-with-acceptance` | error | proposedに受理済みmetadataがある |

`warn` mode では change-gate 固有errorだけをwarningへ変換し、従来の構造検証errorはerrorのままにする。

## File Map

### Create

- `.nvmrc` — local/CI と同じ Node.js 22 を選択する。
- `docs/specs/adr-governance-design.md` — adr-governance 内の設計正本。
- `docs/adr/0001-decision-authority-gate.md` — self-hostingする accepted ADR。
- `docs/proposed-adr/README.md`、`adr.config.json` — self-governance の layout/config。
- `src/core/decision-evidence.ts` — evidence parser/serializer。
- `src/core/decision-corpus.ts` — Git ref/working tree の decision corpus hash。
- `src/core/change-gate.ts` — provider-neutral な純粋policy評価。
- `src/core/adr-transitions.ts` — base/head lifecycle検証。
- `src/cli/git-diff.ts` — changed path、ref file、base ADR取得。
- `src/cli/commands/attest.ts` — evidence生成。
- `src/cli/github-evidence.ts` — PR本文adapter。
- `tests/unit/{decision-evidence,decision-corpus,change-gate,adr-transitions,github-evidence}.test.ts`。
- `tests/integration/{decision-gate,attest-cli}.test.ts`。
- `tests/behavior/fixtures/*.md`、`tests/behavior/README.md`。
- `docs/behavior-baseline/2026-09-03-decision-authority-{red,green}.md`。
- `templates/github/pull_request_template.md`。

### Modify

- `src/core/types.ts`、`config.ts`、`lifecycle.ts`、`validation.ts`、`repository-state.ts`。
- `src/cli/main.ts`、`commands/check.ts`、`commands/supersede.ts`。
- `src/hooks/before-turn.ts`、`common.ts`、`after-turn.ts`。
- `skill/managing-adrs/SKILL.md`、`references/decision-policy.md`。
- `templates/schema/adr-config.schema.json`。
- `src/analysis/init-hints.ts`、`src/installer/init-plan-builder.ts`、`generated-files.ts`。
- 関連unit/integration/adapter tests。
- `README.md`、`CONTRIBUTING.md`、`CHANGELOG.md`、`docs/IMPLEMENTATION-STATUS.md`、`.github/workflows/ci.yml`、`package.json`。

## Task 1: Pin Runtime and Capture Behavior RED

**Files:**
- Create: `.nvmrc`
- Create: `tests/behavior/README.md`
- Create: `tests/behavior/fixtures/{proposed-with-implementation,existing-proposal-as-authority,stale-decision-corpus,context-redefinition,trivial-change}.md`
- Create: `docs/behavior-baseline/2026-09-03-decision-authority-red.md`

**Interfaces:**
- Consumes: current v0.1.11 Skill/hook/CLI。
- Produces: 後続実装が解消すべき再現可能なbaseline failure。

- [ ] **Step 1: Pin Node**

`.nvmrc` を次の1行で作る。

```text
22
```

- [ ] **Step 2: Define pressure fixtures**

各fixtureに `Context`、`Accepted ADRs`、`Proposed ADRs`、`User request`、`Required invariants` を記載し、required outcomeを次に固定する。

```yaml
proposed-with-implementation: stop-before-production-implementation
existing-proposal-as-authority: reject-proposed-reference
stale-decision-corpus: re-read-and-reattest
context-redefinition: require-accepted-decision
trivial-change: explicit-no-adr-without-new-adr
```

- [ ] **Step 3: Run current behavior**

利用可能な4 runtimeで各fixtureを最低3回実行し、runtime、model、run番号、結果、破られた不変条件、transcript hashだけをRED文書に保存する。少なくとも「likely riskを判断なしにreversibleとして閉じる」をfailureとして固定する。

- [ ] **Step 4: Verify existing suite**

```bash
nvm use
pnpm test
```

Expected: 既存suiteはPASS、behavior baselineは最低1つFAILを示す。

- [ ] **Step 5: Commit**

```bash
git add .nvmrc tests/behavior docs/behavior-baseline
git commit -m "test: capture decision authority baseline failures"
```

## Task 2: Self-host the Decision and Localize the Spec

**Files:**
- Create: `docs/specs/adr-governance-design.md`
- Create: `docs/adr/0001-decision-authority-gate.md`
- Create: `docs/proposed-adr/README.md`
- Create: `adr.config.json`
- Modify: `docs/DESIGN-SOURCE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 本計画のcontractと既存外部spec。
- Produces: 後続コード変更をauthorizeするlocal spec/accepted ADR。

- [ ] **Step 1: Move the design source of truth**

外部specを全文コピーし、§9.5、§11.3、§18.1、§19、§21、§23を本contractで改訂する。`docs/DESIGN-SOURCE.md` とREADMEはlocal specを正本、guilz側をlegacy pointerとする。

- [ ] **Step 2: Write ADR-0001**

frontmatterは次を使用する。

```yaml
---
status: accepted
date: 2026-09-03
acceptance: human
---
```

本文に non-authoritative proposals、explicit change evidence、decision-corpus invalidation、fail-closed CIを記録し、`Skill-only reminders`、`Diff heuristics without evidence`、`Provider-specific PR checks` を不採用案として比較する。

- [ ] **Step 3: Add bootstrap self-hosting config**

config v2、split layout、`requireHumanAcceptance: true`、`hooks.enabled: false`、`changeGate.mode: warn`、`exemptPaths: []`、`requireNoAdrRationale: true` とする。

- [ ] **Step 4: Check source-of-truth consistency**

```bash
rg -n "authoritative|source of truth|Design spec" README.md docs
```

Expected: authoritative referenceはすべて `docs/specs/adr-governance-design.md` を指す。

- [ ] **Step 5: Commit**

```bash
git add adr.config.json README.md docs
git commit -m "docs: adopt decision authority gate design"
```

## Task 3: Add Config v2 and DecisionEvidence

**Files:**
- Create: `src/core/decision-evidence.ts`
- Create: `tests/unit/decision-evidence.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/config.ts`
- Modify: `templates/schema/adr-config.schema.json`
- Modify: `tests/unit/core.test.ts`

**Interfaces:**
- Produces: `DecisionEvidence`、`ChangeGateConfig`、`parseDecisionEvidence(raw)`、`serializeDecisionEvidence(evidence)`、config v1 compatibility。

- [ ] **Step 1: Write failing tests**

```ts
expect(defaultConfig().version).toBe(2)
expect(defaultConfig().changeGate.mode).toBe('enforce')
expect(parseConfig({ version: 1 }).config.changeGate.mode).toBe('off')
expect(() => parseDecisionEvidence({
  schemaVersion: 1,
  decisionCorpusHash: 'sha256:abc',
  outcome: { kind: 'accepted-adr', refs: [] },
  reviewedProposals: [],
})).toThrow(/at least one accepted ADR/i)
```

no-ADRの空rationale、重複ADR、未知schema、invalid hash/reason/relationもrejectするtestを加える。

- [ ] **Step 2: Verify RED**

```bash
pnpm build
pnpm exec vitest run tests/unit/core.test.ts tests/unit/decision-evidence.test.ts
```

Expected: version 2 type/parser未実装でFAIL。

- [ ] **Step 3: Implement types, parser, config compatibility**

`SUPPORTED_CONFIG_VERSION = 2` と `SUPPORTED_CONFIG_VERSIONS = [1, 2]` を追加する。v1は全設定を保持してgate offとmigration warning、v2/defaultはgate enforceとする。未知nested keyもwarningにする。

- [ ] **Step 4: Update JSON schema**

version 1/2を`oneOf`で表し、v2では`changeGate`をrequiredにする。

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm lint
pnpm exec vitest run tests/unit/core.test.ts tests/unit/decision-evidence.test.ts
git add src/core templates/schema tests/unit/core.test.ts tests/unit/decision-evidence.test.ts
git commit -m "feat: define decision evidence and config v2"
```

Expected: PASS。

## Task 4: Build Decision Corpus and Git Diff Inputs

**Files:**
- Create: `src/core/decision-corpus.ts`
- Create: `src/cli/git-diff.ts`
- Create: `tests/unit/decision-corpus.test.ts`
- Modify: `src/core/repository-state.ts`

**Interfaces:**

```ts
export type DecisionCorpusEntry = { path: string; contentHash: string }
export function governancePaths(config: AdrConfig): string[]
export async function buildWorkingDecisionCorpus(repoRoot: string, config: AdrConfig): Promise<DecisionCorpusEntry[]>
export async function buildRefDecisionCorpus(repoRoot: string, ref: string, config: AdrConfig): Promise<DecisionCorpusEntry[]>
export function hashDecisionCorpus(entries: DecisionCorpusEntry[]): string
export async function listChangedPaths(repoRoot: string, baseRef: string): Promise<string[]>
export async function readFileAtRef(repoRoot: string, ref: string, relativePath: string): Promise<string | null>
```

- [ ] **Step 1: Write failing deterministic tests**

```ts
expect(hashDecisionCorpus([b, a])).toBe(hashDecisionCorpus([a, b]))
expect(hashDecisionCorpus([a])).not.toBe(
  hashDecisionCorpus([{ ...a, contentHash: 'sha256:changed' }]),
)
```

ADR/CONTEXTだけを含むこと、sourceを除外すること、unreadable refが`BaseRefUnavailableError`になることもtestする。

- [ ] **Step 2: Verify RED**

```bash
pnpm exec vitest run tests/unit/decision-corpus.test.ts
```

Expected: module不存在でFAIL。

- [ ] **Step 3: Implement safe Git access and hashes**

`execFile('git', args, {cwd})`だけを使用する。changed pathsは`base...HEAD`、staged、tracked working tree、untrackedのsorted unique union。corpusはpath順で `path + NUL + contentHash + LF` をSHA-256化する。

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm lint
pnpm exec vitest run tests/unit/decision-corpus.test.ts
git add src/core/decision-corpus.ts src/core/repository-state.ts src/cli/git-diff.ts tests/unit/decision-corpus.test.ts
git commit -m "feat: fingerprint the decision corpus"
```

Expected: PASS。

## Task 5: Enforce ADR Lifecycle Transitions

**Files:**
- Create: `src/core/adr-transitions.ts`
- Create: `tests/unit/adr-transitions.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/lifecycle.ts`
- Modify: `src/core/validation.ts`
- Modify: `src/cli/commands/supersede.ts`

**Interfaces:**

```ts
export function validateAdrTransitions(base: ParsedAdr[], head: ParsedAdr[]): ValidationIssue[]
export function validateAuthorityMetadata(adr: ParsedAdr, isNewOrChanged: boolean): ValidationIssue[]
```

- [ ] **Step 1: Write transition matrix tests**

```text
proposed -> proposed | accepted | rejected
accepted -> accepted | superseded | deprecated
rejected -> rejected
superseded -> superseded
deprecated -> deprecated
```

accepted→proposed/rejected、superseded→accepted、proposed+acceptance、新規accepted without acceptance、missing/non-accepted/non-reciprocal supersessionをerrorにする。

- [ ] **Step 2: Verify RED**

```bash
pnpm exec vitest run tests/unit/adr-transitions.test.ts tests/unit/core.test.ts
```

Expected: transition validatorと`supersedes`未実装でFAIL。

- [ ] **Step 3: Implement reciprocal supersession**

`AdrFrontmatter`へ`supersedes?: string[]`を追加し、互換的な `supersedes: ADR-0002, ADR-0005` をparse/serializeする。`runSupersede`は新ADR側と旧ADR側を同一検証操作で更新し、片側失敗時は両方を元に戻す。

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm lint
pnpm exec vitest run tests/unit/adr-transitions.test.ts tests/unit/core.test.ts tests/unit/fixes.test.ts
git add src/core src/cli/commands/supersede.ts tests/unit
git commit -m "feat: validate ADR authority transitions"
```

Expected: PASS。

## Task 6: Implement the Pure Change Gate

**Files:**
- Create: `src/core/change-gate.ts`
- Create: `tests/unit/change-gate.test.ts`

**Interfaces:**

```ts
export type ChangeGateInput = {
  config: AdrConfig
  changedPaths: string[]
  governancePaths: string[]
  changedProposedAdrs: ParsedAdr[]
  currentAdrs: ParsedAdr[]
  expectedDecisionCorpusHash: string
  evidence: DecisionEvidence | null
}
export function evaluateChangeGate(input: ChangeGateInput): ValidationIssue[]
```

- [ ] **Step 1: Write failing policy tests**

次の各行をtestする。

```text
docs-only + no evidence = pass
code + no evidence = decision-evidence-required
code + accepted/current evidence = pass
code + proposed or missing ref = decision-ref-not-accepted
code + stale ref = decision-ref-stale
code + stale corpus = decision-baseline-stale
code + valid no-ADR/rationale = pass
code + changed unreviewed proposal = changed-proposal-unreviewed
code + changed proposal marked unrelated = pass
```

同じfailureをwarn modeでwarningに変えるtestも加える。

- [ ] **Step 2: Verify RED**

```bash
pnpm exec vitest run tests/unit/change-gate.test.ts
```

Expected: evaluator不存在でFAIL。

- [ ] **Step 3: Implement policy**

path separatorを`/`へ正規化し、governance artifactと明示exemptionだけを除外する。ADR idをcanonical lookupし、accepted status、content hash、corpus hash、changed proposal declarationを検証する。absenceやrisk/path名からno-ADRを推論しない。

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm lint
pnpm exec vitest run tests/unit/change-gate.test.ts
git add src/core/change-gate.ts tests/unit/change-gate.test.ts
git commit -m "feat: enforce decision authority for code changes"
```

Expected: PASS。

## Task 7: Add `attest` and Evidence Adapters

**Files:**
- Create: `src/cli/commands/attest.ts`
- Create: `src/cli/github-evidence.ts`
- Create: `tests/unit/github-evidence.test.ts`
- Create: `tests/integration/attest-cli.test.ts`
- Modify: `src/cli/main.ts`

**Interfaces:**

```ts
export async function runAttest(options: {
  repoRoot: string
  config: AdrConfig
  baseRef: string
  adrIds: string[]
  noAdrReason?: NoAdrReason
  rationale?: string
  reviewedProposalIds: string[]
}): Promise<DecisionEvidence>
export function parseGitHubEventEvidence(raw: unknown): DecisionEvidence | null
export function toGitHubMarkdown(evidence: DecisionEvidence): string
```

- [ ] **Step 1: Write failing CLI/adapter tests**

proposed/missing ADR拒否、accepted ref hash、no-ADR rationale必須、outcome flag競合、JSON round-trip、PR block 0/1/複数件をtestする。

- [ ] **Step 2: Verify RED**

```bash
pnpm build
pnpm exec vitest run tests/unit/github-evidence.test.ts tests/integration/attest-cli.test.ts
```

Expected: command/adapter不存在でFAIL。

- [ ] **Step 3: Implement deterministic output**

repeatable `--adr`/`--reviewed-proposal`用に`getArgs(name): string[]`を追加する。accepted refだけを読み、current content hashとbase corpus hashを計算し、id順でJSONを出す。

GitHub blockは次の形式を1件だけ許可する。

````markdown
```adr-governance
{"schemaVersion":1,"decisionCorpusHash":"sha256:...","outcome":{},"reviewedProposals":[]}
```
````

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm lint
pnpm build
pnpm exec vitest run tests/unit/github-evidence.test.ts tests/integration/attest-cli.test.ts
git add src/cli tests/unit/github-evidence.test.ts tests/integration/attest-cli.test.ts
git commit -m "feat: create portable decision attestations"
```

Expected: source CLIとbundle CLIの両方がPASS。

## Task 8: Integrate the Gate into `check --base`

**Files:**
- Create: `tests/integration/decision-gate.test.ts`
- Modify: `src/cli/commands/check.ts`
- Modify: `src/cli/main.ts`
- Modify: `tests/unit/fixes.test.ts`

**Interfaces:**

```ts
export type CheckOptions = {
  baseRef?: string
  evidencePath?: string
  githubEventPath?: string
}
export async function runCheck(repoRoot: string, options?: CheckOptions): Promise<CheckResult>
```

- [ ] **Step 1: Write incident-class integration tests**

temporary Git repoで次を検証する。

```text
proposed ADR + code + no evidence = fail
existing proposed referenced = fail
new accepted + valid evidence = pass
valid no-ADR + code = pass
base ADR/CONTEXT changed after attestation = stale fail
proposed-only docs = pass
CONTEXT + code = evidence required
missing base = fail
config v1 = migration warning/advisory behavior
warn mode = finding without exit 1
```

- [ ] **Step 2: Verify RED**

```bash
pnpm exec vitest run tests/integration/decision-gate.test.ts tests/unit/fixes.test.ts
```

Expected: `runCheck`がauthority validation未実装でFAIL。

- [ ] **Step 3: Orchestrate base comparison**

`CheckOptions`へ移行し、base tree ADR parse、transition validation、changed paths/proposed discovery、expected base corpus hash、evidence load、pure gate evaluationを順に行う。明示baseを読めない場合はwarningではなくerror。CLI flag競合はexit 2、policy failureはexit 1。

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm lint
pnpm exec vitest run tests/integration/decision-gate.test.ts tests/unit/fixes.test.ts
git add src/cli tests/integration/decision-gate.test.ts tests/unit/fixes.test.ts
git commit -m "feat: fail CI on unresolved decision authority"
```

Expected: PASS。

## Task 9: Remove Synthetic Hook Decisions

**Files:**
- Modify: `src/hooks/common.ts`
- Modify: `src/hooks/after-turn.ts`
- Modify: `src/hooks/before-turn.ts`
- Modify: `src/core/types.ts`
- Modify: `tests/unit/follow-up-loop.test.ts`
- Modify: `tests/unit/session-isolation.test.ts`
- Modify: `tests/unit/adapter-contract.test.ts`

**Interfaces:**
- Consumes: risk、actual changed paths、explicit receipt、follow-up count。
- Produces: 最大1回監査を要求するがsemantic receiptを生成しないafter-turn decision。

- [ ] **Step 1: Write no-fabrication tests**

```ts
const decision = decideAfterTurn(baseTurnState({ risk: 'likely' }), false, config, 0)
expect(decision.allowFinish).toBe(false)
expect(decision.followUpMessage).toContain('ADR audit')
expect(decision).not.toHaveProperty('silentCloseReason')
```

possible+non-governance changeは1回follow-up、none+no changeはreceiptなしfinish、上限到達はwarningのみでparent/child receiptなし、とする。

- [ ] **Step 2: Verify RED**

```bash
pnpm exec vitest run tests/unit/follow-up-loop.test.ts tests/unit/session-isolation.test.ts tests/unit/adapter-contract.test.ts
```

Expected: v0.1.11のsynthetic reasonによりFAIL。

- [ ] **Step 3: Remove semantic writes from hooks**

`silentCloseReason`、`parentSilentCloseReason` とhook内のreceipt生成を削除する。`runAfterTurn`はreasonを構築しない。実変更またはlikely riskで1回follow-upし、上限時は `ADR evaluation unresolved; CI decision gate remains authoritative` warningと`receipt: null`を残す。

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm lint
pnpm exec vitest run tests/unit/follow-up-loop.test.ts tests/unit/session-isolation.test.ts tests/unit/adapter-contract.test.ts tests/unit/runtime-payload-contract.test.ts
git add src/hooks src/core/types.ts tests/unit
git commit -m "fix: prevent hooks from inventing ADR judgments"
```

Expected: 4 runtime adapterで同義のbounded auditがPASS。

## Task 10: Strengthen the Skill and Prove Behavior GREEN

**Files:**
- Modify: `skill/managing-adrs/SKILL.md`
- Modify: `skill/managing-adrs/references/decision-policy.md`
- Modify: `tests/behavior/README.md`
- Create: `docs/behavior-baseline/2026-09-03-decision-authority-green.md`

**Interfaces:**
- Consumes: Task 1 RED fixturesと完成したCLI contract。
- Produces: 4 runtimeでauthority invariantを守る最小Skill指示と反復結果。

- [ ] **Step 1: Add the authority rule**

Skill冒頭近くに同義の指示を追加する。

```text
A proposed ADR is not implementation authority. Before changing non-governance files, either reference an accepted ADR that authorizes the decision or explicitly determine that no ADR is required. If requested implementation depends on a proposed ADR, stop and resolve or promote the decision first. Never narrow CONTEXT wording to make an unresolved decision appear accepted.
```

- [ ] **Step 2: Add stale-baseline handling**

`decision-baseline-stale`時はchanged ADR/CONTEXTを読み直し、`attest --base`を再実行し、実装がなお有効か報告させる。prose記述やproposed更新だけではgateを満たさないと明記する。

- [ ] **Step 3: Run behavior GREEN**

Task 1と同じruntime/model/run matrixで各fixtureを最低3回実行する。全runが全invariantを満たすまでSkillを最小修正する。結果とfixture revision、transcript hashをGREEN文書へ保存する。

- [ ] **Step 4: Verify and commit**

```bash
pnpm lint
pnpm test
git add skill/managing-adrs tests/behavior docs/behavior-baseline/2026-09-03-decision-authority-green.md
git commit -m "feat: teach agents decision authority rules"
```

Expected: 全suiteとbehavior matrixがPASS。

## Task 11: Install a Fail-Closed GitHub Gate

**Files:**
- Create: `templates/github/pull_request_template.md`
- Modify: `src/analysis/init-hints.ts`
- Modify: `src/installer/init-plan-builder.ts`
- Modify: `src/installer/generated-files.ts`
- Modify: `tests/unit/init-evidence-plan.test.ts`
- Modify: `tests/integration/init-apply.test.ts`

**Interfaces:**
- Consumes: bundled `check --base --github-event`。
- Produces: exact-base/full-history workflow、証跡用PR template、manifest coverage。

- [ ] **Step 1: Write failing installer assertions**

生成workflowが次を含むことをassertする。

```yaml
permissions:
  contents: read
  pull-requests: read
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - run: node .adr-governance/bin/cli.mjs check --base "${{ github.event.pull_request.base.sha }}" --github-event "$GITHUB_EVENT_PATH"
```

既存PR templateを上書きしないtestも加える。

- [ ] **Step 2: Verify RED**

```bash
pnpm exec vitest run tests/unit/init-evidence-plan.test.ts tests/integration/init-apply.test.ts
```

Expected: current workflowがshallowかつ`origin/main`固定のためFAIL。

- [ ] **Step 3: Implement workflow/template/manifest**

PRではimmutable base SHAとevent evidenceを使う。protected branch pushではchange evidenceなしのstructural checkを別実行する。PR templateは `attest --format github-markdown` の出力を1件貼るよう案内し、validに見える空JSONは埋め込まない。generator versionは実装中`0.2.0-dev`とする。

- [ ] **Step 4: Verify GREEN and commit**

```bash
pnpm lint
pnpm exec vitest run tests/unit/init-evidence-plan.test.ts tests/integration/init-apply.test.ts
git add src/analysis src/installer templates/github tests/unit/init-evidence-plan.test.ts tests/integration/init-apply.test.ts
git commit -m "feat: install the decision authority CI gate"
```

Expected: PASS。

## Task 12: Dogfood, Migrate, Document, and Release v0.2.0

**Files:**
- Modify: `adr.config.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `src/installer/generated-files.ts`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/IMPLEMENTATION-STATUS.md`
- Modify: `docs/specs/adr-governance-design.md`

**Interfaces:**
- Consumes: 全previous tasks。
- Produces: self-enforced、documented、releasable v0.2.0。

- [ ] **Step 1: Attest this implementation**

```bash
pnpm build
node dist/cli/main.js attest --base origin/main --adr ADR-0001 --format json > /tmp/adr-governance-v020-evidence.json
node dist/cli/main.js check --base origin/main --evidence /tmp/adr-governance-v020-evidence.json
```

Expected: bootstrap warn modeでstale/reference findingなし。

- [ ] **Step 2: Enable self-enforcement**

`changeGate.mode`を`enforce`へ変え、CIをfull history/exact PR base SHAへ更新し、同じcheckを再実行する。

Expected: enforce modeでPASS。

- [ ] **Step 3: Document migration and release**

README/CONTRIBUTINGに`sync`、accepted/no-ADR `attest`、local `check`を具体例付きで記載する。config v1は明示移行までadvisory、新規initはv2 enforceと説明する。package/generator versionを`0.2.0`にし、CHANGELOGへconfig schema、strict CI、synthetic receipt廃止、proposed非authority、migrationを記録する。

- [ ] **Step 4: Run full verification**

```bash
pnpm lint
pnpm test
git diff --check
node dist/bundle/cli.mjs check --repo . --base origin/main --evidence /tmp/adr-governance-v020-evidence.json
```

Expected: 全command exit 0、skipなし、base/evidence検証を迂回したwarningなし。

- [ ] **Step 5: Smoke-test the installed bundle**

temporary Git repoへbundleでinit/applyし、config v2/schema/workflow/Skillを確認する。accepted attestationとno-ADR attestationはpass、proposed referenceはfailさせる。

- [ ] **Step 6: Commit release**

```bash
git add adr.config.json .github/workflows/ci.yml package.json src/installer/generated-files.ts README.md CONTRIBUTING.md CHANGELOG.md docs
git commit -m "release: adr-governance v0.2.0"
```

## Acceptance Criteria

- [ ] proposed ADRと非ガバナンス変更は、promotionまたは明示的unrelated申告なしにenforced CIを通らない。
- [ ] proposed ADRはaccepted decision referenceに指定できない。
- [ ] proposed ADR/CONTEXT更新だけではimplementation auditが閉じない。
- [ ] hookは`NoAdrReason`やparent receiptを自動生成しない。
- [ ] すべての非ガバナンス変更にaccepted ADRまたは明示no-ADR evidenceがある。
- [ ] no-ADR evidenceにvalid reasonと非空rationaleがある。
- [ ] base branchのADR/CONTEXT変更で既存evidenceが失効する。
- [ ] 参照accepted ADRのcontent変更で既存evidenceが失効する。
- [ ] base refを取得できないenforced checkは失敗する。
- [ ] 禁止status遷移と不完全なsupersessionは失敗する。
- [ ] docs-only proposalはimplementation evidenceなしで許可される。
- [ ] config v1を読み込み、明確なmigration warningを返す。
- [ ] new initはconfig v2/enforced gate/full-history exact-base CIを生成する。
- [ ] 4 runtimeのbehavior fixturesが複数回すべてpassする。
- [ ] adr-governance自身がv0.2.0 release前にenforce modeでgateを通す。

## Rollback Strategy

正当な作業を過剰blockする場合は `changeGate.mode` だけを `enforce` から `warn` へ変更する。synthetic receiptとproposed referenceは復活させない。rollback releaseもconfig v2、evidence生成、lifecycle testを保持する。

## Execution Checkpoints

- Checkpoint A — Task 2後: self-hosted ADR/local specを人間reviewする。
- Checkpoint B — Task 6後: CLI/hookから独立したpure authority modelをreviewする。
- Checkpoint C — Task 9後: loop対策がsynthetic receiptを再導入していないことをreviewする。
- Checkpoint D — Task 11後: temporary repoの生成workflow/PR templateを目視確認する。
- Checkpoint E — release前: ADR-0001、本計画、RED/GREEN behavior evidence、Acceptance Criteriaを突合する。
