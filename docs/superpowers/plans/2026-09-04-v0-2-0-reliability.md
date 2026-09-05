# ADR Governance v0.2.0 Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DecisionEvidenceを特定のbaseとexact changesetへ束縛し、hookの検出不能を可視化し、正しい生成CIとself-hostingによってv0.2.0を信頼性確立リリースとして出せる状態にする。

**Architecture:** provider-neutral coreにcanonical changeset builderとDecisionEvidence v2を置き、`attest` と `check --base` が同じdigest計算を共有する。turn auditはmtimeではなくdecision corpus snapshotを比較し、repository fingerprintはcontent / metadata / unavailableの収集modeを明示する。runtime shim、生成CI、self-hosting CIはcoreの失敗をfail-open / fail-closed契約どおりに表面化する。

**Tech Stack:** TypeScript 5.7、Node.js 20 / 22、ESM、Vitest 3.2.6、Git CLI、esbuild bundle、JSON Schema draft-07、GitHub Actions。

**Spec:** `docs/improvement-proposals-2026-09-04.md`。特に §0.1、§2.1〜2.3、§5.1、§5.4、§6.1、§6.3、§8 の v0.2.0 行を実装する。

## Global Constraints

- 機械が保証するのは形式、参照、freshness、変更内容との対応であり、ADRやrationaleの意味的妥当性ではない。
- proposed ADRは本番実装のauthorityにしない。
- `attest` と `check --base` は同一のcanonical changeset関数を使い、provider固有処理をcoreへ入れない。
- interactive hookはfail-open、CIのenforce checkは検証不能時にfail-closedとする。
- prompt、transcript、source本文、environment variable値、secret、token、credential、rationale本文をstate/logへ保存しない。
- hookは外部network、LLM、package installを実行しない。
- target repositoryへ配布するbundleはNode.js 20以上とGit以外を要求しない。
- config v1は読み込み可能なまま維持し、新規config v2から死に設定`requireNoAdrRationale`を除去する。
- DecisionEvidence v1はv0.2.xではlegacy warningとして受理し、v0.3.0でrejectする。v0.2.0で先行rejectしない。
- changesetのrenameはheuristic判定せず、旧pathのdeleteと新pathのaddとしてcanonicalizeする。
- stateとgitignore対象fileはchangesetへ含めない。ローカルattestはstaged / unstaged / untrackedを含む現在snapshotを対象にする。
- production codeはRED → GREEN → refactorの順で変更し、各タスク終了時に対象テストと`pnpm lint`を実行する。
- 本計画はv0.2.0までを対象とする。bot例外、npx、init候補分離、telemetry、SARIF、Cursor spike、report、Windows CIは後続計画へ残す。

---

## File Map

### Create

- `docs/adr/0002-bind-evidence-to-exact-changeset.md` — exact changeset束縛のaccepted decision。
- `src/core/change-set.ts` — snapshot entryのcanonical化とSHA-256 digest。
- `tests/unit/change-set.test.ts` — add / modify / delete / rename / mode / orderingのpure unit test。
- `tests/integration/decision-evidence-v2.test.ts` — attest後変更とbase差し替えのend-to-end test。
- `tests/unit/hook-shim-timeout.test.ts` — 4 runtimeのhang / error / single-JSON contract test。
- `tests/integration/security-privacy.test.ts` — state/log/scan/path traversal/symlinkのprivacy test。
- `templates/shared/hook-shim-runner.mjs` — timeoutとsingle-outputを共有する配布runner。
- `.github/workflows/adr-governance.yml` — 自リポジトリのPR decision gate。

### Modify

- `docs/specs/adr-governance-design.md` — evidence v2、corpus snapshot、degradation、watchdog、CI契約。
- `docs/adr/0001-decision-authority-gate.md` — ADR-0002との関係とv2 consequence。
- `docs/improvement-proposals-2026-09-04.md` — 実装結果とrelease evidenceの追記。
- `src/core/types.ts` — evidence / turn state / fingerprintのversioned types。
- `src/core/decision-evidence.ts` — v1/v2 parser、serializer、legacy判定。
- `src/core/change-gate.ts` — base / changeset freshness検証。
- `src/core/decision-corpus.ts` — working corpus snapshot型。
- `src/core/fingerprint-build.ts`、`src/core/fingerprint.ts`、`src/core/fingerprint-normalize.ts` — collection modeとmetadata fallback。
- `src/core/config.ts`、`templates/schema/adr-config.schema.json`、`adr.config.json` — timeoutと死に設定整理。
- `src/cli/git-diff.ts` — binary-safe base/current snapshot材料。
- `src/cli/commands/attest.ts`、`src/cli/commands/check.ts` — evidence v2生成・検証。
- `src/hooks/before-turn.ts`、`src/hooks/after-turn.ts`、`src/hooks/common.ts`、`src/hooks/hook-main.ts` — corpus snapshotとdegradation warning。
- `templates/{cursor,claude,codex,gemini}/hooks/adr-governance.mjs` — shared runner呼び出し。
- `src/installer/init-plan-builder.ts`、`src/installer/generated-files.ts` — shared runner配布とmanifest管理。
- `src/analysis/init-hints.ts` — immutable base + GitHub eventを使う生成workflow。
- `.github/workflows/ci.yml` — Node 20 / 22 matrix。
- `tests/unit/{decision-evidence,change-gate,decision-corpus,follow-up-loop,fixes,init-evidence-plan}.test.ts` —既存contract更新。
- `tests/integration/decision-gate-classification.test.ts` — evidence v2と生成CI回帰。
- `README.md`、`CHANGELOG.md`、`docs/IMPLEMENTATION-STATUS.md` — v0.2.0契約と移行案内。

---

### Task 1: Record the v0.2.0 Authority Decision

**Files:**

- Create: `docs/adr/0002-bind-evidence-to-exact-changeset.md`
- Modify: `docs/adr/0001-decision-authority-gate.md`
- Modify: `docs/specs/adr-governance-design.md`
- Add: `docs/improvement-proposals-2026-09-04.md`
- Add: `docs/superpowers/plans/2026-09-04-v0-2-0-reliability.md`

**Interfaces:**

- Consumes: approved `docs/improvement-proposals-2026-09-04.md`。
- Produces: code tasksが従うDecisionEvidence v2、changeset、hook degradation、CIのauthoritative contract。

- [ ] **Step 1: Create accepted ADR-0002**

frontmatterとdecisionを次で固定する。

```markdown
---
status: accepted
date: 2026-09-04
acceptance: human
---

# Bind Decision Evidence to the Exact Change Set

## Decision

DecisionEvidence v2 records the immutable base commit and a provider-neutral
`git-change-set-v1` digest. Any path, content, file-mode, add, or delete change
after attestation makes the evidence stale. Rename detection is not heuristic;
a rename is represented as one delete and one add.

DecisionEvidence v1 remains readable with an explicit legacy warning during
v0.2.x and is rejected starting in v0.3.0.
```

Context、rejected alternatives（path hash only、head commit only、provider-specific SHA）、consequences、migrationを同じADRに記録する。path hash onlyは包含判定不能かつ同一path再編集を捕捉しないためrejectする。

- [ ] **Step 2: Amend ADR-0001 without changing its original decision**

Rulesへ次を追記する。

```markdown
6. **Exact change-set freshness:** ADR-0002 extends evidence freshness from the
   base decision corpus to the exact repository snapshot being attested.
```

Referencesへ`ADR-0002`の相対linkを追加する。ADR-0001をsupersededにはしない。

- [ ] **Step 3: Update the design spec contracts**

`docs/specs/adr-governance-design.md`のDecisionEvidence、fingerprint、performance、security/privacy、CI sectionsを承認済み改善提案と一致させる。canonical payloadを次で固定する。

```text
path NUL base-mode NUL base-sha256 NUL current-mode NUL current-sha256 NUL
```

存在しないsideはmode/hashとも`-`。pathはrepository-relative POSIX path、sortはUTF-8 bytes昇順、hash表記は`sha256:`に64文字のlowercase hexを続けたものとする。

- [ ] **Step 4: Verify documentation consistency**

Run:

```bash
rg -n "changedPathsHash|subset|DecisionEvidence v2|git-change-set-v1|requireNoAdrRationale" docs adr.config.json
```

Expected: `changedPathsHash`は棄却案としてだけ現れ、仕様・ADR・改善提案がexact changesetとv1 migrationで一致する。

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0001-decision-authority-gate.md docs/adr/0002-bind-evidence-to-exact-changeset.md docs/specs/adr-governance-design.md docs/improvement-proposals-2026-09-04.md docs/superpowers/plans/2026-09-04-v0-2-0-reliability.md
git commit -m "docs: define v0.2 reliability contract"
```

---

### Task 2: Build the Canonical Change Set

**Files:**

- Create: `src/core/change-set.ts`
- Create: `tests/unit/change-set.test.ts`
- Modify: `src/cli/git-diff.ts`
- Modify: `tests/helpers/git-test-repo.ts`

**Interfaces:**

```ts
export type SnapshotSide = {
  mode: '100644' | '100755' | '120000'
  contentHash: `sha256:${string}`
} | null

export type ChangeSetEntry = {
  path: string
  base: SnapshotSide
  current: SnapshotSide
}

export type BuiltChangeSet = {
  algorithm: 'git-change-set-v1'
  baseCommit: string
  comparisonBaseCommit: string
  digest: `sha256:${string}`
  entries: ChangeSetEntry[]
}

export function hashChangeSetEntries(entries: ChangeSetEntry[]): `sha256:${string}`
export async function buildChangeSet(
  repoRoot: string,
  baseRef: string,
): Promise<BuiltChangeSet>
```

- [ ] **Step 1: Write pure hashing RED tests**

```ts
it('is independent of entry enumeration order', () => {
  expect(hashChangeSetEntries([modified, added])).toBe(
    hashChangeSetEntries([added, modified]),
  )
})

it('changes when the same path receives new content', () => {
  expect(hashChangeSetEntries([modified])).not.toBe(
    hashChangeSetEntries([
      {
        ...modified,
        current: { mode: '100644', contentHash: `sha256:${'c'.repeat(64)}` },
      },
    ]),
  )
})
```

add / modify / delete / mode change、POSIX path normalization、duplicate path reject、NUL入りpath rejectも追加する。

- [ ] **Step 2: Run RED unit test**

```bash
pnpm exec vitest run tests/unit/change-set.test.ts
```

Expected: `src/core/change-set.ts`が存在しないためFAIL。

- [ ] **Step 3: Implement the pure canonicalizer**

`src/core/change-set.ts`のhash本体を次の形にする。

```ts
function sideParts(side: SnapshotSide): [string, string] {
  return side ? [side.mode, side.contentHash] : ['-', '-']
}

export function hashChangeSetEntries(
  entries: ChangeSetEntry[],
): `sha256:${string}` {
  const seen = new Set<string>()
  const sorted = entries.map((entry) => ({
    ...entry,
    path: entry.path.replace(/\\/g, '/'),
  })).sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)))

  const parts: string[] = []
  for (const entry of sorted) {
    if (!entry.path || entry.path.includes('\0') || seen.has(entry.path)) {
      throw new Error(`invalid change-set path: ${entry.path}`)
    }
    seen.add(entry.path)
    const [baseMode, baseHash] = sideParts(entry.base)
    const [currentMode, currentHash] = sideParts(entry.current)
    parts.push(`${entry.path}\0${baseMode}\0${baseHash}\0${currentMode}\0${currentHash}\0`)
  }
  return `sha256:${sha256(parts.join(''))}`
}
```

- [ ] **Step 4: Write repository snapshot RED tests**

temporary Git repoを使い、次を別testにする。

```ts
const before = await buildChangeSet(repo, baseSha)
await writeFile(path.join(repo, 'src/index.ts'), 'export const value = 2\n')
const after = await buildChangeSet(repo, baseSha)
expect(after.digest).not.toBe(before.digest)
```

staged、unstaged、untracked、delete、`git mv`、executable bit、binary bytes、symlink target textを含める。renameはentries上でdelete + addになることをassertする。

- [ ] **Step 5: Implement binary-safe Git and worktree readers**

`src/cli/git-diff.ts`へ次を追加する。

```ts
export async function resolveCommit(repoRoot: string, ref: string): Promise<string>
export async function listSnapshotChangedPaths(
  repoRoot: string,
  baseRef: string,
): Promise<string[]>
export async function readBlobAtRef(
  repoRoot: string,
  ref: string,
  relativePath: string,
): Promise<Buffer | null>
export async function readModeAtRef(
  repoRoot: string,
  ref: string,
  relativePath: string,
): Promise<'100644' | '100755' | '120000' | null>
```

`resolveCommit`でimmutable base tipを解決し、その値と`HEAD`を`git merge-base`へ渡してcomparison baseを解決する。changed path列挙はimmutable base tipと`HEAD`をthree-dotで指定した`git diff --no-renames --name-only -z`、index/worktree status、`--untracked-files=all`の和集合を使う。base sideのmode/contentはcomparison baseから読む。current sideは`lstat`し、regular fileはraw bytes、symlinkは`readlink`のtarget文字列をhash化する。directoryとignored fileは含めない。

- [ ] **Step 6: Run GREEN tests and lint**

```bash
pnpm exec vitest run tests/unit/change-set.test.ts
pnpm lint
```

Expected: 全test PASS、TypeScript error 0。

- [ ] **Step 7: Commit**

```bash
git add src/core/change-set.ts src/cli/git-diff.ts tests/unit/change-set.test.ts tests/helpers/git-test-repo.ts
git commit -m "feat: canonicalize repository change sets"
```

---

### Task 3: Generate and Enforce DecisionEvidence v2

**Files:**

- Modify: `src/core/types.ts`
- Modify: `src/core/decision-evidence.ts`
- Modify: `src/core/change-gate.ts`
- Modify: `src/cli/commands/attest.ts`
- Modify: `src/cli/commands/check.ts`
- Modify: `tests/unit/decision-evidence.test.ts`
- Modify: `tests/unit/change-gate.test.ts`
- Create: `tests/integration/decision-evidence-v2.test.ts`

**Interfaces:**

```ts
export type DecisionEvidenceV1 = {
  schemaVersion: 1
  decisionCorpusHash: string
  outcome: DecisionEvidenceOutcome
  reviewedProposals: ReviewedProposal[]
}

export type ReviewedProposal = {
  id: string
  relation: 'unrelated'
}

export type DecisionEvidenceV2 = {
  schemaVersion: 2
  baseCommit: string
  decisionCorpusHash: string
  changeSet: {
    algorithm: 'git-change-set-v1'
    digest: string
  }
  outcome: DecisionEvidenceOutcome
  reviewedProposals: ReviewedProposal[]
}

export type DecisionEvidence = DecisionEvidenceV1 | DecisionEvidenceV2
```

- [ ] **Step 1: Write parser and serializer RED tests**

```ts
const parsed = parseDecisionEvidence({
  schemaVersion: 2,
  baseCommit: 'a'.repeat(40),
  decisionCorpusHash: `sha256:${'b'.repeat(64)}`,
  changeSet: {
    algorithm: 'git-change-set-v1',
    digest: `sha256:${'c'.repeat(64)}`,
  },
  outcome: {
    kind: 'no-adr',
    reason: 'reversible',
    rationale: 'Rollback is local and immediate.',
  },
  reviewedProposals: [],
})
expect(parsed.schemaVersion).toBe(2)
```

invalid base hash、unknown algorithm、invalid digest、extra/duplicate refs、v1 compatibilityを追加する。serializerはkeyとarray順を安定化する。

- [ ] **Step 2: Run parser RED tests**

```bash
pnpm exec vitest run tests/unit/decision-evidence.test.ts
```

Expected: schemaVersion 2がunsupportedでFAIL。

- [ ] **Step 3: Implement versioned parsing**

`parseDecisionEvidence`は共通outcome/reviewed proposal parserを共有し、v1/v2だけを受理する。v2の`baseCommit`は40または64 lowercase hex、hashは既存`HASH_RE`、algorithmはliteral一致にする。`runAttest`は`buildChangeSet()`を呼び、常にv2を返す。

- [ ] **Step 4: Write gate RED tests**

`ChangeGateInput`へ次を追加してtestを先に更新する。

```ts
resolvedBaseCommit: string
currentChangeSetDigest: string
```

次をassertする。

```ts
expect(codes(evaluateChangeGate(staleDigestInput))).toContain(
  'decision-changeset-stale',
)
expect(codes(evaluateChangeGate(staleBaseInput))).toContain(
  'decision-base-stale',
)
expect(evaluateChangeGate(v1Input)).toContainEqual(
  expect.objectContaining({
    severity: 'warning',
    code: 'decision-evidence-legacy',
  }),
)
```

- [ ] **Step 5: Implement gate and CLI wiring**

`checkDecisionAuthority`でbase commitとchangesetを一度だけ構築し、change gateへ渡す。v2はbase/digestを比較する。v1はconfig modeに関係なくlegacy warningを追加し、既存のcorpus/ref/proposal検証は継続する。changeset構築不能はwarn modeでも`base-ref-unavailable` error、enforce modeでもerrorとする既存fail-closed境界を維持する。

- [ ] **Step 6: Add end-to-end stale evidence tests**

`tests/integration/decision-evidence-v2.test.ts`で次の流れを実行する。

```ts
const evidence = await runAttest(attestOptions)
await writeFile(path.join(repo, 'src/app.ts'), 'export const changedAgain = true\n')
const result = await runCheck(repo, {
  baseRef: baseSha,
  evidencePath,
})
expect(result.issues.map((issue) => issue.code)).toContain(
  'decision-changeset-stale',
)
```

新規path、同一path再編集、delete、rename、mode、base SHA差し替え、v1 warningを別testにする。

- [ ] **Step 7: Verify GREEN**

```bash
pnpm exec vitest run tests/unit/decision-evidence.test.ts tests/unit/change-gate.test.ts tests/integration/decision-evidence-v2.test.ts tests/integration/decision-gate-classification.test.ts
pnpm lint
```

Expected: 全test PASS、既存gate分類の回帰なし。

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/decision-evidence.ts src/core/change-gate.ts src/cli/commands/attest.ts src/cli/commands/check.ts tests/unit/decision-evidence.test.ts tests/unit/change-gate.test.ts tests/integration/decision-evidence-v2.test.ts tests/integration/decision-gate-classification.test.ts
git commit -m "feat: bind decision evidence to exact changes"
```

---

### Task 4: Replace mtime Resolution with Decision Corpus Snapshots

**Files:**

- Modify: `src/core/types.ts`
- Modify: `src/core/decision-corpus.ts`
- Modify: `src/hooks/before-turn.ts`
- Modify: `src/hooks/after-turn.ts`
- Modify: `src/core/fingerprint-build.ts`
- Modify: `src/core/fingerprint.ts`
- Modify: `tests/unit/decision-corpus.test.ts`
- Modify: `tests/unit/follow-up-loop.test.ts`
- Modify: `tests/unit/session-isolation.test.ts`
- Modify: `tests/unit/fixes.test.ts`
- Modify: `tests/unit/init-evidence-plan.test.ts`

**Interfaces:**

```ts
export type DecisionCorpusSnapshot = {
  hash: `sha256:${string}`
  entries: DecisionCorpusEntry[]
}

export function snapshotDecisionCorpus(
  entries: DecisionCorpusEntry[],
): DecisionCorpusSnapshot

export function changedDecisionCorpusPaths(
  before: DecisionCorpusSnapshot,
  after: DecisionCorpusSnapshot,
): string[]
```

`TurnState`はschemaVersion 2と`beforeDecisionCorpus: DecisionCorpusSnapshot`を持つ。loaderはschemaVersion 1を7日間の互換stateとして読み、corpus snapshotがない場合は旧mtime判定を使わず、docs update未確認としてfail-open warningを返す。

- [ ] **Step 1: Write pure corpus diff RED tests**

```ts
expect(changedDecisionCorpusPaths(before, after)).toEqual([
  'docs/adr/0001-decision-authority-gate.md',
])
expect(snapshotDecisionCorpus([b, a]).hash).toBe(
  snapshotDecisionCorpus([a, b]).hash,
)
```

add、delete、CONTEXT、README除外、non-Markdown除外を追加する。

- [ ] **Step 2: Write hook behavior RED tests**

既存`resolves a pending audit when an accepted ADR is updated`を内容hash比較へ変更し、次を追加する。

```ts
it('does not resolve an audit when ADR mtime changes without content', async () => {
  const before = await runBeforeTurn(input)
  await utimes(adrPath, new Date(), new Date())
  const after = await runAfterTurn(afterInput)
  expect(after.allowFinish).toBe(false)
})
```

mtimeを過去へ戻した内容変更、ADR add/delete、README変更、legacy stateを別testにする。

- [ ] **Step 3: Run RED tests**

```bash
pnpm exec vitest run tests/unit/decision-corpus.test.ts tests/unit/follow-up-loop.test.ts
```

Expected: `beforeDecisionCorpus`未実装またはtouchが解決扱いになりFAIL。

- [ ] **Step 4: Implement corpus snapshots in turn flow**

before-turnで`buildWorkingDecisionCorpus`を一度実行し、snapshotをstateへ保存する。after-turnで再取得し、hash比較から`docsUpdated`と`changedDecisionPaths`を求める。mtime helperはproduction pathから削除し、未参照になった`detectDocsPathsUpdated`と`pathTreeUpdatedSince`を削除する。

docs更新でaudit chainを解決する条件は次へ統一する。

```ts
const docsUpdated =
  state.beforeDecisionCorpus !== undefined &&
  state.beforeDecisionCorpus.hash !== afterDecisionCorpus.hash
```

- [ ] **Step 5: Verify GREEN and compatibility**

```bash
pnpm exec vitest run tests/unit/decision-corpus.test.ts tests/unit/follow-up-loop.test.ts tests/unit/session-isolation.test.ts tests/unit/fixes.test.ts tests/unit/init-evidence-plan.test.ts
pnpm lint
```

Expected: touchだけではfollow-up、内容変更はmtimeに依存せず解決、legacy stateはwarning付きfail-open。

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/decision-corpus.ts src/core/fingerprint-build.ts src/core/fingerprint.ts src/hooks/before-turn.ts src/hooks/after-turn.ts tests/unit/decision-corpus.test.ts tests/unit/follow-up-loop.test.ts tests/unit/session-isolation.test.ts tests/unit/fixes.test.ts tests/unit/init-evidence-plan.test.ts
git commit -m "fix: resolve turn audits from corpus content"
```

---

### Task 5: Make Fingerprint Degradation Explicit

**Files:**

- Modify: `src/core/types.ts`
- Modify: `src/core/fingerprint-build.ts`
- Modify: `src/core/fingerprint.ts`
- Modify: `src/core/fingerprint-normalize.ts`
- Modify: `src/hooks/before-turn.ts`
- Modify: `src/hooks/after-turn.ts`
- Modify: `src/hooks/common.ts`
- Modify: `src/hooks/hook-main.ts`
- Modify: `tests/unit/fixes.test.ts`
- Modify: `tests/unit/follow-up-loop.test.ts`
- Modify: `tests/unit/adapter-contract.test.ts`
- Modify: `tests/unit/init-evidence-plan.test.ts`
- Modify: `tests/unit/session-isolation.test.ts`

**Interfaces:**

```ts
export type FingerprintCollectionMode = 'content' | 'metadata' | 'unavailable'

export type RepositoryFingerprint = {
  paths: string[]
  gitStatusHash: string
  watchGitStatusHash: string
  overflowWatchHash: string
  contentHashes: Record<string, string>
  repositoryStateHash?: string
  collectionMode: FingerprintCollectionMode
  degradationReason?: 'untracked-count' | 'untracked-size' | 'git-unavailable'
}
```

- [ ] **Step 1: Write degradation RED tests**

```ts
expect(largeUntrackedFingerprint.collectionMode).toBe('metadata')
expect(largeUntrackedFingerprint.degradationReason).toBe('untracked-size')
expect(repositoryFingerprintChanged(before, after)).toBe(true)
```

501 untracked files、1MB超file、same-size mtime change、Git command failure、legacy `collectionAvailable` stateを追加する。

- [ ] **Step 2: Run RED tests**

```bash
pnpm exec vitest run tests/unit/fixes.test.ts tests/unit/follow-up-loop.test.ts
```

Expected: 現行が`collectionAvailable: false`へ落ちるためFAIL。

- [ ] **Step 3: Implement discriminated collection results**

`hashUntrackedFiles`の戻り値を次にする。

```ts
type UntrackedObservation = {
  hash: string
  mode: 'content' | 'metadata'
  reason?: 'untracked-count' | 'untracked-size'
}
```

content budgetを超えた場合は、各entryのnormalized path、size、`Math.trunc(mtimeMs)`をhash化する。stat不能またはGit不能だけを`unavailable`にする。`repositoryFingerprintChanged`はcontent/metadataならhash比較し、どちらかがunavailableなら`null`を返す。

- [ ] **Step 4: Surface one warning per turn**

`buildHookContext`へ任意のdegradationを渡し、full instructionへ次を一度だけ追加する。

```text
Repository change detection is using metadata fallback (untracked-size).
The CI decision gate remains authoritative.
```

`hook-main.ts`は`result.warning`をstderrへ出すがstdoutへ混ぜない。

```ts
if (result.warning) console.error(result.warning)
```

warning済み状態をTurnStateへ保存し、after-turnで同じreasonを重複出力しない。

- [ ] **Step 5: Verify GREEN**

```bash
pnpm exec vitest run tests/unit/fixes.test.ts tests/unit/follow-up-loop.test.ts tests/unit/adapter-contract.test.ts tests/unit/init-evidence-plan.test.ts tests/unit/session-isolation.test.ts
pnpm lint
```

Expected: metadata fallbackでも変更を検出し、warningはstderrへ1回、stdout JSONはparse可能。

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/fingerprint-build.ts src/core/fingerprint.ts src/core/fingerprint-normalize.ts src/hooks/before-turn.ts src/hooks/after-turn.ts src/hooks/common.ts src/hooks/hook-main.ts tests/unit/fixes.test.ts tests/unit/follow-up-loop.test.ts tests/unit/adapter-contract.test.ts tests/unit/init-evidence-plan.test.ts tests/unit/session-isolation.test.ts
git commit -m "fix: expose fingerprint degradation"
```

---

### Task 6: Add a Shared Hook Shim Watchdog

**Files:**

- Create: `templates/shared/hook-shim-runner.mjs`
- Create: `tests/unit/hook-shim-timeout.test.ts`
- Modify: `templates/cursor/hooks/adr-governance.mjs`
- Modify: `templates/claude/hooks/adr-governance.mjs`
- Modify: `templates/codex/hooks/adr-governance.mjs`
- Modify: `templates/gemini/hooks/adr-governance.mjs`
- Modify: `src/installer/init-plan-builder.ts`
- Modify: `src/installer/generated-files.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/config.ts`
- Modify: `templates/schema/adr-config.schema.json`
- Modify: `adr.config.json`
- Modify: `tests/unit/core.test.ts`
- Modify: `tests/unit/init-evidence-plan.test.ts`

**Interfaces:**

```js
export async function runHookShim({
  runtime,
  phase,
  repoRoot,
  stdin,
  timeoutMs,
  failOpenOutput,
})
```

config v2へ`hooks.timeoutMs: number`を追加し、default 1500、許容範囲100〜1900msとする。不正値はconfig errorにする。configが読めないshimはdefault 1500msを使う。

- [ ] **Step 1: Write config RED tests**

```ts
expect(defaultConfig().hooks.timeoutMs).toBe(1500)
expect(() => parseConfig(configWithTimeout(2000))).toThrow(/timeoutMs/)
expect(() => parseConfig(configWithTimeout(99))).toThrow(/timeoutMs/)
```

schema testにも100〜1900のminimum/maximumを追加する。

- [ ] **Step 2: Write shim timeout RED tests**

hangするtemporary `.adr-governance/bin/hook.mjs`を作り、4 runtime templateを起動する。各runtimeについて次をassertする。

```ts
expect(elapsedMs).toBeLessThan(2000)
expect(JSON.parse(stdout)).toEqual(expectedFailOpen[runtime])
expect(stdout.trim().split('\n')).toHaveLength(1)
```

expected fail-openはCursor / Claude / Codexが`{ continue: true }`、Geminiが`{ decision: 'allow' }`。late stdout、spawn error、non-zero exitも追加する。

- [ ] **Step 3: Run RED tests**

```bash
pnpm exec vitest run tests/unit/core.test.ts tests/unit/hook-shim-timeout.test.ts
```

Expected: timeout testが2秒を超えるかtest watchdogによりFAIL。

- [ ] **Step 4: Implement the single-output runner**

runnerはchild stdoutを直接pipeせずbufferし、正常exit時だけ一度出力する。timeout/error時はchild stdout listenerを外し、`SIGTERM`、100ms後に`SIGKILL`、fail-open JSONを一度だけ出す。

```js
let settled = false
const finish = (output, code = 0) => {
  if (settled) return
  settled = true
  clearTimeout(timer)
  process.stdout.write(output)
  process.exitCode = code
}
```

各runtime shimはrepo root解決だけを担当し、runnerへruntime、phase、stdin、fail-open objectを渡す。

- [ ] **Step 5: Distribute and manifest the runner**

`buildInitPlanOperations`で`templates/shared/hook-shim-runner.mjs`を`.adr-governance/bin/hook-shim-runner.mjs`へcreate/replaceする。`buildManifest`のmanaged targetsへ同pathを追加する。4 shimのimportはrepo rootから同runnerを指す。

- [ ] **Step 6: Verify GREEN and bundle compatibility**

```bash
pnpm build
pnpm exec vitest run tests/unit/core.test.ts tests/unit/hook-shim-timeout.test.ts tests/unit/init-evidence-plan.test.ts tests/unit/fixes.test.ts
pnpm lint
```

Expected: 4 runtime timeout contract PASS、generated runnerがmanifest管理される。

- [ ] **Step 7: Commit**

```bash
git add templates src/installer/init-plan-builder.ts src/installer/generated-files.ts src/core/types.ts src/core/config.ts adr.config.json tests/unit/core.test.ts tests/unit/hook-shim-timeout.test.ts tests/unit/init-evidence-plan.test.ts tests/unit/fixes.test.ts
git commit -m "fix: bound hook shim execution time"
```

---

### Task 7: Add Release-Blocking Security and Privacy Tests

**Files:**

- Create: `tests/integration/security-privacy.test.ts`
- Modify: `tests/unit/adapter-contract.test.ts`
- Modify: `tests/integration/init-apply.test.ts`
- Modify only if a RED test exposes a defect: `src/analysis/repository-scan.ts`
- Modify only if a RED test exposes a defect: `src/installer/apply-plan.ts`
- Modify only if a RED test exposes a defect: `src/hooks/before-turn.ts`
- Modify only if a RED test exposes a defect: `src/core/audit-log.ts`

**Interfaces:**

- Consumes: public privacy contract in design spec §14.1 and §18.5。
- Produces: filesystem-level proof that forbidden bodies and out-of-repo writes are absent。

- [ ] **Step 1: Write raw prompt persistence test**

```ts
const secretPrompt = 'PROMPT_SENTINEL_7f3a architecture secret'
await runBeforeTurn({ cwd: repo, prompt: secretPrompt, sessionId: 'privacy-test' })
const stateText = await readAllFiles(path.join(repo, '.adr-governance', 'state'))
expect(stateText).not.toContain(secretPrompt)
expect(stateText).toContain(hashPrompt(secretPrompt))
```

state、logs、manifestを再帰走査するhelperはtest内に置き、symlinkをfollowしない。

- [ ] **Step 2: Write secret scan exclusion test**

tracked `.env.production`、`config/client-secret.json`、`keys/service.credential`と通常manifestをfixtureへ置き、`buildEvidenceBundle`結果をserializeして禁止path、内容sentinel、excerpt hashが含まれないことをassertする。

- [ ] **Step 3: Write path escape and symlink tests**

次のoperationsをそれぞれ拒否する。

```ts
{ kind: 'create', path: '../outside.txt', content: 'blocked' }
{ kind: 'create', path: '/tmp/outside.txt', content: 'blocked' }
{ kind: 'create', path: 'linked/outside.txt', content: 'blocked' }
```

`linked`はrepo外temporary directoryを指すsymlinkにする。apply後にoutside fileが存在しないこともassertする。

- [ ] **Step 4: Run RED or confirmation tests**

```bash
pnpm exec vitest run tests/integration/security-privacy.test.ts tests/unit/adapter-contract.test.ts tests/integration/init-apply.test.ts
```

Expected: 新規testが既存実装でPASSする場合はproduction codeを変更しない。FAILした契約だけ最小修正する。

- [ ] **Step 5: Verify no stdout contamination**

4 runtimeのbefore/after shimを起動し、stderrを分離してstdoutだけを`JSON.parse`する。degradation warningを発生させてもparseできることをassertする。

- [ ] **Step 6: Run GREEN and lint**

```bash
pnpm exec vitest run tests/integration/security-privacy.test.ts tests/unit/adapter-contract.test.ts tests/integration/init-apply.test.ts tests/unit/hook-shim-timeout.test.ts
pnpm lint
```

Expected: 禁止本文0、repo外write 0、stdout JSON parse error 0。

- [ ] **Step 7: Commit**

```bash
git add tests/integration/security-privacy.test.ts tests/unit/adapter-contract.test.ts tests/integration/init-apply.test.ts src/analysis/repository-scan.ts src/installer/apply-plan.ts src/hooks/before-turn.ts src/core/audit-log.ts
git commit -m "test: enforce security and privacy contracts"
```

`git add`は実際に変更されたproduction fileだけを含める。REDがなければtest filesだけをcommitする。

---

### Task 8: Correct Generated CI and Start Self-Hosting

**Files:**

- Modify: `src/analysis/init-hints.ts`
- Modify: `src/installer/init-plan-builder.ts`
- Modify: `tests/unit/init-evidence-plan.test.ts`
- Modify: `tests/integration/init-apply.test.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/adr-governance.yml`
- Modify: `adr.config.json`
- Create through reviewed init apply: `.adr-governance/manifest.json`
- Create through reviewed init apply: `.adr-governance/bin/*`
- Create through reviewed init apply: runtime hook/rule/settings files selected by the self-hosting plan

**Interfaces:**

```ts
export function ciWorkflowSuggestion(): string
```

生成workflowはPRでimmutable base SHAと`$GITHUB_EVENT_PATH`を使い、pushでPR evidenceを要求しない。自リポジトリはsource build後の`dist/cli/main.js`を使い、target repo templateはvendored `.adr-governance/bin/cli.mjs`を使う。

- [ ] **Step 1: Write generated workflow RED tests**

```ts
const workflow = ciWorkflowSuggestion()
expect(workflow).toContain('fetch-depth: 0')
expect(workflow).toContain('${{ github.event.pull_request.base.sha }}')
expect(workflow).toContain('--github-event "$GITHUB_EVENT_PATH"')
expect(workflow).not.toContain('--base origin/main')
```

push jobまたはpush stepが`check`を`--base`なしで実行することもassertする。

- [ ] **Step 2: Run RED tests**

```bash
pnpm exec vitest run tests/unit/init-evidence-plan.test.ts tests/integration/init-apply.test.ts
```

Expected: 現行templateがfetch depth / event evidenceを持たずFAIL。

- [ ] **Step 3: Implement the target-repository workflow**

PR jobの核を次にする。

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: actions/setup-node@v4
  with:
    node-version: '20'
- run: >-
    node .adr-governance/bin/cli.mjs check
    --base "${{ github.event.pull_request.base.sha }}"
    --github-event "$GITHUB_EVENT_PATH"
```

push jobは`node .adr-governance/bin/cli.mjs check`だけを実行する。shell interpolationを生成時に壊さないgolden testを置く。

- [ ] **Step 4: Expand the repository CI matrix**

`.github/workflows/ci.yml`のtest jobを次にする。

```yaml
strategy:
  fail-fast: false
  matrix:
    node: [20, 22]
```

`actions/setup-node`は`node-version: ${{ matrix.node }}`。両matrixで`pnpm lint`と`pnpm test`を実行する。

- [ ] **Step 5: Add the self-hosted PR gate**

`.github/workflows/adr-governance.yml`はPRだけを対象にし、checkout full history、pnpm install、`pnpm build`後に次を実行する。

```yaml
- run: >-
    node dist/cli/main.js check
    --base "${{ github.event.pull_request.base.sha }}"
    --github-event "$GITHUB_EVENT_PATH"
```

`adr.config.json`は`changeGate.mode: "warn"`を維持し、`hooks.enabled: true`へ変更する。

- [ ] **Step 6: Generate and review self-hosting assets**

```bash
pnpm build
SELF_HOST_SCAN_JSON="$(node dist/cli/main.js init --repo .)"
SELF_HOST_PLAN_PATH="$(node -e 'const value = JSON.parse(process.argv[1]); process.stdout.write(value.planPath)' "$SELF_HOST_SCAN_JSON")"
SELF_HOST_REVIEWED_PLAN=/tmp/adr-governance-self-host-plan.json
node -e 'const fs=require("node:fs"); const input=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); input.operations=input.operations.filter((op)=>op.path!=="adr.config.json"&&!op.path.startsWith("docs/proposed-adr/")); fs.writeFileSync(process.argv[2],JSON.stringify(input,null,2)+"\n")' "$SELF_HOST_PLAN_PATH" "$SELF_HOST_REVIEWED_PLAN"
```

この変換は既存configのreplaceと理由未確認のproposed ADR候補だけを除外する。apply前に`SELF_HOST_REVIEWED_PLAN`のoperationsを読み、Skill、bundle、schema、runtime shim/settings、CONTEXT、CI候補以外のpathがないことを確認する。

```bash
node dist/cli/main.js init --apply "$SELF_HOST_REVIEWED_PLAN" --repo .
```

apply後に`git diff --stat`とmanifest entriesを確認する。temporary scan outputとreviewed planはrepositoryへ追加しない。

- [ ] **Step 7: Verify generated and self-hosted CI contracts**

```bash
pnpm exec vitest run tests/unit/init-evidence-plan.test.ts tests/integration/init-apply.test.ts
pnpm lint
node dist/cli/main.js check
```

Expected: local structural check PASS。PR gateはwarn modeなのでdecision findingsを表示してもvalidation error以外ではexit 0。

- [ ] **Step 8: Commit**

```bash
git add src/analysis/init-hints.ts src/installer/init-plan-builder.ts tests/unit/init-evidence-plan.test.ts tests/integration/init-apply.test.ts .github/workflows/ci.yml .github/workflows/adr-governance.yml adr.config.json .adr-governance .cursor .claude .codex .gemini
git commit -m "ci: dogfood the decision authority gate"
```

存在しないruntime directoryは`git add`対象から外す。generated plan外のuser-managed fileを追加しない。

---

### Task 9: Remove the Dead Config and Close the v0.2.0 Release Gate

**Files:**

- Modify: `src/core/types.ts`
- Modify: `src/core/config.ts`
- Modify: `templates/schema/adr-config.schema.json`
- Modify: `adr.config.json`
- Modify: `tests/unit/core.test.ts`
- Modify: `tests/unit/change-gate.test.ts`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION-STATUS.md`
- Modify: `docs/improvement-proposals-2026-09-04.md`

**Interfaces:**

- Removes: `ChangeGateConfig.requireNoAdrRationale`。
- Preserves: no-ADR evidence always requires non-empty `rationale`。
- Preserves: config v1 parsing and warning。
- Produces: v0.2.0 release checklist and warn-dogfooding entry criteria。

- [ ] **Step 1: Write dead-setting RED tests**

```ts
expect(defaultConfig().changeGate).not.toHaveProperty('requireNoAdrRationale')
expect(parseConfig(configWithLegacyRationaleKey).warnings).toContain(
  'Unknown config key: changeGate.requireNoAdrRationale',
)
expect(() => parseDecisionEvidence(noAdrEvidenceWithEmptyRationale)).toThrow(
  /rationale must be non-empty/,
)
```

- [ ] **Step 2: Run RED tests**

```bash
pnpm exec vitest run tests/unit/core.test.ts tests/unit/change-gate.test.ts tests/unit/decision-evidence.test.ts
```

Expected: default configが旧keyを持つためFAIL。

- [ ] **Step 3: Remove the key without weakening evidence**

type、default、parser assignment、known key list、JSON schema required/property、self config、fixturesから`requireNoAdrRationale`を削除する。parserのknown key listには戻さないため、Unreleased版configはunknown warningになる。`parseDecisionEvidence`のnon-empty checkは変更しない。

- [ ] **Step 4: Update release documentation**

`CHANGELOG.md`のUnreleasedへ次を記録する。

```markdown
- DecisionEvidence v2 binds attestations to an immutable base and exact change set.
- Turn audit resolution uses decision-corpus content instead of filesystem mtime.
- Hook fingerprints expose metadata fallback and unavailable collection modes.
- Runtime shims enforce a sub-two-second watchdog.
- Generated and self-hosted GitHub Actions use full history and immutable PR base SHAs.
- Config v2 removes the ineffective `requireNoAdrRationale` switch; rationale remains mandatory.
```

READMEへv1 evidence migration warning、`attest`再実行条件、hook degraded warningを追加する。Implementation Statusと改善提案は完了したP0へ実装commitをリンクし、v0.2.x enforce条件を「14日以上、20 PR以上、false positive 5%未満、unexplained degradation 0、bot PR green、P0 finding 0」と記録する。

- [ ] **Step 5: Run focused GREEN tests**

```bash
pnpm exec vitest run tests/unit/core.test.ts tests/unit/change-gate.test.ts tests/unit/decision-evidence.test.ts
pnpm lint
```

Expected: config v2から旧keyが消え、empty rationaleは引き続きreject。

- [ ] **Step 6: Run the full release verification**

```bash
pnpm test
node dist/cli/main.js check
npm pack --dry-run
git diff --check
git status --short
```

Expected:

- Vitest: 0 failed files / 0 failed tests。
- structural check: exit 0。
- package dry-run: `dist`、`skill`、`templates/shared/hook-shim-runner.mjs`、README、LICENSE、CHANGELOGを含む。
- `git diff --check`: outputなし、exit 0。
- status: この計画で意図した変更だけ。secret、state、temporary init plan、package tarballを含まない。

- [ ] **Step 7: Verify Node 20 explicitly**

```bash
nvm install 20
nvm use 20
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

Expected: Node 20で0 failure。完了後は`.nvmrc`に従いNode 22へ戻す。

```bash
nvm use
```

- [ ] **Step 8: Commit release-gate cleanup**

```bash
git add src/core/types.ts src/core/config.ts templates/schema/adr-config.schema.json adr.config.json tests/unit/core.test.ts tests/unit/change-gate.test.ts CHANGELOG.md README.md docs/IMPLEMENTATION-STATUS.md docs/improvement-proposals-2026-09-04.md
git commit -m "chore: close v0.2 reliability release gates"
```

---

## Post-Implementation Review Gate

実装完了時点ではself-hostingを`warn`に保つ。`enforce`への切り替えは別変更とし、次を満たした記録を添付する。

```text
observation_days >= 14
observed_pull_requests >= 20
false_positive_rate < 0.05
unexplained_degradation_count == 0
bot_pull_request_path == green
p0_finding_count == 0
```

条件を満たしたら、v0.2.x計画でbot例外の最小実装、`changeGate.mode: "enforce"`、branch protection required checkを扱う。条件未達の場合はwarnを継続し、日数だけを理由にenforceしない。
