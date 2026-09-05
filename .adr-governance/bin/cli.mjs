#!/usr/bin/env node
// adr-governance cli bundle
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/types.ts
var NO_ADR_REASONS, SUPPORTED_CONFIG_VERSION, SUPPORTED_CONFIG_VERSIONS;
var init_types = __esm({
  "src/core/types.ts"() {
    "use strict";
    NO_ADR_REASONS = [
      "no-decision",
      "reversible",
      "obvious",
      "no-tradeoff",
      "implementation-detail",
      "already-recorded"
    ];
    SUPPORTED_CONFIG_VERSION = 2;
    SUPPORTED_CONFIG_VERSIONS = [1, 2];
  }
});

// src/core/numbering.ts
var numbering_exports = {};
__export(numbering_exports, {
  excerptHash: () => excerptHash,
  formatAdrFilename: () => formatAdrFilename,
  formatAdrId: () => formatAdrId,
  nextAdrNumber: () => nextAdrNumber,
  parseAdrFilename: () => parseAdrFilename,
  sha256: () => sha256,
  slugifyTitle: () => slugifyTitle
});
import { createHash } from "node:crypto";
function parseAdrFilename(filename) {
  const match = ADR_FILENAME_RE.exec(filename);
  if (!match) return null;
  return {
    number: Number.parseInt(match[1] ?? "0", 10),
    slug: match[2] ?? ""
  };
}
function formatAdrId(number, digits) {
  return `ADR-${String(number).padStart(digits, "0")}`;
}
function formatAdrFilename(number, slug, digits) {
  const padded = String(number).padStart(digits, "0");
  return `${padded}-${slug}.md`;
}
function nextAdrNumber(existingNumbers) {
  if (existingNumbers.length === 0) return 1;
  return Math.max(...existingNumbers) + 1;
}
function slugifyTitle(title) {
  return title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}
function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}
function excerptHash(excerpt) {
  return sha256(excerpt).slice(0, 16);
}
var ADR_FILENAME_RE;
var init_numbering = __esm({
  "src/core/numbering.ts"() {
    "use strict";
    ADR_FILENAME_RE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
  }
});

// src/core/lifecycle.ts
function parseFrontmatter(content) {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { frontmatter: null, body: content };
  }
  const yaml = match[1] ?? "";
  const body = match[2] ?? "";
  const fields = {};
  for (const line of yaml.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields[key] = value;
  }
  const status = fields.status;
  const date = fields.date;
  if (!status || !date) {
    return { frontmatter: null, body: content };
  }
  const frontmatter = { status, date };
  if (fields.acceptance === "automatic" || fields.acceptance === "human") {
    frontmatter.acceptance = fields.acceptance;
  }
  if (fields.superseded_by) {
    frontmatter.superseded_by = fields.superseded_by;
  }
  if (fields.supersedes) {
    frontmatter.supersedes = fields.supersedes.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  return { frontmatter, body };
}
function serializeFrontmatter(fm) {
  const lines = ["---", `status: ${fm.status}`, `date: ${fm.date}`];
  if (fm.acceptance) lines.push(`acceptance: ${fm.acceptance}`);
  if (fm.superseded_by) lines.push(`superseded_by: ${fm.superseded_by}`);
  if (fm.supersedes?.length) lines.push(`supersedes: ${fm.supersedes.join(", ")}`);
  lines.push("---", "");
  return lines.join("\n");
}
function extractTitle(body) {
  const match = TITLE_RE.exec(body);
  return match?.[1]?.trim() ?? "Untitled ADR";
}
function hasOpenPoints(body) {
  return OPEN_POINTS_RE.test(body);
}
function canPromoteToAccepted(adr, requireHumanAcceptance, approval) {
  if (adr.hasOpenPoints) {
    return { ok: false, reason: "Open Points must be resolved before acceptance" };
  }
  if (adr.frontmatter.status !== "proposed") {
    return { ok: false, reason: `Cannot promote ADR with status ${adr.frontmatter.status}` };
  }
  if (requireHumanAcceptance && approval !== "human") {
    return { ok: false, reason: "Human approval required by config" };
  }
  return { ok: true };
}
function buildAdrContent(frontmatter, title, body) {
  const normalizedBody = body.startsWith("#") ? body : `# ${title}

${body}`;
  return serializeFrontmatter(frontmatter) + normalizedBody.replace(/^\n+/, "");
}
var FRONTMATTER_RE, TITLE_RE, OPEN_POINTS_RE;
var init_lifecycle = __esm({
  "src/core/lifecycle.ts"() {
    "use strict";
    FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    TITLE_RE = /^#\s+(.+)$/m;
    OPEN_POINTS_RE = /^##\s+Open Points\b/im;
  }
});

// src/core/validation.ts
var validation_exports = {};
__export(validation_exports, {
  collectValidationIssues: () => collectValidationIssues,
  parseAdrFromPath: () => parseAdrFromPath,
  validateAdrFile: () => validateAdrFile,
  validateNumberUniqueness: () => validateNumberUniqueness,
  validateSupersededReferences: () => validateSupersededReferences
});
function validateAdrFile(relativePath, content, config, directory) {
  const issues = [];
  const filename = relativePath.split("/").pop() ?? relativePath;
  const parsedName = parseAdrFilename(filename);
  if (!parsedName) {
    issues.push({
      severity: "error",
      code: "invalid-filename",
      message: `Invalid ADR filename: ${filename}`,
      path: relativePath
    });
    return issues;
  }
  const { frontmatter, body } = parseFrontmatter(content);
  if (!frontmatter) {
    issues.push({
      severity: "warning",
      code: "missing-frontmatter",
      message: "ADR has no frontmatter (legacy mode)",
      path: relativePath
    });
    return issues;
  }
  const openPoints = hasOpenPoints(body);
  const acceptedStatuses = /* @__PURE__ */ new Set(["accepted", "superseded", "deprecated"]);
  const proposedStatuses = /* @__PURE__ */ new Set(["proposed", "rejected"]);
  if (config.layout.mode !== "single" && directory === "accepted" && !acceptedStatuses.has(frontmatter.status)) {
    issues.push({
      severity: "error",
      code: "status-path-mismatch",
      message: `Status ${frontmatter.status} must not live in accepted directory`,
      path: relativePath
    });
  }
  if (config.layout.mode !== "single" && directory === "proposed" && !proposedStatuses.has(frontmatter.status)) {
    issues.push({
      severity: "error",
      code: "status-path-mismatch",
      message: `Status ${frontmatter.status} must not live in proposed directory`,
      path: relativePath
    });
  }
  if (acceptedStatuses.has(frontmatter.status) && openPoints) {
    issues.push({
      severity: "error",
      code: "accepted-open-points",
      message: "Accepted ADR must not contain Open Points",
      path: relativePath
    });
  }
  if (frontmatter.status === "superseded" && !frontmatter.superseded_by) {
    issues.push({
      severity: "error",
      code: "missing-superseded-by",
      message: "Superseded ADR must reference superseded_by",
      path: relativePath
    });
  }
  if (frontmatter.superseded_by && !frontmatter.superseded_by.startsWith("ADR-")) {
    issues.push({
      severity: "error",
      code: "invalid-superseded-by",
      message: `Invalid superseded_by reference: ${frontmatter.superseded_by}`,
      path: relativePath
    });
  }
  return issues;
}
function validateNumberUniqueness(adrs) {
  const issues = [];
  const byNumber = /* @__PURE__ */ new Map();
  for (const adr of adrs) {
    const list = byNumber.get(adr.number) ?? [];
    list.push(adr);
    byNumber.set(adr.number, list);
  }
  for (const [number, group] of byNumber) {
    if (group.length > 1) {
      issues.push({
        severity: "error",
        code: "duplicate-number",
        message: `Duplicate ADR number ${number}: ${group.map((a) => a.path).join(", ")}`
      });
    }
  }
  return issues;
}
function validateSupersededReferences(adrs, config) {
  const issues = [];
  const ids = new Set(adrs.map((a) => formatAdrId(a.number, config.documents.idDigits)));
  for (const adr of adrs) {
    const ref = adr.frontmatter.superseded_by;
    if (ref && !ids.has(ref)) {
      issues.push({
        severity: "error",
        code: "broken-superseded-ref",
        message: `${formatAdrId(adr.number, config.documents.idDigits)} references missing ${ref}`,
        path: adr.path
      });
    }
  }
  return issues;
}
function parseAdrFromPath(relativePath, content, directory, config) {
  const filename = relativePath.split("/").pop() ?? relativePath;
  const parsedName = parseAdrFilename(filename);
  if (!parsedName) return null;
  const { frontmatter, body } = parseFrontmatter(content);
  if (!frontmatter) {
    const inferredStatus = directory === "accepted" ? "accepted" : "proposed";
    return {
      id: formatAdrId(parsedName.number, config.documents.idDigits),
      number: parsedName.number,
      slug: parsedName.slug,
      path: relativePath,
      directory,
      frontmatter: { status: inferredStatus, date: "legacy" },
      title: extractTitle(body || content),
      body: body || content,
      hasOpenPoints: hasOpenPoints(body || content),
      legacy: true
    };
  }
  return {
    id: formatAdrId(parsedName.number, config.documents.idDigits),
    number: parsedName.number,
    slug: parsedName.slug,
    path: relativePath,
    directory,
    frontmatter,
    title: extractTitle(body),
    body,
    hasOpenPoints: hasOpenPoints(body)
  };
}
function collectValidationIssues(adrs, config) {
  const issues = [];
  for (const adr of adrs) {
    issues.push(
      ...validateAdrFile(
        adr.path,
        serializeFrontmatter(adr.frontmatter) + adr.body,
        config,
        adr.directory
      )
    );
  }
  issues.push(...validateNumberUniqueness(adrs));
  issues.push(...validateSupersededReferences(adrs, config));
  return issues;
}
var init_validation = __esm({
  "src/core/validation.ts"() {
    "use strict";
    init_numbering();
    init_lifecycle();
    init_numbering();
  }
});

// src/core/decision-evidence.ts
var decision_evidence_exports = {};
__export(decision_evidence_exports, {
  contentHashForFile: () => contentHashForFile,
  isDecisionEvidenceV1: () => isDecisionEvidenceV1,
  isDecisionEvidenceV2: () => isDecisionEvidenceV2,
  parseDecisionEvidence: () => parseDecisionEvidence,
  serializeDecisionEvidence: () => serializeDecisionEvidence
});
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseRef(raw) {
  if (!isRecord(raw)) throw new Error("invalid ADR ref");
  const id = raw.id;
  const contentHash = raw.contentHash;
  if (typeof id !== "string" || !ADR_ID_RE.test(id)) {
    throw new Error("invalid ADR id");
  }
  if (typeof contentHash !== "string" || !HASH_RE.test(contentHash)) {
    throw new Error("invalid content hash");
  }
  return { id, contentHash };
}
function parseReviewedProposal(raw) {
  if (!isRecord(raw)) throw new Error("invalid reviewed proposal");
  const id = raw.id;
  const relation = raw.relation;
  if (typeof id !== "string" || !ADR_ID_RE.test(id)) {
    throw new Error("invalid reviewed proposal id");
  }
  if (relation !== "unrelated") {
    throw new Error("invalid reviewed proposal relation");
  }
  return { id, relation };
}
function parseOutcome(raw) {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    throw new Error("invalid outcome");
  }
  if (raw.kind === "accepted-adr") {
    if (!Array.isArray(raw.refs)) throw new Error("invalid refs");
    const refs = raw.refs.map(parseRef);
    const ids = /* @__PURE__ */ new Set();
    for (const ref of refs) {
      if (ids.has(ref.id)) throw new Error("duplicate ADR ref");
      ids.add(ref.id);
    }
    if (refs.length === 0) throw new Error("at least one accepted ADR ref is required");
    return { kind: "accepted-adr", refs };
  }
  if (raw.kind === "no-adr") {
    const reason = raw.reason;
    const rationale = raw.rationale;
    if (typeof reason !== "string" || !NO_ADR_REASONS.includes(reason)) {
      throw new Error("invalid no-adr reason");
    }
    if (typeof rationale !== "string" || rationale.trim().length === 0) {
      throw new Error("no-adr rationale must be non-empty");
    }
    return { kind: "no-adr", reason, rationale: rationale.trim() };
  }
  throw new Error("unknown outcome kind");
}
function parseReviewedProposals(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("reviewedProposals must be an array");
  }
  const reviewedProposals = raw.map(parseReviewedProposal);
  const reviewedIds = /* @__PURE__ */ new Set();
  for (const item of reviewedProposals) {
    if (reviewedIds.has(item.id)) throw new Error("duplicate reviewed proposal");
    reviewedIds.add(item.id);
  }
  return reviewedProposals;
}
function parseChangeSet(raw) {
  if (!isRecord(raw)) throw new Error("invalid change set");
  const algorithm = raw.algorithm;
  const digest = raw.digest;
  if (algorithm !== "git-change-set-v1") {
    throw new Error("unsupported change set algorithm");
  }
  if (typeof digest !== "string" || !HASH_RE.test(digest)) {
    throw new Error("invalid change set digest");
  }
  return { algorithm: "git-change-set-v1", digest };
}
function parseDecisionEvidence(raw) {
  if (!isRecord(raw)) throw new Error("decision evidence must be an object");
  const schemaVersion = raw.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error("unsupported decision evidence schema");
  }
  const decisionCorpusHash = raw.decisionCorpusHash;
  if (typeof decisionCorpusHash !== "string" || !HASH_RE.test(decisionCorpusHash)) {
    throw new Error("invalid decision corpus hash");
  }
  const outcome = parseOutcome(raw.outcome);
  const reviewedProposals = parseReviewedProposals(raw.reviewedProposals);
  if (schemaVersion === 1) {
    return {
      schemaVersion: 1,
      decisionCorpusHash,
      outcome,
      reviewedProposals
    };
  }
  const baseCommit = raw.baseCommit;
  if (typeof baseCommit !== "string" || !COMMIT_RE.test(baseCommit)) {
    throw new Error("invalid base commit");
  }
  const changeSet = parseChangeSet(raw.changeSet);
  return {
    schemaVersion: 2,
    baseCommit,
    decisionCorpusHash,
    changeSet,
    outcome,
    reviewedProposals
  };
}
function serializeDecisionEvidence(evidence) {
  const sortedReviewed = [...evidence.reviewedProposals].sort((a, b) => a.id.localeCompare(b.id));
  const sorted = evidence.outcome.kind === "accepted-adr" ? {
    ...evidence,
    outcome: {
      kind: "accepted-adr",
      refs: [...evidence.outcome.refs].sort((a, b) => a.id.localeCompare(b.id))
    },
    reviewedProposals: sortedReviewed
  } : {
    ...evidence,
    reviewedProposals: sortedReviewed
  };
  return JSON.stringify(sorted);
}
function contentHashForFile(content) {
  return `sha256:${sha256(content)}`;
}
function isDecisionEvidenceV1(evidence) {
  return evidence.schemaVersion === 1;
}
function isDecisionEvidenceV2(evidence) {
  return evidence.schemaVersion === 2;
}
var HASH_RE, COMMIT_RE, ADR_ID_RE;
var init_decision_evidence = __esm({
  "src/core/decision-evidence.ts"() {
    "use strict";
    init_types();
    init_numbering();
    HASH_RE = /^sha256:[a-f0-9]{64}$/;
    COMMIT_RE = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/;
    ADR_ID_RE = /^ADR-\d{4,}$/;
  }
});

// src/cli/git-diff.ts
var git_diff_exports = {};
__export(git_diff_exports, {
  listChangedPaths: () => listChangedPaths,
  listSnapshotChangedPaths: () => listSnapshotChangedPaths,
  readBlobAtRef: () => readBlobAtRef,
  readFileAtRef: () => readFileAtRef,
  readModeAtRef: () => readModeAtRef,
  refExists: () => refExists,
  resolveCommit: () => resolveCommit,
  resolveMergeBase: () => resolveMergeBase
});
import { execFile as execFile2 } from "node:child_process";
import { lstat as lstat3 } from "node:fs/promises";
import path11 from "node:path";
import { promisify as promisify2 } from "node:util";
async function git(repoRoot, args) {
  const { stdout } = await execFileAsync2("git", args, {
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout;
}
function normalizeRepoPath(relativePath) {
  return relativePath.split(path11.sep).join("/");
}
function parseNullSeparatedPaths(output) {
  if (!output) return [];
  const parts = output.split("\0").filter((part) => part.length > 0);
  return parts.map(normalizeRepoPath);
}
async function isIgnored(repoRoot, relativePath) {
  try {
    await git(repoRoot, ["check-ignore", "-q", "--", relativePath]);
    return true;
  } catch {
    return false;
  }
}
async function shouldIncludePath(repoRoot, relativePath) {
  const normalized = normalizeRepoPath(relativePath);
  if (!normalized || normalized.startsWith(STATE_PREFIX)) return false;
  if (await isIgnored(repoRoot, normalized)) return false;
  const abs = path11.join(repoRoot, normalized);
  try {
    const info = await lstat3(abs);
    if (info.isDirectory()) return false;
  } catch {
  }
  return true;
}
async function resolveCommit(repoRoot, ref) {
  const output = (await git(repoRoot, ["rev-parse", ref])).trim();
  if (!/^[a-f0-9]{40}$/.test(output)) {
    throw new Error(`invalid commit ref: ${ref}`);
  }
  return output;
}
async function resolveMergeBase(repoRoot, left, right) {
  const leftCommit = await resolveCommit(repoRoot, left);
  const rightCommit = await resolveCommit(repoRoot, right);
  const output = (await git(repoRoot, ["merge-base", leftCommit, rightCommit])).trim();
  if (!/^[a-f0-9]{40}$/.test(output)) {
    throw new Error(`merge-base unavailable for ${left} and ${right}`);
  }
  return output;
}
async function listSnapshotChangedPaths(repoRoot, baseRef) {
  const baseCommit = await resolveCommit(repoRoot, baseRef);
  const paths = /* @__PURE__ */ new Set();
  const diff = await git(repoRoot, [
    "diff",
    "--no-renames",
    "--name-only",
    "-z",
    `${baseCommit}...HEAD`
  ]);
  for (const relativePath of parseNullSeparatedPaths(diff)) {
    if (await shouldIncludePath(repoRoot, relativePath)) paths.add(relativePath);
  }
  const status = await git(repoRoot, ["status", "--porcelain", "-z", "--untracked-files=all"]);
  const entries = status.split("\0").filter((entry) => entry.length > 0);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const raw = entry.slice(3);
    if (code.startsWith("R") && raw.includes(" -> ")) {
      const [from, to] = raw.split(" -> ");
      if (from && await shouldIncludePath(repoRoot, from)) {
        paths.add(normalizeRepoPath(from));
      }
      if (to && await shouldIncludePath(repoRoot, to)) {
        paths.add(normalizeRepoPath(to));
      }
      continue;
    }
    if (code.startsWith("R") && !raw.includes(" -> ")) {
      if (raw && await shouldIncludePath(repoRoot, raw)) {
        paths.add(normalizeRepoPath(raw));
      }
      const source = entries[i + 1];
      if (source && !source.includes(" ")) {
        if (await shouldIncludePath(repoRoot, source)) {
          paths.add(normalizeRepoPath(source));
        }
        i += 1;
      }
      continue;
    }
    if (raw && await shouldIncludePath(repoRoot, raw)) {
      paths.add(normalizeRepoPath(raw));
    }
  }
  return [...paths].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
}
async function readBlobAtRef(repoRoot, ref, relativePath) {
  const normalized = normalizeRepoPath(relativePath);
  try {
    const { stdout } = await execFileAsync2("git", ["show", `${ref}:${normalized}`], {
      cwd: repoRoot,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "buffer"
    });
    return stdout;
  } catch {
    return null;
  }
}
async function readModeAtRef(repoRoot, ref, relativePath) {
  const normalized = normalizeRepoPath(relativePath);
  try {
    const output = (await git(repoRoot, ["ls-tree", ref, "--", normalized])).trim();
    if (!output) return null;
    const mode = output.split(/\s+/)[0];
    if (mode === "100644" || mode === "100755" || mode === "120000") return mode;
    return null;
  } catch {
    return null;
  }
}
function parsePathList(output) {
  return output.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}
async function listChangedPaths(repoRoot, baseRef) {
  const paths = /* @__PURE__ */ new Set();
  const diff = await git(repoRoot, ["diff", "--name-only", `${baseRef}...HEAD`]);
  for (const p of parsePathList(diff)) paths.add(p);
  const status = await git(repoRoot, ["status", "--porcelain", "-u", "--untracked-files=all"]);
  for (const line of status.split("\n")) {
    if (!line.trim()) continue;
    const raw = line.slice(3).trim();
    const filePath = raw.includes(" -> ") ? raw.split(" -> ").pop() ?? raw : raw;
    if (filePath) paths.add(filePath);
  }
  return [...paths].sort();
}
async function readFileAtRef(repoRoot, ref, relativePath) {
  const blob = await readBlobAtRef(repoRoot, ref, relativePath);
  if (blob === null) return null;
  return blob.toString("utf8").replace(/\r\n/g, "\n");
}
async function refExists(repoRoot, ref) {
  try {
    await git(repoRoot, ["rev-parse", "--verify", ref]);
    return true;
  } catch {
    return false;
  }
}
var execFileAsync2, STATE_PREFIX;
var init_git_diff = __esm({
  "src/cli/git-diff.ts"() {
    "use strict";
    execFileAsync2 = promisify2(execFile2);
    STATE_PREFIX = ".adr-governance/state/";
  }
});

// src/cli/github-evidence.ts
var github_evidence_exports = {};
__export(github_evidence_exports, {
  parseGitHubEventEvidence: () => parseGitHubEventEvidence,
  toGitHubMarkdown: () => toGitHubMarkdown
});
function parseGitHubEventEvidence(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw.pull_request?.body;
  if (typeof body !== "string") return null;
  const matches = [...body.matchAll(BLOCK_RE)];
  if (matches.length !== 1) return null;
  const jsonText = matches[0]?.[1]?.trim();
  if (!jsonText) return null;
  try {
    return parseDecisionEvidence(JSON.parse(jsonText));
  } catch {
    return null;
  }
}
function toGitHubMarkdown(evidence) {
  return ["```adr-governance", serializeDecisionEvidence(evidence), "```"].join("\n");
}
var BLOCK_RE;
var init_github_evidence = __esm({
  "src/cli/github-evidence.ts"() {
    "use strict";
    init_decision_evidence();
    BLOCK_RE = /```adr-governance\s*\n([\s\S]*?)\n```/g;
  }
});

// src/cli/main.ts
import path27 from "node:path";
import { fileURLToPath } from "node:url";

// src/cli/commands/init.ts
import { mkdir as mkdir3, readFile as readFile8, writeFile as writeFile2 } from "node:fs/promises";
import path10 from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";

// src/core/config.ts
init_types();
function defaultChangeGate(overrides = {}) {
  return {
    mode: "enforce",
    exemptPaths: [],
    ...overrides
  };
}
function defaultConfig(overrides = {}) {
  const base = {
    $schema: ".adr-governance/schema/adr-config.schema.json",
    version: SUPPORTED_CONFIG_VERSION,
    layout: {
      mode: "split",
      acceptedDir: "docs/adr",
      proposedDir: "docs/proposed-adr",
      contextFile: "CONTEXT.md",
      contextMapFile: "CONTEXT-MAP.md"
    },
    promotion: {
      requireHumanAcceptance: false
    },
    documents: {
      language: "ja",
      idDigits: 4,
      allowAcceptedClarifications: true,
      legacyFrontmatter: false
    },
    hooks: {
      enabled: true,
      afterTurnAudit: true,
      maxFollowUps: 1,
      timeoutMs: 1500
    },
    changeGate: defaultChangeGate(),
    analysis: {
      maxFiles: 2e3,
      maxBytesPerFile: 262144,
      exclude: [
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
  };
  return {
    ...base,
    ...overrides,
    layout: { ...base.layout, ...overrides.layout },
    promotion: { ...base.promotion, ...overrides.promotion },
    documents: { ...base.documents, ...overrides.documents },
    hooks: { ...base.hooks, ...overrides.hooks },
    changeGate: { ...base.changeGate, ...overrides.changeGate },
    analysis: { ...base.analysis, ...overrides.analysis }
  };
}
function parseChangeGate(raw, version) {
  const gate = defaultChangeGate(version === 1 ? { mode: "off" } : {});
  if (!raw || typeof raw !== "object") return gate;
  const obj = raw;
  if (version !== 1 && (obj.mode === "off" || obj.mode === "warn" || obj.mode === "enforce")) {
    gate.mode = obj.mode;
  }
  if (Array.isArray(obj.exemptPaths)) {
    gate.exemptPaths = obj.exemptPaths.filter((x) => typeof x === "string");
  }
  return gate;
}
function warnUnknownNestedKeys(warnings, section, raw, knownKeys) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const known = new Set(knownKeys);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) warnings.push(`Unknown config key: ${section}.${key}`);
  }
}
function parseConfig(raw) {
  const warnings = [];
  if (typeof raw !== "object" || raw === null) {
    throw new Error("adr.config.json must be a JSON object");
  }
  const obj = raw;
  const knownKeys = /* @__PURE__ */ new Set([
    "$schema",
    "version",
    "layout",
    "promotion",
    "documents",
    "hooks",
    "changeGate",
    "analysis"
  ]);
  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      warnings.push(`Unknown config key: ${key}`);
    }
  }
  const version = obj.version;
  if (typeof version !== "number" || !SUPPORTED_CONFIG_VERSIONS.includes(version)) {
    throw new Error(`Unsupported config version: ${String(version)}`);
  }
  if (version === 1) {
    warnings.push("Config v1 detected; changeGate defaults to off until migration to v2");
  }
  warnUnknownNestedKeys(warnings, "layout", obj.layout, [
    "mode",
    "acceptedDir",
    "proposedDir",
    "contextFile",
    "contextMapFile"
  ]);
  warnUnknownNestedKeys(warnings, "promotion", obj.promotion, ["requireHumanAcceptance"]);
  warnUnknownNestedKeys(warnings, "documents", obj.documents, [
    "language",
    "idDigits",
    "allowAcceptedClarifications",
    "legacyFrontmatter"
  ]);
  warnUnknownNestedKeys(warnings, "hooks", obj.hooks, [
    "enabled",
    "afterTurnAudit",
    "maxFollowUps",
    "timeoutMs"
  ]);
  warnUnknownNestedKeys(warnings, "changeGate", obj.changeGate, ["mode", "exemptPaths"]);
  warnUnknownNestedKeys(warnings, "analysis", obj.analysis, [
    "maxFiles",
    "maxBytesPerFile",
    "exclude"
  ]);
  const config = defaultConfig({ version });
  if (obj.$schema !== void 0) {
    config.$schema = String(obj.$schema);
  }
  const layout = obj.layout;
  if (layout && typeof layout === "object") {
    const l = layout;
    if (l.mode === "split" || l.mode === "single") config.layout.mode = l.mode;
    if (typeof l.acceptedDir === "string") config.layout.acceptedDir = l.acceptedDir;
    if (typeof l.proposedDir === "string") config.layout.proposedDir = l.proposedDir;
    if (typeof l.contextFile === "string") config.layout.contextFile = l.contextFile;
    if (typeof l.contextMapFile === "string") config.layout.contextMapFile = l.contextMapFile;
  }
  const promotion = obj.promotion;
  if (promotion && typeof promotion === "object") {
    const p = promotion;
    if (typeof p.requireHumanAcceptance === "boolean") {
      config.promotion.requireHumanAcceptance = p.requireHumanAcceptance;
    }
  }
  const documents = obj.documents;
  if (documents && typeof documents === "object") {
    const d = documents;
    if (d.language === "ja" || d.language === "en") config.documents.language = d.language;
    if (typeof d.idDigits === "number") config.documents.idDigits = d.idDigits;
    if (typeof d.allowAcceptedClarifications === "boolean") {
      config.documents.allowAcceptedClarifications = d.allowAcceptedClarifications;
    }
    if (typeof d.legacyFrontmatter === "boolean") {
      config.documents.legacyFrontmatter = d.legacyFrontmatter;
    }
  }
  const hooks = obj.hooks;
  if (hooks && typeof hooks === "object") {
    const h = hooks;
    if (typeof h.enabled === "boolean") config.hooks.enabled = h.enabled;
    if (typeof h.afterTurnAudit === "boolean") config.hooks.afterTurnAudit = h.afterTurnAudit;
    if (typeof h.maxFollowUps === "number") config.hooks.maxFollowUps = h.maxFollowUps;
    if (typeof h.timeoutMs === "number") {
      if (h.timeoutMs < 100 || h.timeoutMs > 1900) {
        throw new Error("hooks.timeoutMs must be between 100 and 1900");
      }
      config.hooks.timeoutMs = h.timeoutMs;
    }
  }
  config.changeGate = parseChangeGate(obj.changeGate, version);
  const analysis = obj.analysis;
  if (analysis && typeof analysis === "object") {
    const a = analysis;
    if (typeof a.maxFiles === "number") config.analysis.maxFiles = a.maxFiles;
    if (typeof a.maxBytesPerFile === "number") config.analysis.maxBytesPerFile = a.maxBytesPerFile;
    if (Array.isArray(a.exclude)) {
      config.analysis.exclude = a.exclude.filter((x) => typeof x === "string");
    }
  }
  return { config, warnings };
}
function configForSingleDir(dir) {
  return defaultConfig({
    layout: {
      mode: "single",
      acceptedDir: dir,
      proposedDir: dir,
      contextFile: "CONTEXT.md",
      contextMapFile: "CONTEXT-MAP.md"
    }
  });
}

// src/analysis/repository-scan.ts
init_numbering();
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
var AGENT_CONFIG_MARKERS = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursor/hooks.json",
  ".claude/settings.json",
  ".codex/hooks.json",
  ".gemini/settings.json"
];
var SECRET_PATTERNS = [
  /\.env/i,
  /secret/i,
  /credential/i,
  /\.pem$/i,
  /\.key$/i
];
function detectExistingLayout(repoRoot, trackedFiles) {
  const acceptedCandidates = ["docs/adr", "doc/adr", "adr", "docs/architecture/decisions"];
  const proposedCandidates = ["docs/proposed-adr", "docs/adr/proposed"];
  const acceptedDirs = acceptedCandidates.filter(
    (d) => trackedFiles.some((f) => f.startsWith(`${d}/`) || f === d)
  );
  const proposedDirs = proposedCandidates.filter(
    (d) => trackedFiles.some((f) => f.startsWith(`${d}/`) || f === d) || existsSync(path.join(repoRoot, d))
  );
  const contextFiles = trackedFiles.filter(
    (f) => f === "CONTEXT.md" || f.endsWith("/CONTEXT.md") || f === "CONTEXT-MAP.md"
  );
  const agentConfigFiles = AGENT_CONFIG_MARKERS.filter(
    (m) => trackedFiles.includes(m) || existsSync(path.join(repoRoot, m))
  );
  let detectedLayout = "none";
  if (acceptedDirs.includes("docs/adr") && proposedDirs.includes("docs/proposed-adr")) {
    detectedLayout = "split";
  } else if (acceptedDirs.length === 1 && proposedDirs.length === 0) {
    detectedLayout = "single";
  } else if (acceptedDirs.length > 0) {
    detectedLayout = "custom";
  }
  return { acceptedDirs, proposedDirs, contextFiles, agentConfigFiles, detectedLayout };
}
function shouldSkipFile(relativePath, exclude) {
  if (SECRET_PATTERNS.some((re) => re.test(relativePath))) return true;
  for (const pattern of exclude) {
    const normalized = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
    if (new RegExp(`^${normalized}$`).test(relativePath)) return true;
  }
  return false;
}
async function buildEvidenceBundle(repoRoot, trackedFiles, headSha, exclude) {
  const layout = detectExistingLayout(repoRoot, trackedFiles);
  const manifests = [];
  const candidateEvidence = [];
  const warnings = [];
  for (const file of trackedFiles) {
    if (shouldSkipFile(file, exclude)) continue;
    const abs = path.join(repoRoot, file);
    if (!existsSync(abs)) continue;
    if (file.endsWith("package.json") || file.endsWith("pnpm-workspace.yaml")) {
      try {
        const content = await readFile(abs, "utf8");
        const keys = file.endsWith(".json") ? Object.keys(JSON.parse(content)) : content.split("\n").filter((l) => l.trim().length > 0).slice(0, 20);
        manifests.push({
          path: file,
          kind: file.includes("workspace") ? "workspace" : "package",
          headingsOrKeys: keys
        });
      } catch {
        warnings.push(`Could not parse manifest: ${file}`);
      }
    }
    if (file.includes("schema") || file.includes("migration") || file.includes("wrangler") || file.includes(".github/workflows") || /\d{4}-.+\.md$/.test(file)) {
      try {
        const content = await readFile(abs, "utf8");
        const lines = content.split("\n").slice(0, 5).join("\n");
        candidateEvidence.push({
          category: file.includes("schema") ? "boundary" : "technology",
          path: file,
          line: 1,
          excerptHash: excerptHash(lines),
          summary: `${file} observed in repository`
        });
      } catch {
        warnings.push(`Could not read evidence file: ${file}`);
      }
    }
  }
  return {
    schemaVersion: 1,
    repository: {
      rootHash: sha256(repoRoot),
      headSha,
      trackedFileCount: trackedFiles.length
    },
    existingLayout: {
      acceptedDirs: layout.acceptedDirs,
      proposedDirs: layout.proposedDirs,
      contextFiles: layout.contextFiles,
      agentConfigFiles: layout.agentConfigFiles
    },
    manifests,
    candidateEvidence,
    warnings
  };
}

// src/analysis/init-hints.ts
init_lifecycle();
import { readFile as readFile3 } from "node:fs/promises";
import path3 from "node:path";
import { existsSync as existsSync3 } from "node:fs";

// src/core/repository-state.ts
init_validation();
import { existsSync as existsSync2 } from "node:fs";
import { readFile as readFile2, readdir, stat } from "node:fs/promises";
import path2 from "node:path";
var MANIFEST_PATH = ".adr-governance/manifest.json";
var STATE_DIR = ".adr-governance/state";
var LOCKS_DIR = ".adr-governance/state/locks";
async function listAdrFiles(dir) {
  if (!existsSync2(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md").map((e) => e.name);
}
async function loadAllAdrs(repoRoot, config) {
  const adrs = [];
  const acceptedDir = path2.join(repoRoot, config.layout.acceptedDir);
  const proposedDir = path2.join(repoRoot, config.layout.proposedDir);
  for (const name of await listAdrFiles(acceptedDir)) {
    const rel = path2.join(config.layout.acceptedDir, name);
    const content = await readFile2(path2.join(repoRoot, rel), "utf8");
    const parsed = parseAdrFromPath(rel, content, "accepted", config);
    if (parsed) adrs.push(parsed);
  }
  if (config.layout.mode === "split" || config.layout.acceptedDir !== config.layout.proposedDir) {
    for (const name of await listAdrFiles(proposedDir)) {
      const rel = path2.join(config.layout.proposedDir, name);
      const content = await readFile2(path2.join(repoRoot, rel), "utf8");
      const parsed = parseAdrFromPath(rel, content, "proposed", config);
      if (parsed) adrs.push(parsed);
    }
  }
  return adrs.sort((a, b) => a.number - b.number);
}
function isPathInsideRepo(repoRoot, targetPath) {
  const resolved = path2.resolve(repoRoot, targetPath);
  const relative = path2.relative(path2.resolve(repoRoot), resolved);
  return !relative.startsWith("..") && !path2.isAbsolute(relative);
}

// src/analysis/init-hints.ts
async function detectLegacyFrontmatter(repoRoot, config) {
  for (const dir of [config.acceptedDir, config.proposedDir]) {
    const abs = path3.join(repoRoot, dir);
    for (const name of await listAdrFiles(abs)) {
      const content = await readFile3(path3.join(abs, name), "utf8");
      if (!parseFrontmatter(content).frontmatter) return true;
    }
  }
  return false;
}
async function detectDocumentLanguage(repoRoot) {
  const contextPath = path3.join(repoRoot, "CONTEXT.md");
  if (existsSync3(contextPath)) {
    const sample = (await readFile3(contextPath, "utf8")).slice(0, 4e3);
    if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(sample)) return "ja";
  }
  const agentsPath = path3.join(repoRoot, "AGENTS.md");
  if (existsSync3(agentsPath)) {
    const sample = (await readFile3(agentsPath, "utf8")).slice(0, 4e3);
    if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(sample)) return "ja";
  }
  return "en";
}
function detectCiProvider(trackedFiles) {
  if (trackedFiles.some((f) => f.startsWith(".github/workflows/"))) {
    return "github-actions";
  }
  return null;
}
function ciWorkflowSuggestion() {
  return `# Generated by adr-governance \u2014 optional CI check
name: adr-governance
on:
  pull_request:
  push:
    branches: [main, develop]
jobs:
  adr-check-pr:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: >-
          node .adr-governance/bin/cli.mjs check
          --base "\${{ github.event.pull_request.base.sha }}"
          --github-event "$GITHUB_EVENT_PATH"
  adr-check-push:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: node .adr-governance/bin/cli.mjs check
`;
}

// src/cli/git.ts
import { execFile } from "node:child_process";
import { mkdir, rename } from "node:fs/promises";
import path4 from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
async function gitLsFiles(repoRoot) {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: repoRoot });
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
async function gitRevParse(repoRoot, ref) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", ref], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return null;
  }
}
async function gitRoot(startPath) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startPath
    });
    return stdout.trim();
  } catch {
    return null;
  }
}
async function gitMv(repoRoot, from, to) {
  await execFileAsync("git", ["mv", from, to], { cwd: repoRoot });
}
async function movePathInRepo(repoRoot, from, to) {
  try {
    await gitMv(repoRoot, from, to);
    return "git";
  } catch {
    const fromAbs = path4.join(repoRoot, from);
    const toAbs = path4.join(repoRoot, to);
    await mkdir(path4.dirname(toAbs), { recursive: true });
    await rename(fromAbs, toAbs);
    return "fs";
  }
}

// src/cli/commands/init.ts
init_numbering();

// src/installer/apply-plan.ts
init_numbering();
import { lstat as lstat2, readFile as readFile5 } from "node:fs/promises";
import { existsSync as existsSync5 } from "node:fs";
import path6 from "node:path";

// src/core/locks.ts
import { mkdir as mkdir2, open, readFile as readFile4, readdir as readdir2, rm, lstat, unlink, writeFile } from "node:fs/promises";
import { existsSync as existsSync4 } from "node:fs";
import path5 from "node:path";
var LOCK_STALE_MS = 10 * 60 * 1e3;
async function acquireLock(repoRoot, name, command) {
  const lockDir = path5.join(repoRoot, LOCKS_DIR);
  await mkdir2(lockDir, { recursive: true });
  const lockPath = path5.join(lockDir, `${name}.lock`);
  await cleanupStaleLocks(lockDir);
  try {
    const handle = await open(lockPath, "wx");
    const info = {
      pid: process.pid,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      command
    };
    await handle.writeFile(JSON.stringify(info, null, 2));
    await handle.close();
  } catch {
    throw new Error(`Could not acquire lock: ${name}. Another command may be running.`);
  }
  return async () => {
    if (existsSync4(lockPath)) {
      await unlink(lockPath);
    }
  };
}
async function cleanupStaleLocks(lockDir) {
  if (!existsSync4(lockDir)) return;
  const entries = await readdir2(lockDir);
  const now = Date.now();
  for (const entry of entries) {
    const lockPath = path5.join(lockDir, entry);
    try {
      const content = await readFile4(lockPath, "utf8");
      const info = JSON.parse(content);
      const age = now - new Date(info.startedAt).getTime();
      const stale = age > LOCK_STALE_MS;
      let alive = false;
      try {
        process.kill(info.pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
      if (!alive && stale) {
        await unlink(lockPath);
      }
    } catch {
      await unlink(lockPath).catch(() => void 0);
    }
  }
}
async function atomicWriteFile(targetPath, content) {
  const dir = path5.dirname(targetPath);
  await mkdir2(dir, { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(tempPath, content, "utf8");
  const { rename: rename2 } = await import("node:fs/promises");
  await rename2(tempPath, targetPath);
}

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js
function createScanner(text, ignoreTrivia = false) {
  const len = text.length;
  let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value2 = 0;
    while (digits < count || !exact) {
      let ch = text.charCodeAt(pos);
      if (ch >= 48 && ch <= 57) {
        value2 = value2 * 16 + ch - 48;
      } else if (ch >= 65 && ch <= 70) {
        value2 = value2 * 16 + ch - 65 + 10;
      } else if (ch >= 97 && ch <= 102) {
        value2 = value2 * 16 + ch - 97 + 10;
      } else {
        break;
      }
      pos++;
      digits++;
    }
    if (digits < count) {
      value2 = -1;
    }
    return value2;
  }
  function setPosition(newPosition) {
    pos = newPosition;
    value = "";
    tokenOffset = 0;
    token = 16;
    scanError = 0;
  }
  function scanNumber() {
    let start = pos;
    if (text.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text.length && text.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text.length && (text.charCodeAt(pos) === 69 || text.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text.length && text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text.charCodeAt(pos);
      if (ch === 34) {
        result += text.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result += text.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text.charCodeAt(pos++);
        switch (ch2) {
          case 34:
            result += '"';
            break;
          case 92:
            result += "\\";
            break;
          case 47:
            result += "/";
            break;
          case 98:
            result += "\b";
            break;
          case 102:
            result += "\f";
            break;
          case 110:
            result += "\n";
            break;
          case 114:
            result += "\r";
            break;
          case 116:
            result += "	";
            break;
          case 117:
            const ch3 = scanHexDigits(4, true);
            if (ch3 >= 0) {
              result += String.fromCharCode(ch3);
            } else {
              scanError = 4;
            }
            break;
          default:
            scanError = 5;
        }
        start = pos;
        continue;
      }
      if (ch >= 0 && ch <= 31) {
        if (isLineBreak(ch)) {
          result += text.substring(start, pos);
          scanError = 2;
          break;
        } else {
          scanError = 6;
        }
      }
      pos++;
    }
    return result;
  }
  function scanNext() {
    value = "";
    scanError = 0;
    tokenOffset = pos;
    lineStartOffset = lineNumber;
    prevTokenLineStartOffset = tokenLineStartOffset;
    if (pos >= len) {
      tokenOffset = len;
      return token = 17;
    }
    let code = text.charCodeAt(pos);
    if (isWhiteSpace(code)) {
      do {
        pos++;
        value += String.fromCharCode(code);
        code = text.charCodeAt(pos);
      } while (isWhiteSpace(code));
      return token = 15;
    }
    if (isLineBreak(code)) {
      pos++;
      value += String.fromCharCode(code);
      if (code === 13 && text.charCodeAt(pos) === 10) {
        pos++;
        value += "\n";
      }
      lineNumber++;
      tokenLineStartOffset = pos;
      return token = 14;
    }
    switch (code) {
      // tokens: []{}:,
      case 123:
        pos++;
        return token = 1;
      case 125:
        pos++;
        return token = 2;
      case 91:
        pos++;
        return token = 3;
      case 93:
        pos++;
        return token = 4;
      case 58:
        pos++;
        return token = 6;
      case 44:
        pos++;
        return token = 5;
      // strings
      case 34:
        pos++;
        value = scanString();
        return token = 10;
      // comments
      case 47:
        const start = pos - 1;
        if (text.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text.substring(start, pos);
          return token = 12;
        }
        if (text.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text.charCodeAt(pos);
            if (ch === 42 && text.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text.charCodeAt(pos) === 10) {
                pos++;
              }
              lineNumber++;
              tokenLineStartOffset = pos;
            }
          }
          if (!commentClosed) {
            pos++;
            scanError = 1;
          }
          value = text.substring(start, pos);
          return token = 13;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
      // numbers
      case 45:
        value += String.fromCharCode(code);
        pos++;
        if (pos === len || !isDigit(text.charCodeAt(pos))) {
          return token = 16;
        }
      // found a minus, followed by a number so
      // we fall through to proceed with scanning
      // numbers
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        value += scanNumber();
        return token = 11;
      // literals and unknown symbols
      default:
        while (pos < len && isUnknownContentCharacter(code)) {
          pos++;
          code = text.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text.substring(tokenOffset, pos);
          switch (value) {
            case "true":
              return token = 8;
            case "false":
              return token = 9;
            case "null":
              return token = 7;
          }
          return token = 16;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
    }
  }
  function isUnknownContentCharacter(code) {
    if (isWhiteSpace(code) || isLineBreak(code)) {
      return false;
    }
    switch (code) {
      case 125:
      case 93:
      case 123:
      case 91:
      case 34:
      case 58:
      case 44:
      case 47:
        return false;
    }
    return true;
  }
  function scanNextNonTrivia() {
    let result;
    do {
      result = scanNext();
    } while (result >= 12 && result <= 15);
    return result;
  }
  return {
    setPosition,
    getPosition: () => pos,
    scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
    getToken: () => token,
    getTokenValue: () => value,
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenStartLine: () => lineStartOffset,
    getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
    getTokenError: () => scanError
  };
}
function isWhiteSpace(ch) {
  return ch === 32 || ch === 9;
}
function isLineBreak(ch) {
  return ch === 10 || ch === 13;
}
function isDigit(ch) {
  return ch >= 48 && ch <= 57;
}
var CharacterCodes;
(function(CharacterCodes2) {
  CharacterCodes2[CharacterCodes2["lineFeed"] = 10] = "lineFeed";
  CharacterCodes2[CharacterCodes2["carriageReturn"] = 13] = "carriageReturn";
  CharacterCodes2[CharacterCodes2["space"] = 32] = "space";
  CharacterCodes2[CharacterCodes2["_0"] = 48] = "_0";
  CharacterCodes2[CharacterCodes2["_1"] = 49] = "_1";
  CharacterCodes2[CharacterCodes2["_2"] = 50] = "_2";
  CharacterCodes2[CharacterCodes2["_3"] = 51] = "_3";
  CharacterCodes2[CharacterCodes2["_4"] = 52] = "_4";
  CharacterCodes2[CharacterCodes2["_5"] = 53] = "_5";
  CharacterCodes2[CharacterCodes2["_6"] = 54] = "_6";
  CharacterCodes2[CharacterCodes2["_7"] = 55] = "_7";
  CharacterCodes2[CharacterCodes2["_8"] = 56] = "_8";
  CharacterCodes2[CharacterCodes2["_9"] = 57] = "_9";
  CharacterCodes2[CharacterCodes2["a"] = 97] = "a";
  CharacterCodes2[CharacterCodes2["b"] = 98] = "b";
  CharacterCodes2[CharacterCodes2["c"] = 99] = "c";
  CharacterCodes2[CharacterCodes2["d"] = 100] = "d";
  CharacterCodes2[CharacterCodes2["e"] = 101] = "e";
  CharacterCodes2[CharacterCodes2["f"] = 102] = "f";
  CharacterCodes2[CharacterCodes2["g"] = 103] = "g";
  CharacterCodes2[CharacterCodes2["h"] = 104] = "h";
  CharacterCodes2[CharacterCodes2["i"] = 105] = "i";
  CharacterCodes2[CharacterCodes2["j"] = 106] = "j";
  CharacterCodes2[CharacterCodes2["k"] = 107] = "k";
  CharacterCodes2[CharacterCodes2["l"] = 108] = "l";
  CharacterCodes2[CharacterCodes2["m"] = 109] = "m";
  CharacterCodes2[CharacterCodes2["n"] = 110] = "n";
  CharacterCodes2[CharacterCodes2["o"] = 111] = "o";
  CharacterCodes2[CharacterCodes2["p"] = 112] = "p";
  CharacterCodes2[CharacterCodes2["q"] = 113] = "q";
  CharacterCodes2[CharacterCodes2["r"] = 114] = "r";
  CharacterCodes2[CharacterCodes2["s"] = 115] = "s";
  CharacterCodes2[CharacterCodes2["t"] = 116] = "t";
  CharacterCodes2[CharacterCodes2["u"] = 117] = "u";
  CharacterCodes2[CharacterCodes2["v"] = 118] = "v";
  CharacterCodes2[CharacterCodes2["w"] = 119] = "w";
  CharacterCodes2[CharacterCodes2["x"] = 120] = "x";
  CharacterCodes2[CharacterCodes2["y"] = 121] = "y";
  CharacterCodes2[CharacterCodes2["z"] = 122] = "z";
  CharacterCodes2[CharacterCodes2["A"] = 65] = "A";
  CharacterCodes2[CharacterCodes2["B"] = 66] = "B";
  CharacterCodes2[CharacterCodes2["C"] = 67] = "C";
  CharacterCodes2[CharacterCodes2["D"] = 68] = "D";
  CharacterCodes2[CharacterCodes2["E"] = 69] = "E";
  CharacterCodes2[CharacterCodes2["F"] = 70] = "F";
  CharacterCodes2[CharacterCodes2["G"] = 71] = "G";
  CharacterCodes2[CharacterCodes2["H"] = 72] = "H";
  CharacterCodes2[CharacterCodes2["I"] = 73] = "I";
  CharacterCodes2[CharacterCodes2["J"] = 74] = "J";
  CharacterCodes2[CharacterCodes2["K"] = 75] = "K";
  CharacterCodes2[CharacterCodes2["L"] = 76] = "L";
  CharacterCodes2[CharacterCodes2["M"] = 77] = "M";
  CharacterCodes2[CharacterCodes2["N"] = 78] = "N";
  CharacterCodes2[CharacterCodes2["O"] = 79] = "O";
  CharacterCodes2[CharacterCodes2["P"] = 80] = "P";
  CharacterCodes2[CharacterCodes2["Q"] = 81] = "Q";
  CharacterCodes2[CharacterCodes2["R"] = 82] = "R";
  CharacterCodes2[CharacterCodes2["S"] = 83] = "S";
  CharacterCodes2[CharacterCodes2["T"] = 84] = "T";
  CharacterCodes2[CharacterCodes2["U"] = 85] = "U";
  CharacterCodes2[CharacterCodes2["V"] = 86] = "V";
  CharacterCodes2[CharacterCodes2["W"] = 87] = "W";
  CharacterCodes2[CharacterCodes2["X"] = 88] = "X";
  CharacterCodes2[CharacterCodes2["Y"] = 89] = "Y";
  CharacterCodes2[CharacterCodes2["Z"] = 90] = "Z";
  CharacterCodes2[CharacterCodes2["asterisk"] = 42] = "asterisk";
  CharacterCodes2[CharacterCodes2["backslash"] = 92] = "backslash";
  CharacterCodes2[CharacterCodes2["closeBrace"] = 125] = "closeBrace";
  CharacterCodes2[CharacterCodes2["closeBracket"] = 93] = "closeBracket";
  CharacterCodes2[CharacterCodes2["colon"] = 58] = "colon";
  CharacterCodes2[CharacterCodes2["comma"] = 44] = "comma";
  CharacterCodes2[CharacterCodes2["dot"] = 46] = "dot";
  CharacterCodes2[CharacterCodes2["doubleQuote"] = 34] = "doubleQuote";
  CharacterCodes2[CharacterCodes2["minus"] = 45] = "minus";
  CharacterCodes2[CharacterCodes2["openBrace"] = 123] = "openBrace";
  CharacterCodes2[CharacterCodes2["openBracket"] = 91] = "openBracket";
  CharacterCodes2[CharacterCodes2["plus"] = 43] = "plus";
  CharacterCodes2[CharacterCodes2["slash"] = 47] = "slash";
  CharacterCodes2[CharacterCodes2["formFeed"] = 12] = "formFeed";
  CharacterCodes2[CharacterCodes2["tab"] = 9] = "tab";
})(CharacterCodes || (CharacterCodes = {}));

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/string-intern.js
var cachedSpaces = new Array(20).fill(0).map((_, index) => {
  return " ".repeat(index);
});
var maxCachedValues = 200;
var cachedBreakLinesWithSpaces = {
  " ": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + " ".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + " ".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + " ".repeat(index);
    })
  },
  "	": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + "	".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + "	".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + "	".repeat(index);
    })
  }
};
var supportedEols = ["\n", "\r", "\r\n"];

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/format.js
function format(documentText, range, options) {
  let initialIndentLevel;
  let formatText;
  let formatTextStart;
  let rangeStart;
  let rangeEnd;
  if (range) {
    rangeStart = range.offset;
    rangeEnd = rangeStart + range.length;
    formatTextStart = rangeStart;
    while (formatTextStart > 0 && !isEOL(documentText, formatTextStart - 1)) {
      formatTextStart--;
    }
    let endOffset = rangeEnd;
    while (endOffset < documentText.length && !isEOL(documentText, endOffset)) {
      endOffset++;
    }
    formatText = documentText.substring(formatTextStart, endOffset);
    initialIndentLevel = computeIndentLevel(formatText, options);
  } else {
    formatText = documentText;
    initialIndentLevel = 0;
    formatTextStart = 0;
    rangeStart = 0;
    rangeEnd = documentText.length;
  }
  const eol = getEOL(options, documentText);
  const eolFastPathSupported = supportedEols.includes(eol);
  let numberLineBreaks = 0;
  let indentLevel = 0;
  let indentValue;
  if (options.insertSpaces) {
    indentValue = cachedSpaces[options.tabSize || 4] ?? repeat(cachedSpaces[1], options.tabSize || 4);
  } else {
    indentValue = "	";
  }
  const indentType = indentValue === "	" ? "	" : " ";
  let scanner = createScanner(formatText, false);
  let hasError = false;
  function newLinesAndIndent() {
    if (numberLineBreaks > 1) {
      return repeat(eol, numberLineBreaks) + repeat(indentValue, initialIndentLevel + indentLevel);
    }
    const amountOfSpaces = indentValue.length * (initialIndentLevel + indentLevel);
    if (!eolFastPathSupported || amountOfSpaces > cachedBreakLinesWithSpaces[indentType][eol].length) {
      return eol + repeat(indentValue, initialIndentLevel + indentLevel);
    }
    if (amountOfSpaces <= 0) {
      return eol;
    }
    return cachedBreakLinesWithSpaces[indentType][eol][amountOfSpaces];
  }
  function scanNext() {
    let token = scanner.scan();
    numberLineBreaks = 0;
    while (token === 15 || token === 14) {
      if (token === 14 && options.keepLines) {
        numberLineBreaks += 1;
      } else if (token === 14) {
        numberLineBreaks = 1;
      }
      token = scanner.scan();
    }
    hasError = token === 16 || scanner.getTokenError() !== 0;
    return token;
  }
  const editOperations = [];
  function addEdit(text, startOffset, endOffset) {
    if (!hasError && (!range || startOffset < rangeEnd && endOffset > rangeStart) && documentText.substring(startOffset, endOffset) !== text) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text });
    }
  }
  let firstToken = scanNext();
  if (options.keepLines && numberLineBreaks > 0) {
    addEdit(repeat(eol, numberLineBreaks), 0, 0);
  }
  if (firstToken !== 17) {
    let firstTokenStart = scanner.getTokenOffset() + formatTextStart;
    let initialIndent = indentValue.length * initialIndentLevel < 20 && options.insertSpaces ? cachedSpaces[indentValue.length * initialIndentLevel] : repeat(indentValue, initialIndentLevel);
    addEdit(initialIndent, formatTextStart, firstTokenStart);
  }
  while (firstToken !== 17) {
    let firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
    let secondToken = scanNext();
    let replaceContent = "";
    let needsLineBreak = false;
    while (numberLineBreaks === 0 && (secondToken === 12 || secondToken === 13)) {
      let commentTokenStart = scanner.getTokenOffset() + formatTextStart;
      addEdit(cachedSpaces[1], firstTokenEnd, commentTokenStart);
      firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
      needsLineBreak = secondToken === 12;
      replaceContent = needsLineBreak ? newLinesAndIndent() : "";
      secondToken = scanNext();
    }
    if (secondToken === 2) {
      if (firstToken !== 1) {
        indentLevel--;
      }
      ;
      if (options.keepLines && numberLineBreaks > 0 || !options.keepLines && firstToken !== 1) {
        replaceContent = newLinesAndIndent();
      } else if (options.keepLines) {
        replaceContent = cachedSpaces[1];
      }
    } else if (secondToken === 4) {
      if (firstToken !== 3) {
        indentLevel--;
      }
      ;
      if (options.keepLines && numberLineBreaks > 0 || !options.keepLines && firstToken !== 3) {
        replaceContent = newLinesAndIndent();
      } else if (options.keepLines) {
        replaceContent = cachedSpaces[1];
      }
    } else {
      switch (firstToken) {
        case 3:
        case 1:
          indentLevel++;
          if (options.keepLines && numberLineBreaks > 0 || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 5:
          if (options.keepLines && numberLineBreaks > 0 || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 12:
          replaceContent = newLinesAndIndent();
          break;
        case 13:
          if (numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 6:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = cachedSpaces[1];
          }
          break;
        case 10:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (secondToken === 6 && !needsLineBreak) {
            replaceContent = "";
          }
          break;
        case 7:
        case 8:
        case 9:
        case 11:
        case 2:
        case 4:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else {
            if ((secondToken === 12 || secondToken === 13) && !needsLineBreak) {
              replaceContent = cachedSpaces[1];
            } else if (secondToken !== 5 && secondToken !== 17) {
              hasError = true;
            }
          }
          break;
        case 16:
          hasError = true;
          break;
      }
      if (numberLineBreaks > 0 && (secondToken === 12 || secondToken === 13)) {
        replaceContent = newLinesAndIndent();
      }
    }
    if (secondToken === 17) {
      if (options.keepLines && numberLineBreaks > 0) {
        replaceContent = newLinesAndIndent();
      } else {
        replaceContent = options.insertFinalNewline ? eol : "";
      }
    }
    const secondTokenStart = scanner.getTokenOffset() + formatTextStart;
    addEdit(replaceContent, firstTokenEnd, secondTokenStart);
    firstToken = secondToken;
  }
  return editOperations;
}
function repeat(s, count) {
  let result = "";
  for (let i = 0; i < count; i++) {
    result += s;
  }
  return result;
}
function computeIndentLevel(content, options) {
  let i = 0;
  let nChars = 0;
  const tabSize = options.tabSize || 4;
  while (i < content.length) {
    let ch = content.charAt(i);
    if (ch === cachedSpaces[1]) {
      nChars++;
    } else if (ch === "	") {
      nChars += tabSize;
    } else {
      break;
    }
    i++;
  }
  return Math.floor(nChars / tabSize);
}
function getEOL(options, text) {
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\r") {
      if (i + 1 < text.length && text.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return "\r";
    } else if (ch === "\n") {
      return "\n";
    }
  }
  return options && options.eol || "\n";
}
function isEOL(text, offset) {
  return "\r\n".indexOf(text.charAt(offset)) !== -1;
}

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
function parseTree(text, errors = [], options = ParseOptions.DEFAULT) {
  let currentParent = { type: "array", offset: -1, length: -1, children: [], parent: void 0 };
  function ensurePropertyComplete(endOffset) {
    if (currentParent.type === "property") {
      currentParent.length = endOffset - currentParent.offset;
      currentParent = currentParent.parent;
    }
  }
  function onValue(valueNode) {
    currentParent.children.push(valueNode);
    return valueNode;
  }
  const visitor = {
    onObjectBegin: (offset) => {
      currentParent = onValue({ type: "object", offset, length: -1, parent: currentParent, children: [] });
    },
    onObjectProperty: (name, offset, length) => {
      currentParent = onValue({ type: "property", offset, length: -1, parent: currentParent, children: [] });
      currentParent.children.push({ type: "string", value: name, offset, length, parent: currentParent });
    },
    onObjectEnd: (offset, length) => {
      ensurePropertyComplete(offset + length);
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onArrayBegin: (offset, length) => {
      currentParent = onValue({ type: "array", offset, length: -1, parent: currentParent, children: [] });
    },
    onArrayEnd: (offset, length) => {
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onLiteralValue: (value, offset, length) => {
      onValue({ type: getNodeType(value), offset, length, parent: currentParent, value });
      ensurePropertyComplete(offset + length);
    },
    onSeparator: (sep, offset, length) => {
      if (currentParent.type === "property") {
        if (sep === ":") {
          currentParent.colonOffset = offset;
        } else if (sep === ",") {
          ensurePropertyComplete(offset);
        }
      }
    },
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text, visitor, options);
  const result = currentParent.children[0];
  if (result) {
    delete result.parent;
  }
  return result;
}
function findNodeAtLocation(root, path28) {
  if (!root) {
    return void 0;
  }
  let node = root;
  for (let segment of path28) {
    if (typeof segment === "string") {
      if (node.type !== "object" || !Array.isArray(node.children)) {
        return void 0;
      }
      let found = false;
      for (const propertyNode of node.children) {
        if (Array.isArray(propertyNode.children) && propertyNode.children[0].value === segment && propertyNode.children.length === 2) {
          node = propertyNode.children[1];
          found = true;
          break;
        }
      }
      if (!found) {
        return void 0;
      }
    } else {
      const index = segment;
      if (node.type !== "array" || index < 0 || !Array.isArray(node.children) || index >= node.children.length) {
        return void 0;
      }
      node = node.children[index];
    }
  }
  return node;
}
function visit(text, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text, false);
  const _jsonPath = [];
  let suppressedCallbacks = 0;
  function toNoArgVisit(visitFunction) {
    return visitFunction ? () => suppressedCallbacks === 0 && visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisit(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisitWithPath(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice()) : () => true;
  }
  function toBeginVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks++;
      } else {
        let cbReturn = visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice());
        if (cbReturn === false) {
          suppressedCallbacks = 1;
        }
      }
    } : () => true;
  }
  function toEndVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks--;
      }
      if (suppressedCallbacks === 0) {
        visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter());
      }
    } : () => true;
  }
  const onObjectBegin = toBeginVisit(visitor.onObjectBegin), onObjectProperty = toOneArgVisitWithPath(visitor.onObjectProperty), onObjectEnd = toEndVisit(visitor.onObjectEnd), onArrayBegin = toBeginVisit(visitor.onArrayBegin), onArrayEnd = toEndVisit(visitor.onArrayEnd), onLiteralValue = toOneArgVisitWithPath(visitor.onLiteralValue), onSeparator = toOneArgVisit(visitor.onSeparator), onComment = toNoArgVisit(visitor.onComment), onError = toOneArgVisit(visitor.onError);
  const disallowComments = options && options.disallowComments;
  const allowTrailingComma = options && options.allowTrailingComma;
  function scanNext() {
    while (true) {
      const token = _scanner.scan();
      switch (_scanner.getTokenError()) {
        case 4:
          handleError(
            14
            /* ParseErrorCode.InvalidUnicode */
          );
          break;
        case 5:
          handleError(
            15
            /* ParseErrorCode.InvalidEscapeCharacter */
          );
          break;
        case 3:
          handleError(
            13
            /* ParseErrorCode.UnexpectedEndOfNumber */
          );
          break;
        case 1:
          if (!disallowComments) {
            handleError(
              11
              /* ParseErrorCode.UnexpectedEndOfComment */
            );
          }
          break;
        case 2:
          handleError(
            12
            /* ParseErrorCode.UnexpectedEndOfString */
          );
          break;
        case 6:
          handleError(
            16
            /* ParseErrorCode.InvalidCharacter */
          );
          break;
      }
      switch (token) {
        case 12:
        case 13:
          if (disallowComments) {
            handleError(
              10
              /* ParseErrorCode.InvalidCommentToken */
            );
          } else {
            onComment();
          }
          break;
        case 16:
          handleError(
            1
            /* ParseErrorCode.InvalidSymbol */
          );
          break;
        case 15:
        case 14:
          break;
        default:
          return token;
      }
    }
  }
  function handleError(error, skipUntilAfter = [], skipUntil = []) {
    onError(error);
    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token = _scanner.getToken();
      while (token !== 17) {
        if (skipUntilAfter.indexOf(token) !== -1) {
          scanNext();
          break;
        } else if (skipUntil.indexOf(token) !== -1) {
          break;
        }
        token = scanNext();
      }
    }
  }
  function parseString(isValue) {
    const value = _scanner.getTokenValue();
    if (isValue) {
      onLiteralValue(value);
    } else {
      onObjectProperty(value);
      _jsonPath.push(value);
    }
    scanNext();
    return true;
  }
  function parseLiteral() {
    switch (_scanner.getToken()) {
      case 11:
        const tokenValue = _scanner.getTokenValue();
        let value = Number(tokenValue);
        if (isNaN(value)) {
          handleError(
            2
            /* ParseErrorCode.InvalidNumberFormat */
          );
          value = 0;
        }
        onLiteralValue(value);
        break;
      case 7:
        onLiteralValue(null);
        break;
      case 8:
        onLiteralValue(true);
        break;
      case 9:
        onLiteralValue(false);
        break;
      default:
        return false;
    }
    scanNext();
    return true;
  }
  function parseProperty() {
    if (_scanner.getToken() !== 10) {
      handleError(3, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]);
      return false;
    }
    parseString(false);
    if (_scanner.getToken() === 6) {
      onSeparator(":");
      scanNext();
      if (!parseValue()) {
        handleError(4, [], [
          2,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
    } else {
      handleError(5, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]);
    }
    _jsonPath.pop();
    return true;
  }
  function parseObject() {
    onObjectBegin();
    scanNext();
    let needsComma = false;
    while (_scanner.getToken() !== 2 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 2 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (!parseProperty()) {
        handleError(4, [], [
          2,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
      needsComma = true;
    }
    onObjectEnd();
    if (_scanner.getToken() !== 2) {
      handleError(7, [
        2
        /* SyntaxKind.CloseBraceToken */
      ], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseArray() {
    onArrayBegin();
    scanNext();
    let isFirstElement = true;
    let needsComma = false;
    while (_scanner.getToken() !== 4 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 4 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (isFirstElement) {
        _jsonPath.push(0);
        isFirstElement = false;
      } else {
        _jsonPath[_jsonPath.length - 1]++;
      }
      if (!parseValue()) {
        handleError(4, [], [
          4,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
      needsComma = true;
    }
    onArrayEnd();
    if (!isFirstElement) {
      _jsonPath.pop();
    }
    if (_scanner.getToken() !== 4) {
      handleError(8, [
        4
        /* SyntaxKind.CloseBracketToken */
      ], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseValue() {
    switch (_scanner.getToken()) {
      case 3:
        return parseArray();
      case 1:
        return parseObject();
      case 10:
        return parseString(true);
      default:
        return parseLiteral();
    }
  }
  scanNext();
  if (_scanner.getToken() === 17) {
    if (options.allowEmptyContent) {
      return true;
    }
    handleError(4, [], []);
    return false;
  }
  if (!parseValue()) {
    handleError(4, [], []);
    return false;
  }
  if (_scanner.getToken() !== 17) {
    handleError(9, [], []);
  }
  return true;
}
function getNodeType(value) {
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object": {
      if (!value) {
        return "null";
      } else if (Array.isArray(value)) {
        return "array";
      }
      return "object";
    }
    default:
      return "null";
  }
}

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/edit.js
function setProperty(text, originalPath, value, options) {
  const path28 = originalPath.slice();
  const errors = [];
  const root = parseTree(text, errors);
  let parent = void 0;
  let lastSegment = void 0;
  while (path28.length > 0) {
    lastSegment = path28.pop();
    parent = findNodeAtLocation(root, path28);
    if (parent === void 0 && value !== void 0) {
      if (typeof lastSegment === "string") {
        value = { [lastSegment]: value };
      } else {
        value = [value];
      }
    } else {
      break;
    }
  }
  if (!parent) {
    if (value === void 0) {
      throw new Error("Can not delete in empty document");
    }
    return withFormatting(text, { offset: root ? root.offset : 0, length: root ? root.length : 0, content: JSON.stringify(value) }, options);
  } else if (parent.type === "object" && typeof lastSegment === "string" && Array.isArray(parent.children)) {
    const existing = findNodeAtLocation(parent, [lastSegment]);
    if (existing !== void 0) {
      if (value === void 0) {
        if (!existing.parent) {
          throw new Error("Malformed AST");
        }
        const propertyIndex = parent.children.indexOf(existing.parent);
        let removeBegin;
        let removeEnd = existing.parent.offset + existing.parent.length;
        if (propertyIndex > 0) {
          let previous = parent.children[propertyIndex - 1];
          removeBegin = previous.offset + previous.length;
        } else {
          removeBegin = parent.offset + 1;
          if (parent.children.length > 1) {
            let next = parent.children[1];
            removeEnd = next.offset;
          }
        }
        return withFormatting(text, { offset: removeBegin, length: removeEnd - removeBegin, content: "" }, options);
      } else {
        return withFormatting(text, { offset: existing.offset, length: existing.length, content: JSON.stringify(value) }, options);
      }
    } else {
      if (value === void 0) {
        return [];
      }
      const newProperty = `${JSON.stringify(lastSegment)}: ${JSON.stringify(value)}`;
      const index = options.getInsertionIndex ? options.getInsertionIndex(parent.children.map((p) => p.children[0].value)) : parent.children.length;
      let edit;
      if (index > 0) {
        let previous = parent.children[index - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      } else if (parent.children.length === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty };
      } else {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty + "," };
      }
      return withFormatting(text, edit, options);
    }
  } else if (parent.type === "array" && typeof lastSegment === "number" && Array.isArray(parent.children)) {
    const insertIndex = lastSegment;
    if (insertIndex === -1) {
      const newProperty = `${JSON.stringify(value)}`;
      let edit;
      if (parent.children.length === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: newProperty };
      } else {
        const previous = parent.children[parent.children.length - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      }
      return withFormatting(text, edit, options);
    } else if (value === void 0 && parent.children.length >= 0) {
      const removalIndex = lastSegment;
      const toRemove = parent.children[removalIndex];
      let edit;
      if (parent.children.length === 1) {
        edit = { offset: parent.offset + 1, length: parent.length - 2, content: "" };
      } else if (parent.children.length - 1 === removalIndex) {
        let previous = parent.children[removalIndex - 1];
        let offset = previous.offset + previous.length;
        let parentEndOffset = parent.offset + parent.length;
        edit = { offset, length: parentEndOffset - 2 - offset, content: "" };
      } else {
        edit = { offset: toRemove.offset, length: parent.children[removalIndex + 1].offset - toRemove.offset, content: "" };
      }
      return withFormatting(text, edit, options);
    } else if (value !== void 0) {
      let edit;
      const newProperty = `${JSON.stringify(value)}`;
      if (!options.isArrayInsertion && parent.children.length > lastSegment) {
        const toModify = parent.children[lastSegment];
        edit = { offset: toModify.offset, length: toModify.length, content: newProperty };
      } else if (parent.children.length === 0 || lastSegment === 0) {
        edit = { offset: parent.offset + 1, length: 0, content: parent.children.length === 0 ? newProperty : newProperty + "," };
      } else {
        const index = lastSegment > parent.children.length ? parent.children.length : lastSegment;
        const previous = parent.children[index - 1];
        edit = { offset: previous.offset + previous.length, length: 0, content: "," + newProperty };
      }
      return withFormatting(text, edit, options);
    } else {
      throw new Error(`Can not ${value === void 0 ? "remove" : options.isArrayInsertion ? "insert" : "modify"} Array index ${insertIndex} as length is not sufficient`);
    }
  } else {
    throw new Error(`Can not add ${typeof lastSegment !== "number" ? "index" : "property"} to parent of type ${parent.type}`);
  }
}
function withFormatting(text, edit, options) {
  if (!options.formattingOptions) {
    return [edit];
  }
  let newText = applyEdit(text, edit);
  let begin = edit.offset;
  let end = edit.offset + edit.content.length;
  if (edit.length === 0 || edit.content.length === 0) {
    while (begin > 0 && !isEOL(newText, begin - 1)) {
      begin--;
    }
    while (end < newText.length && !isEOL(newText, end)) {
      end++;
    }
  }
  const edits = format(newText, { offset: begin, length: end - begin }, { ...options.formattingOptions, keepLines: false });
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit2 = edits[i];
    newText = applyEdit(newText, edit2);
    begin = Math.min(begin, edit2.offset);
    end = Math.max(end, edit2.offset + edit2.length);
    end += edit2.content.length - edit2.length;
  }
  const editLength = text.length - (newText.length - end) - begin;
  return [{ offset: begin, length: editLength, content: newText.substring(begin, end) }];
}
function applyEdit(text, edit) {
  return text.substring(0, edit.offset) + edit.content + text.substring(edit.offset + edit.length);
}

// node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js
var ScanError;
(function(ScanError2) {
  ScanError2[ScanError2["None"] = 0] = "None";
  ScanError2[ScanError2["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
  ScanError2[ScanError2["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
  ScanError2[ScanError2["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
  ScanError2[ScanError2["InvalidUnicode"] = 4] = "InvalidUnicode";
  ScanError2[ScanError2["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
  ScanError2[ScanError2["InvalidCharacter"] = 6] = "InvalidCharacter";
})(ScanError || (ScanError = {}));
var SyntaxKind;
(function(SyntaxKind2) {
  SyntaxKind2[SyntaxKind2["OpenBraceToken"] = 1] = "OpenBraceToken";
  SyntaxKind2[SyntaxKind2["CloseBraceToken"] = 2] = "CloseBraceToken";
  SyntaxKind2[SyntaxKind2["OpenBracketToken"] = 3] = "OpenBracketToken";
  SyntaxKind2[SyntaxKind2["CloseBracketToken"] = 4] = "CloseBracketToken";
  SyntaxKind2[SyntaxKind2["CommaToken"] = 5] = "CommaToken";
  SyntaxKind2[SyntaxKind2["ColonToken"] = 6] = "ColonToken";
  SyntaxKind2[SyntaxKind2["NullKeyword"] = 7] = "NullKeyword";
  SyntaxKind2[SyntaxKind2["TrueKeyword"] = 8] = "TrueKeyword";
  SyntaxKind2[SyntaxKind2["FalseKeyword"] = 9] = "FalseKeyword";
  SyntaxKind2[SyntaxKind2["StringLiteral"] = 10] = "StringLiteral";
  SyntaxKind2[SyntaxKind2["NumericLiteral"] = 11] = "NumericLiteral";
  SyntaxKind2[SyntaxKind2["LineCommentTrivia"] = 12] = "LineCommentTrivia";
  SyntaxKind2[SyntaxKind2["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
  SyntaxKind2[SyntaxKind2["LineBreakTrivia"] = 14] = "LineBreakTrivia";
  SyntaxKind2[SyntaxKind2["Trivia"] = 15] = "Trivia";
  SyntaxKind2[SyntaxKind2["Unknown"] = 16] = "Unknown";
  SyntaxKind2[SyntaxKind2["EOF"] = 17] = "EOF";
})(SyntaxKind || (SyntaxKind = {}));
var ParseErrorCode;
(function(ParseErrorCode2) {
  ParseErrorCode2[ParseErrorCode2["InvalidSymbol"] = 1] = "InvalidSymbol";
  ParseErrorCode2[ParseErrorCode2["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
  ParseErrorCode2[ParseErrorCode2["PropertyNameExpected"] = 3] = "PropertyNameExpected";
  ParseErrorCode2[ParseErrorCode2["ValueExpected"] = 4] = "ValueExpected";
  ParseErrorCode2[ParseErrorCode2["ColonExpected"] = 5] = "ColonExpected";
  ParseErrorCode2[ParseErrorCode2["CommaExpected"] = 6] = "CommaExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBraceExpected"] = 7] = "CloseBraceExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBracketExpected"] = 8] = "CloseBracketExpected";
  ParseErrorCode2[ParseErrorCode2["EndOfFileExpected"] = 9] = "EndOfFileExpected";
  ParseErrorCode2[ParseErrorCode2["InvalidCommentToken"] = 10] = "InvalidCommentToken";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
  ParseErrorCode2[ParseErrorCode2["InvalidUnicode"] = 14] = "InvalidUnicode";
  ParseErrorCode2[ParseErrorCode2["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
  ParseErrorCode2[ParseErrorCode2["InvalidCharacter"] = 16] = "InvalidCharacter";
})(ParseErrorCode || (ParseErrorCode = {}));
function modify(text, path28, value, options) {
  return setProperty(text, path28, value, options);
}
function applyEdits(text, edits) {
  let sortedEdits = edits.slice(0).sort((a, b) => {
    const diff = a.offset - b.offset;
    if (diff === 0) {
      return a.length - b.length;
    }
    return diff;
  });
  let lastModifiedOffset = text.length;
  for (let i = sortedEdits.length - 1; i >= 0; i--) {
    let e = sortedEdits[i];
    if (e.offset + e.length <= lastModifiedOffset) {
      text = applyEdit(text, e);
    } else {
      throw new Error("Overlapping edit");
    }
    lastModifiedOffset = e.offset;
  }
  return text;
}

// src/installer/merge-jsonc.ts
function mergeJsoncEdits(content, edits) {
  let result = content;
  for (const edit of edits) {
    const pathSegments = edit.path;
    const editsApplied = modify(result, pathSegments, edit.value, {
      formattingOptions: { insertSpaces: true, tabSize: 2 }
    });
    result = applyEdits(result, editsApplied);
  }
  return result;
}

// src/installer/apply-plan.ts
async function assertNoSymlinkInPath(repoRoot, relPath) {
  const abs = path6.resolve(repoRoot, relPath);
  const root = path6.resolve(repoRoot);
  let current = path6.dirname(abs);
  while (current.startsWith(root)) {
    if (existsSync5(current)) {
      const stat3 = await lstat2(current);
      if (stat3.isSymbolicLink()) {
        throw new Error(`Symlink in path not allowed: ${path6.relative(root, current) || "."}`);
      }
    }
    if (current === root) break;
    current = path6.dirname(current);
  }
}
async function hashFileAt(repoRoot, relPath) {
  await assertNoSymlinkInPath(repoRoot, relPath);
  const abs = path6.join(repoRoot, relPath);
  if (!existsSync5(abs)) return null;
  const stat3 = await lstat2(abs);
  if (stat3.isSymbolicLink()) {
    throw new Error(`Symlink paths are not allowed in init plan: ${relPath}`);
  }
  return sha256(await readFile5(abs, "utf8"));
}
async function validatePlanPaths(repoRoot, plan) {
  const errors = [];
  for (const op of plan.operations) {
    if (!isPathInsideRepo(repoRoot, op.path) && op.path !== "") {
      errors.push(`Path escapes repository root: ${op.path}`);
    }
    if (op.path.startsWith("/") || op.path.includes("..")) {
      errors.push(`Invalid plan path: ${op.path}`);
    }
    try {
      await assertNoSymlinkInPath(repoRoot, op.path);
    } catch (e) {
      errors.push(String(e));
    }
    const abs = path6.join(repoRoot, op.path);
    if (existsSync5(abs)) {
      const stat3 = await lstat2(abs);
      if (stat3.isSymbolicLink()) {
        errors.push(`Symlink target not allowed: ${op.path}`);
      }
    }
  }
  return errors;
}
async function applyPlanOperations(repoRoot, operations) {
  for (const op of operations) {
    if (!isPathInsideRepo(repoRoot, op.path) && op.path !== "") {
      throw new Error(`Path escapes repository root: ${op.path}`);
    }
    if (op.path.startsWith("/") || op.path.includes("..")) {
      throw new Error(`Invalid plan path: ${op.path}`);
    }
    await assertNoSymlinkInPath(repoRoot, op.path);
    if (op.kind === "create") {
      await assertHashIfExpected(repoRoot, op.path, null);
      await atomicWriteFile(path6.join(repoRoot, op.path), op.content);
      continue;
    }
    if (op.kind === "replace-generated") {
      await assertHashIfExpected(repoRoot, op.path, op.expectedCurrentHash);
      await atomicWriteFile(path6.join(repoRoot, op.path), op.content);
      continue;
    }
    if (op.kind === "merge-jsonc") {
      await assertHashIfExpected(repoRoot, op.path, op.expectedCurrentHash);
      const abs = path6.join(repoRoot, op.path);
      const current = existsSync5(abs) ? await readFile5(abs, "utf8") : "{}";
      const merged = mergeJsoncEdits(current, op.edits);
      await atomicWriteFile(abs, merged);
    }
  }
}
async function assertHashIfExpected(repoRoot, relPath, expected) {
  if (expected === null) return;
  const abs = path6.join(repoRoot, relPath);
  if (!existsSync5(abs)) {
    throw new Error(`Plan hash check failed; file missing: ${relPath}`);
  }
  const actual = await hashFileAt(repoRoot, relPath);
  if (actual !== expected) {
    throw new Error(
      `Plan hash mismatch for ${relPath}. File changed since plan was created; regenerate the plan.`
    );
  }
}

// src/installer/init-plan-builder.ts
import { readFile as readFile7, readdir as readdir4 } from "node:fs/promises";
import { existsSync as existsSync8 } from "node:fs";
import path9 from "node:path";

// src/installer/hook-merge.ts
import { readFile as readFile6 } from "node:fs/promises";
import { existsSync as existsSync6 } from "node:fs";
import path7 from "node:path";
init_numbering();

// src/installer/hook-merge-types.ts
var MANAGED_MARKER = "adr-governance.mjs";

// src/installer/nested-hook-merge.ts
function isManagedEntry(entry, marker) {
  if (!entry || typeof entry !== "object") return false;
  const command = String(entry.command ?? "");
  const name = String(entry.name ?? "");
  return command.includes(marker) || name.includes("adr-governance");
}
function entryKey(entry) {
  return JSON.stringify(entry);
}
function appendUnique(entries, toAdd) {
  const result = [...entries];
  const keys = new Set(entries.map((e) => entryKey(e)));
  for (const item of toAdd) {
    const key = entryKey(item);
    if (!keys.has(key)) {
      result.push(item);
      keys.add(key);
    }
  }
  return result;
}
function countManaged(groups, marker) {
  let count = 0;
  for (const item of groups) {
    if (item && typeof item === "object" && Array.isArray(item.hooks)) {
      count += item.hooks.filter((e) => isManagedEntry(e, marker)).length;
    } else if (isManagedEntry(item, marker)) {
      count++;
    }
  }
  return count;
}
function mergeNestedHookGroups(current, managedEntries, marker) {
  const groups = Array.isArray(current) ? [...current] : [];
  const managedCount = countManaged(groups, marker);
  if (managedCount > 1) {
    return {
      merged: groups,
      conflict: `Multiple managed ADR hook entries found (${managedCount})`
    };
  }
  let updated = false;
  const result = groups.map((item) => {
    if (item && typeof item === "object" && Array.isArray(item.hooks)) {
      const group = item;
      if (!group.hooks.some((entry) => isManagedEntry(entry, marker))) {
        return item;
      }
      updated = true;
      return {
        ...group,
        hooks: appendUnique(group.hooks, managedEntries)
      };
    }
    return item;
  });
  if (!updated) {
    const flatManagedIndex = result.findIndex((item) => isManagedEntry(item, marker));
    if (flatManagedIndex >= 0) {
      const flat = result[flatManagedIndex];
      result[flatManagedIndex] = {
        hooks: appendUnique([flat], managedEntries)
      };
      updated = true;
    } else {
      result.push({ hooks: managedEntries });
    }
  }
  return { merged: result };
}

// src/installer/hook-merge.ts
var CURSOR_MANAGED = {
  sessionStart: [{ command: "node .cursor/hooks/adr-governance.mjs session-start" }],
  beforeSubmitPrompt: [{ command: "node .cursor/hooks/adr-governance.mjs before-turn" }],
  stop: [{ command: "node .cursor/hooks/adr-governance.mjs after-turn", loop_limit: 1 }]
};
function entryKey2(entry) {
  return JSON.stringify(entry);
}
function appendUnique2(entries, toAdd) {
  const result = [...entries];
  const keys = new Set(entries.map((e) => entryKey2(e)));
  for (const item of toAdd) {
    const key = entryKey2(item);
    if (!keys.has(key)) {
      result.push(item);
      keys.add(key);
    }
  }
  return result;
}
function countManaged2(entries) {
  return entries.filter((e) => isManagedEntry(e, MANAGED_MARKER)).length;
}
function mergeHookArrays(existing, managed) {
  const managedCount = countManaged2(existing);
  if (managedCount > 1) {
    return {
      merged: existing,
      conflict: `Multiple managed ADR hook entries found (${managedCount})`
    };
  }
  return { merged: appendUnique2(existing, managed) };
}
function previewCursorHooksMerge(raw) {
  const rel = ".cursor/hooks.json";
  if (!raw) {
    return {
      path: rel,
      content: JSON.stringify({ version: 1, hooks: CURSOR_MANAGED }, null, 2) + "\n"
    };
  }
  const doc = JSON.parse(raw);
  const hooks = doc.hooks ?? {};
  for (const [key, entries] of Object.entries(CURSOR_MANAGED)) {
    const current = hooks[key] ?? [];
    const { merged, conflict } = mergeHookArrays(current, entries);
    if (conflict) return { path: rel, content: raw, conflict };
    hooks[key] = merged;
  }
  doc.hooks = hooks;
  return { path: rel, content: JSON.stringify(doc, null, 2) + "\n" };
}
function normalizeHookGroupList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.hooks)) {
    return [value];
  }
  return [];
}
function nestedHooksDocument(managedKeys, emptyDoc) {
  const hooks = Object.fromEntries(
    Object.entries(managedKeys).map(([key, value]) => [key, [value]])
  );
  return JSON.stringify({ ...emptyDoc, hooks }, null, 2) + "\n";
}
function previewNestedRuntimeHooksMerge(rel, raw, managedKeys, emptyDoc) {
  if (!raw) {
    return {
      path: rel,
      content: nestedHooksDocument(managedKeys, emptyDoc)
    };
  }
  const doc = JSON.parse(raw);
  const hooks = doc.hooks ?? {};
  for (const [key, value] of Object.entries(managedKeys)) {
    const flat = normalizeHookGroupList(hooks[key]);
    const { merged, conflict } = mergeNestedHookGroups(flat, value.hooks, MANAGED_MARKER);
    if (conflict) return { path: rel, content: raw, conflict };
    hooks[key] = merged;
  }
  doc.hooks = hooks;
  return { path: rel, content: JSON.stringify(doc, null, 2) + "\n" };
}
function claudeManagedKeys() {
  const entry = (phase) => ({
    hooks: [
      {
        type: "command",
        command: `node "\${CLAUDE_PROJECT_DIR}/.claude/hooks/adr-governance.mjs" ${phase}`
      }
    ]
  });
  return {
    UserPromptSubmit: entry("before-turn"),
    Stop: entry("after-turn")
  };
}
function codexManagedKeys() {
  const wrap = (phase) => ({
    hooks: [
      {
        type: "command",
        command: `node "$(git rev-parse --show-toplevel)/.codex/hooks/adr-governance.mjs" ${phase}`,
        commandWindows: `powershell.exe -NoProfile -Command "$r=(git rev-parse --show-toplevel); node \\"$r/.codex/hooks/adr-governance.mjs\\" ${phase}"`,
        timeout: 2
      }
    ]
  });
  return {
    UserPromptSubmit: wrap("before-turn"),
    Stop: wrap("after-turn")
  };
}
function geminiManagedKeys() {
  const entry = (name, phase) => ({
    hooks: [
      {
        name,
        type: "command",
        command: `node "$GEMINI_PROJECT_DIR/.gemini/hooks/adr-governance.mjs" ${phase}`,
        timeout: 2e3
      }
    ]
  });
  return {
    BeforeAgent: entry("adr-governance-before-turn", "before-turn"),
    AfterAgent: entry("adr-governance-after-turn", "after-turn")
  };
}
function previewClaudeHooksMerge(raw) {
  return previewNestedRuntimeHooksMerge(".claude/settings.json", raw, claudeManagedKeys(), {});
}
function previewCodexHooksMerge(raw) {
  return previewNestedRuntimeHooksMerge(".codex/hooks.json", raw, codexManagedKeys(), {});
}
function previewGeminiHooksMerge(raw) {
  return previewNestedRuntimeHooksMerge(".gemini/settings.json", raw, geminiManagedKeys(), {});
}
async function buildHookMergePlanOperations(repoRoot) {
  const previews = [
    previewCursorHooksMerge(
      existsSync6(path7.join(repoRoot, ".cursor/hooks.json")) ? await readFile6(path7.join(repoRoot, ".cursor/hooks.json"), "utf8") : null
    ),
    previewClaudeHooksMerge(
      existsSync6(path7.join(repoRoot, ".claude/settings.json")) ? await readFile6(path7.join(repoRoot, ".claude/settings.json"), "utf8") : null
    ),
    previewCodexHooksMerge(
      existsSync6(path7.join(repoRoot, ".codex/hooks.json")) ? await readFile6(path7.join(repoRoot, ".codex/hooks.json"), "utf8") : null
    ),
    previewGeminiHooksMerge(
      existsSync6(path7.join(repoRoot, ".gemini/settings.json")) ? await readFile6(path7.join(repoRoot, ".gemini/settings.json"), "utf8") : null
    )
  ];
  const operations = [];
  for (const preview of previews) {
    if (preview.conflict) {
      throw new Error(`${preview.path}: ${preview.conflict}`);
    }
    const expected = await hashFileAt(repoRoot, preview.path).catch(() => null);
    if (expected === null) {
      operations.push({ kind: "create", path: preview.path, content: preview.content });
    } else {
      operations.push({
        kind: "replace-generated",
        path: preview.path,
        expectedCurrentHash: expected,
        content: preview.content
      });
    }
  }
  return operations;
}
var RUNTIME_HOOKS = [
  { rel: ".cursor/hooks.json", keys: ["sessionStart", "beforeSubmitPrompt", "stop"] },
  { rel: ".claude/settings.json", keys: ["UserPromptSubmit", "Stop"] },
  { rel: ".codex/hooks.json", keys: ["UserPromptSubmit", "Stop"] },
  { rel: ".gemini/settings.json", keys: ["BeforeAgent", "AfterAgent"] }
];
function nestedEntriesHaveManaged(entries) {
  for (const item of normalizeHookGroupList(entries)) {
    if (item && typeof item === "object" && Array.isArray(item.hooks)) {
      if (item.hooks.some((e) => isManagedEntry(e, MANAGED_MARKER))) {
        return true;
      }
    } else if (isManagedEntry(item, MANAGED_MARKER)) {
      return true;
    }
  }
  return false;
}
function verifyRuntimeHookFile(spec, raw) {
  const issues = [];
  const doc = JSON.parse(raw);
  for (const key of spec.keys) {
    const entries = doc.hooks?.[key];
    if (!nestedEntriesHaveManaged(entries)) {
      issues.push(`Missing managed ADR hook in ${spec.rel} hooks.${key}`);
    }
  }
  return issues;
}
async function verifyAllRuntimeHookEntries(repoRoot) {
  const issues = [];
  for (const spec of RUNTIME_HOOKS) {
    const abs = path7.join(repoRoot, spec.rel);
    if (!existsSync6(abs)) {
      issues.push(`Missing ${spec.rel} ADR hook registration`);
      continue;
    }
    const raw = await readFile6(abs, "utf8");
    issues.push(...verifyRuntimeHookFile(spec, raw));
  }
  return issues;
}

// src/installer/context-template.ts
function contextTemplate(language) {
  if (language === "ja") {
    return `# \u30C9\u30E1\u30A4\u30F3\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8

\u3053\u306E\u30EA\u30DD\u30B8\u30C8\u30EA\u306E\u30C9\u30E1\u30A4\u30F3\u7528\u8A9E\u3068\u5883\u754C\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3002

## \u7528\u8A9E

<!-- ADR / CONTEXT \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u3067\u78BA\u5B9A\u3057\u305F\u7528\u8A9E\u3092\u8FFD\u8A18 -->

`;
  }
  return `# Domain Context

Domain terms and bounded-context language for this repository.

## Language

<!-- Add domain terms as decisions are recorded in the ADR/CONTEXT workflow -->

`;
}

// src/installer/init-evidence-plan.ts
import { readdir as readdir3 } from "node:fs/promises";
import { existsSync as existsSync7 } from "node:fs";
import path8 from "node:path";
var MAX_PROPOSED_CANDIDATES = 3;
function shouldProposeContextMap(evidence) {
  const contextMdFiles = evidence.existingLayout.contextFiles.filter(
    (file) => file.endsWith("/CONTEXT.md") || file === "CONTEXT.md"
  );
  return contextMdFiles.length > 1;
}
function buildEvidenceInformedContext(evidence, language) {
  const lines = [contextTemplate(language).trimEnd()];
  const manifestLines = evidence.manifests.slice(0, 10).map(
    (manifest) => `- \`${manifest.path}\` (${manifest.kind}): ${manifest.headingsOrKeys.slice(0, 8).join(", ")}`
  );
  if (manifestLines.length > 0) {
    lines.push("", language === "ja" ? "## \u89B3\u6E2C\u3055\u308C\u305F\u69CB\u9020" : "## Observed structure", "");
    lines.push(...manifestLines);
    lines.push(
      "",
      language === "ja" ? "<!-- \u4E0A\u8A18\u306F\u8D70\u67FB\u3067\u78BA\u8A8D\u3067\u304D\u305F\u4E8B\u5B9F\u3067\u3059\u3002\u63A1\u7528\u7406\u7531\u306F\u5225\u9014\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002 -->" : "<!-- Observed facts from repository scan; confirm rationale before treating as decisions. -->"
    );
  }
  const observations = evidence.candidateEvidence.slice(0, 8);
  if (observations.length > 0) {
    lines.push("", language === "ja" ? "## \u78BA\u8A8D\u304C\u5FC5\u8981\u306A\u89B3\u6E2C" : "## Observations needing review", "");
    for (const item of observations) {
      lines.push(`- \`${item.path}\` (${item.category}): ${item.summary}`);
    }
  }
  return `${lines.join("\n")}
`;
}
function buildReviewQuestions(evidence, language) {
  return evidence.candidateEvidence.slice(0, 5).map((item) => {
    if (language === "ja") {
      return `\`${item.path}\` \u306F\u306A\u305C\u3053\u306E\u69CB\u9020\u306B\u306A\u3063\u3066\u3044\u307E\u3059\u304B\uFF1F (${item.category}; \u89B3\u6E2C\u306E\u307F\u3001\u7406\u7531\u306F\u672A\u78BA\u8A8D)`;
    }
    return `Why was \`${item.path}\` structured this way? (${item.category}; observed, rationale unknown)`;
  });
}
function slugFromEvidencePath(relativePath) {
  const base = relativePath.replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 48);
}
async function nextAdrNumber2(repoRoot, dirs, idDigits) {
  let max = 0;
  for (const dir of dirs) {
    const abs = path8.join(repoRoot, dir);
    if (!existsSync7(abs)) continue;
    for (const file of await readdir3(abs)) {
      const match = /^(\d+)-/.exec(file);
      if (match) {
        max = Math.max(max, Number.parseInt(match[1] ?? "0", 10));
      }
    }
  }
  return max + 1;
}
function proposedAdrCandidateBody(item, language) {
  if (language === "ja") {
    return `# \u89B3\u6E2C: ${item.path}

## \u6587\u8108

\u30EA\u30DD\u30B8\u30C8\u30EA\u8D70\u67FB\u3067 \`${item.path}\` (${item.category}) \u304C\u78BA\u8A8D\u3055\u308C\u307E\u3057\u305F\u3002tracked \u30D5\u30A1\u30A4\u30EB\u304B\u3089\u306F\u63A1\u7528\u7406\u7531\u306F\u8AAD\u307F\u53D6\u308C\u307E\u305B\u3093\u3002

## Open Points

- \u306A\u305C\u3053\u306E\u69CB\u9020\u30FB\u6280\u8853\u3092\u9078\u3093\u3060\u306E\u304B\uFF1F
- \u691C\u8A0E\u3057\u305F\u4EE3\u66FF\u6848\u306F\u4F55\u304B\uFF1F
`;
  }
  return `# Observed: ${item.path}

## Context

Repository scan found \`${item.path}\` (${item.category}). Tracked files do not record the selection rationale.

## Open Points

- Why was this structure or technology chosen?
- What alternatives were considered?
`;
}
async function buildProposedAdrCandidateOperations(repoRoot, evidence, config) {
  const { proposedDir, acceptedDir } = config.layout;
  const language = config.documents.language;
  const idDigits = config.documents.idDigits;
  const results = [];
  let nextNumber = await nextAdrNumber2(repoRoot, [acceptedDir, proposedDir], idDigits);
  const candidates = evidence.candidateEvidence.slice(0, MAX_PROPOSED_CANDIDATES);
  for (const item of candidates) {
    const slug = slugFromEvidencePath(item.path) || "candidate";
    const relPath = path8.join(
      proposedDir,
      `${String(nextNumber).padStart(idDigits, "0")}-observed-${slug}.md`
    );
    nextNumber += 1;
    if (existsSync7(path8.join(repoRoot, relPath))) continue;
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const content = `---
status: proposed
date: ${date}
---

${proposedAdrCandidateBody(item, language)}`;
    results.push({
      operation: { kind: "create", path: relPath, content },
      provenance: {
        sourcePaths: [item.path],
        rationale: "Observed repository structure; rationale requires human confirmation"
      }
    });
  }
  return results;
}
function buildEvidenceReferences(operations, provenance) {
  return operations.map((_, index) => {
    const entry = provenance[index];
    return {
      operationIndex: index,
      sourcePaths: entry?.sourcePaths ?? [],
      rationale: entry?.rationale ?? "Planned init apply operation"
    };
  });
}

// src/installer/init-plan-builder.ts
var STATIC_TEMPLATES = [
  ["templates/cursor/rules/adr-governance.mdc", ".cursor/rules/adr-governance.mdc"],
  ["templates/cursor/hooks/adr-governance.mjs", ".cursor/hooks/adr-governance.mjs"],
  ["templates/claude/commands/adr.md", ".claude/commands/adr.md"],
  ["templates/claude/hooks/adr-governance.mjs", ".claude/hooks/adr-governance.mjs"],
  ["templates/codex/hooks/adr-governance.mjs", ".codex/hooks/adr-governance.mjs"],
  ["templates/gemini/hooks/adr-governance.mjs", ".gemini/hooks/adr-governance.mjs"],
  ["templates/adr-governance/gitignore", ".adr-governance/.gitignore"]
];
var BUNDLE_TARGETS = [
  ["dist/bundle/cli.mjs", ".adr-governance/bin/cli.mjs"],
  ["dist/bundle/hook.mjs", ".adr-governance/bin/hook.mjs"],
  ["templates/shared/hook-shim-runner.mjs", ".adr-governance/bin/hook-shim-runner.mjs"]
];
function proposedAdrReadme(language, acceptedDir) {
  if (language === "ja") {
    return `# \u63D0\u6848\u4E2D ADR

\u691C\u8A0E\u4E2D\u30FB\u5374\u4E0B\u306E ADR \u306F \`${acceptedDir}/\` \u3078\u6607\u683C\u3059\u308B\u307E\u3067\u3053\u3053\u306B\u7F6E\u304D\u307E\u3059\u3002
`;
  }
  return `# Proposed ADRs

Draft and rejected ADRs live here until promoted to \`${acceptedDir}/\`.
`;
}
function singleDirAdrReadme(language, dir) {
  if (language === "ja") {
    return `# ADR \u904B\u7528\u30EB\u30FC\u30EB

\`${dir}/\` \u306B accepted / proposed / rejected \u3092\u7F6E\u304D\u307E\u3059\u3002

\u8A73\u7D30\u306F \`.agents/skills/managing-adrs/SKILL.md\` \u3092\u53C2\u7167\u3002
`;
  }
  return `# ADR workflow

Store accepted, proposed, and rejected ADRs under \`${dir}/\`.

See \`.agents/skills/managing-adrs/SKILL.md\` for details.
`;
}
function adaptSplitReadme(content, acceptedDir, proposedDir) {
  return content.replace(/docs\/adr/g, acceptedDir).replace(/docs\/proposed-adr/g, proposedDir);
}
async function planLayoutReadmeOperations(packageRoot, repoRoot, config) {
  const { acceptedDir, proposedDir, mode } = config.layout;
  const lang = config.documents.language;
  const results = [];
  const acceptedReadme = path9.join(acceptedDir, "README.md");
  const proposedReadme = path9.join(proposedDir, "README.md");
  if (mode === "single") {
    if (!existsSync8(path9.join(repoRoot, acceptedReadme))) {
      results.push({
        operation: {
          kind: "create",
          path: acceptedReadme,
          content: singleDirAdrReadme(lang, acceptedDir)
        },
        provenance: {
          sourcePaths: ["templates/docs/adr/README.md"],
          rationale: "Single-layout ADR directory readme"
        }
      });
    }
    return results;
  }
  const templatePath = path9.join(packageRoot, "templates/docs/adr/README.md");
  if (existsSync8(templatePath) && !existsSync8(path9.join(repoRoot, acceptedReadme))) {
    const raw = await readFile7(templatePath, "utf8");
    results.push({
      operation: {
        kind: "create",
        path: acceptedReadme,
        content: adaptSplitReadme(raw, acceptedDir, proposedDir)
      },
      provenance: {
        sourcePaths: ["templates/docs/adr/README.md"],
        rationale: "Split-layout accepted ADR readme"
      }
    });
  }
  if (proposedDir !== acceptedDir && !existsSync8(path9.join(repoRoot, proposedReadme))) {
    results.push({
      operation: {
        kind: "create",
        path: proposedReadme,
        content: proposedAdrReadme(lang, acceptedDir)
      },
      provenance: {
        sourcePaths: [],
        rationale: "Split-layout proposed ADR readme"
      }
    });
  }
  return results;
}
async function planFileFromContent(repoRoot, relPath, content) {
  const expected = await hashFileAt(repoRoot, relPath);
  if (expected === null) {
    return { kind: "create", path: relPath, content };
  }
  return {
    kind: "replace-generated",
    path: relPath,
    expectedCurrentHash: expected,
    content
  };
}
async function walkFiles(dir) {
  const entries = await readdir4(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path9.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}
async function collectDirOperations(packageRoot, repoRoot, srcRel, destRel) {
  const srcAbs = path9.join(packageRoot, srcRel);
  if (!existsSync8(srcAbs)) return [];
  const ops = [];
  for (const entryPath of await walkFiles(srcAbs)) {
    const relFromSrc = path9.relative(srcAbs, entryPath);
    const destPath = path9.join(destRel, relFromSrc);
    const content = await readFile7(entryPath, "utf8");
    ops.push(await planFileFromContent(repoRoot, destPath, content));
  }
  return ops;
}
async function buildInitPlanOperations(packageRoot, repoRoot, proposedConfig, ciProvider, evidence) {
  const operations = [];
  const provenance = [];
  const pushOp = (operation, source) => {
    operations.push(operation);
    provenance.push(source);
  };
  pushOp(
    await planFileFromContent(
      repoRoot,
      "adr.config.json",
      JSON.stringify(proposedConfig, null, 2) + "\n"
    ),
    {
      sourcePaths: evidence?.existingLayout.agentConfigFiles ?? [],
      rationale: "Detected repository layout and document language"
    }
  );
  for (const op of await collectDirOperations(
    packageRoot,
    repoRoot,
    "skill/managing-adrs",
    ".agents/skills/managing-adrs"
  )) {
    pushOp(op, {
      sourcePaths: ["skill/managing-adrs"],
      rationale: "Package skill bundle"
    });
  }
  for (const op of await collectDirOperations(
    packageRoot,
    repoRoot,
    "templates/schema",
    ".adr-governance/schema"
  )) {
    pushOp(op, {
      sourcePaths: ["templates/schema"],
      rationale: "Package JSON schema bundle"
    });
  }
  for (const [src, dest] of STATIC_TEMPLATES) {
    const srcPath = path9.join(packageRoot, src);
    if (!existsSync8(srcPath)) continue;
    const content = await readFile7(srcPath, "utf8");
    pushOp(await planFileFromContent(repoRoot, dest, content), {
      sourcePaths: [src],
      rationale: "Package template file"
    });
  }
  for (const [src, dest] of BUNDLE_TARGETS) {
    const srcPath = path9.join(packageRoot, src);
    if (!existsSync8(srcPath)) continue;
    const content = await readFile7(srcPath, "utf8");
    pushOp(await planFileFromContent(repoRoot, dest, content), {
      sourcePaths: [src],
      rationale: "Bundled CLI and hook entrypoints"
    });
  }
  const { contextFile, contextMapFile } = proposedConfig.layout;
  if (!existsSync8(path9.join(repoRoot, contextFile))) {
    const contextContent = evidence ? buildEvidenceInformedContext(evidence, proposedConfig.documents.language) : contextTemplate(proposedConfig.documents.language);
    pushOp(
      {
        kind: "create",
        path: contextFile,
        content: contextContent
      },
      {
        sourcePaths: evidence ? [
          ...evidence.manifests.map((item) => item.path),
          ...evidence.candidateEvidence.map((item) => item.path)
        ] : [],
        rationale: evidence ? "Observed repository structure for CONTEXT draft" : "Default CONTEXT template"
      }
    );
  }
  for (const entry of await planLayoutReadmeOperations(packageRoot, repoRoot, proposedConfig)) {
    pushOp(entry.operation, entry.provenance);
  }
  if (evidence && shouldProposeContextMap(evidence) && !existsSync8(path9.join(repoRoot, contextMapFile))) {
    const mapEntries = evidence.existingLayout.contextFiles.filter((file) => file.endsWith("/CONTEXT.md") || file === "CONTEXT.md").map((file) => `- \`${file}\``).join("\n");
    pushOp(
      {
        kind: "create",
        path: contextMapFile,
        content: `# Context Map

Multiple bounded contexts were detected:

${mapEntries}

<!-- Link each context file and its responsibilities -->
`
      },
      {
        sourcePaths: evidence.existingLayout.contextFiles,
        rationale: "Multiple CONTEXT.md files detected"
      }
    );
  }
  if (evidence) {
    for (const entry of await buildProposedAdrCandidateOperations(repoRoot, evidence, proposedConfig)) {
      pushOp(entry.operation, entry.provenance);
    }
  }
  if (ciProvider === "github-actions") {
    const workflowPath = ".github/workflows/adr-governance.yml";
    if (!existsSync8(path9.join(repoRoot, workflowPath))) {
      pushOp(
        {
          kind: "create",
          path: workflowPath,
          content: ciWorkflowSuggestion()
        },
        {
          sourcePaths: evidence?.manifests.filter((item) => item.path.includes(".github/workflows")).map((item) => item.path) ?? [".github/workflows"],
          rationale: "GitHub Actions CI provider detected"
        }
      );
    }
  }
  for (const op of await buildHookMergePlanOperations(repoRoot)) {
    pushOp(op, {
      sourcePaths: [
        ".cursor/hooks.json",
        ".claude/settings.json",
        ".codex/hooks.json",
        ".gemini/settings.json"
      ],
      rationale: "Existing runtime hook configuration merge"
    });
  }
  const reviewQuestions = evidence ? buildReviewQuestions(evidence, proposedConfig.documents.language) : [];
  return { operations, provenance, reviewQuestions };
}

// src/cli/commands/init.ts
async function runInitScan(repoRoot, outDir, packageRoot) {
  const tracked = await gitLsFiles(repoRoot);
  const headSha = await gitRevParse(repoRoot, "HEAD");
  const config = defaultConfig();
  const evidence = await buildEvidenceBundle(repoRoot, tracked, headSha, config.analysis.exclude);
  const layout = detectExistingLayout(repoRoot, tracked);
  let proposedConfig = defaultConfig();
  if (layout.detectedLayout === "single" && layout.acceptedDirs[0]) {
    proposedConfig = configForSingleDir(layout.acceptedDirs[0]);
  } else if (layout.detectedLayout === "custom" && layout.acceptedDirs[0]) {
    proposedConfig = defaultConfig({
      layout: {
        mode: "split",
        acceptedDir: layout.acceptedDirs[0] ?? "docs/adr",
        proposedDir: layout.proposedDirs[0] ?? "docs/proposed-adr",
        contextFile: "CONTEXT.md",
        contextMapFile: "CONTEXT-MAP.md"
      }
    });
  }
  proposedConfig.documents.language = await detectDocumentLanguage(repoRoot);
  proposedConfig.documents.legacyFrontmatter = await detectLegacyFrontmatter(repoRoot, {
    acceptedDir: proposedConfig.layout.acceptedDir,
    proposedDir: proposedConfig.layout.proposedDir
  });
  const ciProvider = detectCiProvider(tracked);
  const planBuild = await buildInitPlanOperations(
    packageRoot,
    repoRoot,
    proposedConfig,
    ciProvider,
    evidence
  );
  await mkdir3(outDir, { recursive: true });
  const evidencePath = path10.join(outDir, "evidence.json");
  await writeFile2(evidencePath, JSON.stringify(evidence, null, 2));
  const plan = {
    schemaVersion: 1,
    planId: randomUUID(),
    repositoryRootHash: sha256(repoRoot),
    sourceHeadSha: headSha,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    detectedLayout: layout.detectedLayout,
    proposedConfig,
    operations: planBuild.operations,
    postApplySteps: ["write-manifest"],
    evidenceReferences: buildEvidenceReferences(planBuild.operations, planBuild.provenance),
    reviewQuestions: planBuild.reviewQuestions
  };
  const planPath = path10.join(outDir, "init-plan.json");
  await writeFile2(planPath, JSON.stringify(plan, null, 2));
  return { planPath, plan, evidencePath };
}
async function loadInitPlan(planPath) {
  const raw = await readFile8(planPath, "utf8");
  const plan = JSON.parse(raw);
  return {
    ...plan,
    postApplySteps: plan.postApplySteps ?? ["write-manifest"]
  };
}
function validateInitPlan(plan) {
  const errors = [];
  for (const op of plan.operations) {
    if (op.kind === "create" && op.content.length === 0) {
      errors.push(`Empty content for create: ${op.path}`);
    }
  }
  return errors;
}
async function applyInitPlan(repoRoot, plan, applyGenerated) {
  const errors = [...validateInitPlan(plan), ...await validatePlanPaths(repoRoot, plan)];
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  await applyGenerated(repoRoot, plan);
}
function defaultInitOutputDir(repoRoot) {
  return path10.join(
    os.tmpdir(),
    "adr-governance-init",
    sha256(repoRoot).slice(0, 16)
  );
}

// src/cli/commands/check.ts
import { readFile as readFile11 } from "node:fs/promises";
import { existsSync as existsSync10 } from "node:fs";
import path15 from "node:path";

// src/core/adr-transitions.ts
var ALLOWED_TRANSITIONS = {
  proposed: /* @__PURE__ */ new Set(["proposed", "accepted", "rejected"]),
  accepted: /* @__PURE__ */ new Set(["accepted", "superseded", "deprecated"]),
  rejected: /* @__PURE__ */ new Set(["rejected"]),
  superseded: /* @__PURE__ */ new Set(["superseded"]),
  deprecated: /* @__PURE__ */ new Set(["deprecated"])
};
function byId(adrs) {
  return new Map(adrs.map((a) => [a.id, a]));
}
function validateAuthorityMetadata(adr, isNewOrChanged) {
  const issues = [];
  const { status, acceptance } = adr.frontmatter;
  if (status === "proposed" && acceptance) {
    issues.push({
      severity: "error",
      code: "proposed-with-acceptance",
      message: "Proposed ADR must not include acceptance metadata",
      path: adr.path
    });
  }
  if (isNewOrChanged && status === "accepted" && !acceptance) {
    issues.push({
      severity: "error",
      code: "accepted-without-acceptance",
      message: "New or changed accepted ADR requires acceptance metadata",
      path: adr.path
    });
  }
  return issues;
}
function validateAdrTransitions(base, head) {
  const baseById = byId(base);
  const issues = [];
  for (const headAdr of head) {
    const baseAdr = baseById.get(headAdr.id);
    const contentChanged = baseAdr !== void 0 && (baseAdr.body !== headAdr.body || JSON.stringify(baseAdr.frontmatter) !== JSON.stringify(headAdr.frontmatter));
    const isNewOrChanged = !baseAdr || baseAdr.frontmatter.status !== headAdr.frontmatter.status || contentChanged;
    issues.push(...validateAuthorityMetadata(headAdr, isNewOrChanged));
    if (!baseAdr) continue;
    const from = baseAdr.frontmatter.status;
    const to = headAdr.frontmatter.status;
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed?.has(to)) {
      issues.push({
        severity: "error",
        code: "invalid-status-transition",
        message: `Invalid status transition for ${headAdr.id}: ${from} -> ${to}`,
        path: headAdr.path
      });
    }
  }
  const headById = byId(head);
  for (const adr of head) {
    const supersedes = adr.frontmatter.supersedes ?? [];
    for (const targetId of supersedes) {
      const target = headById.get(targetId);
      if (!target) {
        issues.push({
          severity: "error",
          code: "invalid-supersession",
          message: `${adr.id} supersedes missing ADR ${targetId}`,
          path: adr.path
        });
        continue;
      }
      if (adr.frontmatter.status !== "accepted") {
        issues.push({
          severity: "error",
          code: "invalid-supersession",
          message: `${adr.id} must be accepted before superseding ${targetId}`,
          path: adr.path
        });
      }
      if (target.frontmatter.status !== "superseded") {
        issues.push({
          severity: "error",
          code: "invalid-supersession",
          message: `${adr.id} supersedes ${targetId} but target is not superseded`,
          path: adr.path
        });
      }
      if (target.frontmatter.superseded_by !== adr.id) {
        issues.push({
          severity: "error",
          code: "invalid-supersession",
          message: `Supersession is not reciprocal between ${adr.id} and ${targetId}`,
          path: adr.path
        });
      }
    }
    const supersededBy = adr.frontmatter.superseded_by;
    if (!supersededBy) continue;
    const replacement = headById.get(supersededBy);
    if (!replacement) {
      issues.push({
        severity: "error",
        code: "invalid-supersession",
        message: `${adr.id} is superseded by missing ADR ${supersededBy}`,
        path: adr.path
      });
      continue;
    }
    if (adr.frontmatter.status !== "superseded") {
      issues.push({
        severity: "error",
        code: "invalid-supersession",
        message: `${adr.id} must be superseded before naming ${supersededBy} as its replacement`,
        path: adr.path
      });
    }
    if (replacement.frontmatter.status !== "accepted") {
      issues.push({
        severity: "error",
        code: "invalid-supersession",
        message: `${adr.id} is superseded by ${supersededBy} but its replacement is not accepted`,
        path: adr.path
      });
    }
    if (!(replacement.frontmatter.supersedes ?? []).includes(adr.id)) {
      issues.push({
        severity: "error",
        code: "invalid-supersession",
        message: `Supersession is not reciprocal between ${adr.id} and ${supersededBy}`,
        path: adr.path
      });
    }
  }
  return issues;
}

// src/core/change-gate.ts
init_decision_evidence();
var CHANGE_GATE_CODES = /* @__PURE__ */ new Set([
  "decision-evidence-required",
  "decision-evidence-invalid",
  "decision-evidence-legacy",
  "decision-baseline-stale",
  "decision-base-stale",
  "decision-changeset-stale",
  "decision-ref-not-accepted",
  "decision-ref-stale",
  "changed-proposal-unreviewed"
]);
function normalizePath(p) {
  return p.replace(/\\/g, "/");
}
function isGovernancePath(relativePath, governancePaths) {
  const normalized = normalizePath(relativePath);
  for (const gov of governancePaths) {
    const g = normalizePath(gov);
    if (normalized === g) return true;
  }
  return false;
}
function isExempt(relativePath, exemptPaths) {
  const normalized = normalizePath(relativePath);
  for (const exempt of exemptPaths) {
    const e = normalizePath(exempt);
    if (e.endsWith("/")) {
      if (normalized.startsWith(e)) return true;
    } else if (normalized === e) {
      return true;
    }
  }
  return false;
}
function severityFor(config, code) {
  if (code === "decision-evidence-legacy") return "warning";
  if (config.changeGate.mode === "warn" && CHANGE_GATE_CODES.has(code)) {
    return "warning";
  }
  return "error";
}
function issue(config, code, message, path28) {
  return { severity: severityFor(config, code), code, message, path: path28 };
}
function evaluateChangeGate(input) {
  const { config } = input;
  if (config.changeGate.mode === "off") return [];
  const nonGovernanceChanges = input.changedPaths.filter(
    (p) => !isGovernancePath(p, input.governancePaths) && !isExempt(p, config.changeGate.exemptPaths)
  );
  if (nonGovernanceChanges.length === 0) return [];
  if (!input.evidence) {
    return [
      issue(
        config,
        "decision-evidence-required",
        "Non-governance changes require decision evidence"
      )
    ];
  }
  let evidence;
  try {
    evidence = parseDecisionEvidence(input.evidence);
  } catch (e) {
    return [
      issue(
        config,
        "decision-evidence-invalid",
        `Decision evidence failed schema validation: ${String(e)}`
      )
    ];
  }
  const issues = [];
  if (isDecisionEvidenceV1(evidence)) {
    issues.push(
      issue(
        config,
        "decision-evidence-legacy",
        "Decision evidence schema v1 is deprecated; re-run attest to produce v2"
      )
    );
  } else if (evidence.baseCommit !== input.resolvedBaseCommit) {
    issues.push(
      issue(
        config,
        "decision-base-stale",
        "Decision evidence base commit does not match the attested base"
      )
    );
  } else if (evidence.changeSet.digest !== input.currentChangeSetDigest) {
    issues.push(
      issue(
        config,
        "decision-changeset-stale",
        "Repository changes after attestation invalidate the decision evidence"
      )
    );
  }
  if (evidence.decisionCorpusHash !== input.expectedDecisionCorpusHash) {
    issues.push(
      issue(
        config,
        "decision-baseline-stale",
        "Decision corpus hash does not match the attested base"
      )
    );
  }
  if (evidence.outcome.kind === "accepted-adr") {
    for (const ref of evidence.outcome.refs) {
      const currentHash = input.adrContentHashes.get(ref.id);
      if (!currentHash) {
        issues.push(
          issue(
            config,
            "decision-ref-not-accepted",
            `Referenced ADR is not accepted or missing: ${ref.id}`
          )
        );
        continue;
      }
      if (ref.contentHash !== currentHash) {
        issues.push(
          issue(
            config,
            "decision-ref-stale",
            `Referenced ADR content hash mismatch: ${ref.id}`
          )
        );
      }
    }
  }
  const reviewed = new Set(evidence.reviewedProposals.map((p) => p.id));
  for (const proposed of input.changedProposedAdrs) {
    if (!reviewed.has(proposed.id)) {
      issues.push(
        issue(
          config,
          "changed-proposal-unreviewed",
          `Changed proposed ADR requires reviewedProposals declaration: ${proposed.id}`,
          proposed.path
        )
      );
    }
  }
  return issues;
}

// src/core/decision-corpus.ts
init_numbering();
import path12 from "node:path";
function normalizeRepoPath2(relativePath) {
  return relativePath.split(path12.sep).join("/");
}
function isAdrMarkdown(relativePath) {
  const name = relativePath.split("/").pop() ?? relativePath;
  return name.endsWith(".md") && name !== "README.md";
}
function corpusDirectories(config) {
  const dirs = [config.layout.acceptedDir];
  if (config.layout.mode === "split" || config.layout.acceptedDir !== config.layout.proposedDir) {
    dirs.push(config.layout.proposedDir);
  }
  return dirs;
}
function corpusPathCandidates(config) {
  return [...corpusDirectories(config), config.layout.contextFile, config.layout.contextMapFile];
}
async function listRefCorpusPaths(repoRoot, ref, config) {
  const { execFile: execFile3 } = await import("node:child_process");
  const { promisify: promisify3 } = await import("node:util");
  const exec = promisify3(execFile3);
  const { stdout } = await exec("git", ["ls-tree", "-r", "--name-only", ref], { cwd: repoRoot });
  const prefixes = corpusPathCandidates(config);
  const paths = [];
  for (const file of stdout.split("\n").filter(Boolean)) {
    const normalized = normalizeRepoPath2(file);
    if (prefixes.includes(normalized)) {
      paths.push(normalized);
      continue;
    }
    for (const prefix of prefixes) {
      if (prefix.endsWith(".md")) continue;
      if (normalized.startsWith(`${prefix}/`) && isAdrMarkdown(normalized)) {
        paths.push(normalized);
        break;
      }
    }
  }
  return [...new Set(paths)].sort();
}
async function collectCorpusEntries(relativePaths, readAt) {
  const entries = [];
  for (const relativePath of relativePaths) {
    const content = await readAt(relativePath);
    if (content === null) continue;
    entries.push({ path: relativePath, contentHash: `sha256:${sha256(content)}` });
  }
  return entries;
}
var BaseRefUnavailableError = class extends Error {
  constructor(ref) {
    super(`base ref unavailable: ${ref}`);
    this.name = "BaseRefUnavailableError";
  }
};
async function buildRefDecisionCorpus(repoRoot, ref, config) {
  const { readFileAtRef: readFileAtRef2 } = await Promise.resolve().then(() => (init_git_diff(), git_diff_exports));
  try {
    const paths = await listRefCorpusPaths(repoRoot, ref, config);
    const entries = await collectCorpusEntries(
      paths,
      async (relativePath) => readFileAtRef2(repoRoot, ref, relativePath)
    );
    if (entries.length !== paths.length) throw new BaseRefUnavailableError(ref);
    return entries;
  } catch {
    throw new BaseRefUnavailableError(ref);
  }
}
function hashDecisionCorpus(entries) {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const payload = sorted.map((e) => `${e.path}\0${e.contentHash}
`).join("");
  return `sha256:${sha256(payload)}`;
}

// src/core/change-set.ts
init_git_diff();
init_numbering();
import { createHash as createHash2 } from "node:crypto";
import { lstat as lstat4, readFile as readFile9, readlink } from "node:fs/promises";
import path13 from "node:path";
function sideParts(side) {
  return side ? [side.mode, side.contentHash] : ["-", "-"];
}
function hashContent(buffer) {
  return `sha256:${createHash2("sha256").update(buffer).digest("hex")}`;
}
function hashChangeSetEntries(entries) {
  const seen = /* @__PURE__ */ new Set();
  const sorted = entries.map((entry) => ({
    ...entry,
    path: entry.path.replace(/\\/g, "/")
  })).sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
  const parts = [];
  for (const entry of sorted) {
    if (!entry.path || entry.path.includes("\0") || seen.has(entry.path)) {
      throw new Error(`invalid change-set path: ${entry.path}`);
    }
    seen.add(entry.path);
    const [baseMode, baseHash] = sideParts(entry.base);
    const [currentMode, currentHash] = sideParts(entry.current);
    parts.push(
      `${entry.path}\0${baseMode}\0${baseHash}\0${currentMode}\0${currentHash}\0`
    );
  }
  return `sha256:${sha256(parts.join(""))}`;
}
async function readCurrentSide(repoRoot, relativePath) {
  const abs = path13.join(repoRoot, relativePath);
  let info;
  try {
    info = await lstat4(abs);
  } catch {
    return null;
  }
  if (info.isSymbolicLink()) {
    const target = await readlink(abs);
    return { mode: "120000", contentHash: hashContent(Buffer.from(target, "utf8")) };
  }
  if (!info.isFile()) {
    return null;
  }
  const mode = (info.mode & 73) !== 0 ? "100755" : "100644";
  const content = await readFile9(abs);
  return { mode, contentHash: hashContent(content) };
}
async function readBaseSide(repoRoot, comparisonBase, relativePath) {
  const mode = await readModeAtRef(repoRoot, comparisonBase, relativePath);
  if (!mode) return null;
  const blob = await readBlobAtRef(repoRoot, comparisonBase, relativePath);
  if (blob === null) return null;
  return { mode, contentHash: hashContent(blob) };
}
async function buildChangeSet(repoRoot, baseRef) {
  const baseCommit = await resolveCommit(repoRoot, baseRef);
  const comparisonBaseCommit = await resolveMergeBase(repoRoot, baseCommit, "HEAD");
  const changedPaths = await listSnapshotChangedPaths(repoRoot, baseRef);
  const entries = [];
  for (const relativePath of changedPaths) {
    const base = await readBaseSide(repoRoot, comparisonBaseCommit, relativePath);
    const current = await readCurrentSide(repoRoot, relativePath);
    if (base === null && current === null) continue;
    entries.push({ path: relativePath.replace(/\\/g, "/"), base, current });
  }
  const digest = hashChangeSetEntries(entries);
  return {
    algorithm: "git-change-set-v1",
    baseCommit,
    comparisonBaseCommit,
    digest,
    entries
  };
}

// src/cli/commands/check.ts
init_decision_evidence();
init_validation();
init_numbering();

// src/core/context-links.ts
import { readFile as readFile10 } from "node:fs/promises";
import { existsSync as existsSync9 } from "node:fs";
import path14 from "node:path";
var MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
function extractRelativeLinks(content) {
  const links = [];
  for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
    const target = match[1]?.trim();
    if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("#")) {
      continue;
    }
    links.push(target.split("#")[0] ?? target);
  }
  return links;
}
async function validateContextLinks(repoRoot, contextPaths) {
  const issues = [];
  for (const rel of contextPaths) {
    const abs = path14.join(repoRoot, rel);
    if (!existsSync9(abs)) continue;
    const content = await readFile10(abs, "utf8");
    const baseDir = path14.dirname(rel);
    for (const link of extractRelativeLinks(content)) {
      const resolved = path14.normalize(path14.join(baseDir, link));
      const absTarget = path14.join(repoRoot, resolved);
      if (!existsSync9(absTarget)) {
        issues.push({
          path: rel,
          message: `Broken relative link: ${link}`
        });
      }
    }
  }
  return issues;
}

// src/cli/commands/check.ts
init_git_diff();
init_github_evidence();
async function runCheck(repoRoot, options) {
  const resolved = typeof options === "string" ? { baseRef: options } : options ?? {};
  if (resolved.evidencePath && resolved.githubEventPath) {
    return {
      ok: false,
      exitCode: 2,
      issues: [
        {
          severity: "error",
          code: "invalid-check-options",
          message: "Specify only one of --evidence or --github-event"
        }
      ]
    };
  }
  const configPath = path15.join(repoRoot, "adr.config.json");
  if (!existsSync10(configPath)) {
    return {
      ok: false,
      exitCode: 2,
      issues: [{ severity: "error", code: "missing-config", message: "Run init first" }]
    };
  }
  let config;
  let configWarnings = [];
  try {
    const parsed = parseConfig(JSON.parse(await readFile11(configPath, "utf8")));
    config = parsed.config;
    configWarnings = parsed.warnings;
  } catch (e) {
    return {
      ok: false,
      exitCode: 2,
      issues: [{ severity: "error", code: "invalid-config", message: String(e) }]
    };
  }
  const adrs = await loadAllAdrs(repoRoot, config);
  const issues = collectValidationIssues(adrs, config);
  for (const warning of configWarnings) {
    issues.push({ severity: "warning", code: "unknown-config-key", message: warning });
  }
  const contextPaths = [config.layout.contextFile, config.layout.contextMapFile];
  for (const ctxFile of await listContextFiles(repoRoot, contextPaths)) {
    const linkIssues = await validateContextLinks(repoRoot, [ctxFile]);
    for (const issue2 of linkIssues) {
      issues.push({
        severity: "error",
        code: "broken-context-link",
        message: issue2.message,
        path: issue2.path
      });
    }
  }
  const manifestPath = path15.join(repoRoot, MANIFEST_PATH);
  if (existsSync10(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile11(manifestPath, "utf8"));
      for (const [rel, expectedHash] of Object.entries(manifest.files ?? {})) {
        const abs = path15.join(repoRoot, rel);
        if (!existsSync10(abs)) {
          issues.push({
            severity: "error",
            code: "manifest-missing-file",
            message: `Manifest file missing: ${rel}`,
            path: rel
          });
          continue;
        }
        const actual = sha256(await readFile11(abs, "utf8"));
        if (actual !== expectedHash) {
          issues.push({
            severity: "error",
            code: "manifest-drift",
            message: `Generated file drift: ${rel}. Run sync.`,
            path: rel
          });
        }
      }
    } catch {
      issues.push({
        severity: "error",
        code: "invalid-manifest",
        message: "Could not parse manifest.json"
      });
    }
  }
  if (resolved.baseRef) {
    const baseIssues = await checkBaseRefDuplicates(repoRoot, resolved.baseRef, adrs, config);
    issues.push(...baseIssues);
    const gateIssues = await checkDecisionAuthority(repoRoot, config, adrs, resolved);
    issues.push(...gateIssues);
  }
  for (const message of await verifyAllRuntimeHookEntries(repoRoot)) {
    if (existsSync10(manifestPath)) {
      issues.push({
        severity: "error",
        code: "missing-hook-entry",
        message
      });
    }
  }
  const errors = issues.filter((i) => i.severity === "error");
  return {
    ok: errors.length === 0,
    exitCode: errors.length > 0 ? 1 : 0,
    issues
  };
}
async function listContextFiles(repoRoot, candidates) {
  const paths = [];
  for (const candidate of candidates) {
    if (existsSync10(path15.join(repoRoot, candidate))) paths.push(candidate);
  }
  return [...new Set(paths)];
}
async function checkDecisionAuthority(repoRoot, config, headAdrs, options) {
  if (!options.baseRef || config.changeGate.mode === "off") return [];
  const issues = [];
  const baseRef = options.baseRef;
  if (!await refExists(repoRoot, baseRef)) {
    if (config.changeGate.mode === "enforce") {
      issues.push({
        severity: "error",
        code: "base-ref-unavailable",
        message: `Could not read base ref ${baseRef}`
      });
    }
    return issues;
  }
  const baseAdrs = await loadAdrsAtRef(repoRoot, baseRef, config);
  issues.push(...validateAdrTransitions(baseAdrs, headAdrs));
  let evidence = null;
  if (options.evidencePath) {
    try {
      evidence = parseDecisionEvidence(JSON.parse(await readFile11(options.evidencePath, "utf8")));
    } catch (e) {
      issues.push({
        severity: config.changeGate.mode === "warn" ? "warning" : "error",
        code: "decision-evidence-invalid",
        message: `Could not load evidence: ${String(e)}`
      });
    }
  } else if (options.githubEventPath) {
    try {
      const event = JSON.parse(await readFile11(options.githubEventPath, "utf8"));
      evidence = parseGitHubEventEvidence(event);
      if (!evidence) {
        issues.push({
          severity: config.changeGate.mode === "warn" ? "warning" : "error",
          code: "decision-evidence-required",
          message: "PR body does not contain a valid adr-governance evidence block"
        });
      }
    } catch (e) {
      issues.push({
        severity: config.changeGate.mode === "warn" ? "warning" : "error",
        code: "decision-evidence-invalid",
        message: `Could not parse GitHub event: ${String(e)}`
      });
    }
  }
  let corpus;
  try {
    corpus = await buildRefDecisionCorpus(repoRoot, baseRef, config);
  } catch (error) {
    if (!(error instanceof BaseRefUnavailableError)) throw error;
    issues.push({
      severity: "error",
      code: "base-ref-unavailable",
      message: `Could not read decision corpus at base ref ${baseRef}`
    });
    return issues;
  }
  const expectedHash = hashDecisionCorpus(corpus);
  let changedPaths;
  try {
    changedPaths = await listChangedPaths(repoRoot, baseRef);
  } catch {
    issues.push({
      severity: "error",
      code: "base-ref-unavailable",
      message: `Could not compare changes against base ref ${baseRef}`
    });
    return issues;
  }
  const govPaths = await governanceArtifactPaths(repoRoot, baseRef, config, headAdrs, baseAdrs);
  const normalizedChanged = new Set(changedPaths.map((p) => p.replace(/\\/g, "/")));
  const changedProposed = headAdrs.filter((adr) => {
    if (adr.frontmatter.status !== "proposed") return false;
    const normalizedPath = adr.path.replace(/\\/g, "/");
    return normalizedChanged.has(normalizedPath);
  });
  const adrContentHashes = /* @__PURE__ */ new Map();
  for (const adr of headAdrs) {
    if (adr.frontmatter.status !== "accepted") continue;
    const abs = path15.join(repoRoot, adr.path);
    if (!existsSync10(abs)) continue;
    const content = await readFile11(abs, "utf8");
    adrContentHashes.set(adr.id, contentHashForFile(content));
  }
  let resolvedBaseCommit;
  try {
    resolvedBaseCommit = await resolveCommit(repoRoot, baseRef);
  } catch {
    issues.push({
      severity: "error",
      code: "base-ref-unavailable",
      message: `Could not read base ref ${baseRef}`
    });
    return issues;
  }
  let currentChangeSetDigest;
  try {
    const changeSet = await buildChangeSet(repoRoot, baseRef);
    currentChangeSetDigest = changeSet.digest;
  } catch {
    issues.push({
      severity: "error",
      code: "base-ref-unavailable",
      message: `Could not build change set against base ref ${baseRef}`
    });
    return issues;
  }
  issues.push(
    ...evaluateChangeGate({
      config,
      changedPaths,
      governancePaths: govPaths,
      changedProposedAdrs: changedProposed,
      adrContentHashes,
      expectedDecisionCorpusHash: expectedHash,
      resolvedBaseCommit,
      currentChangeSetDigest,
      evidence
    })
  );
  return issues;
}
async function governanceArtifactPaths(repoRoot, baseRef, config, headAdrs, baseAdrs) {
  const paths = /* @__PURE__ */ new Set([
    MANIFEST_PATH,
    config.layout.contextFile,
    config.layout.contextMapFile
  ]);
  for (const adr of [...headAdrs, ...baseAdrs]) {
    paths.add(adr.path.replace(/\\/g, "/"));
  }
  const addManifestFiles = (raw) => {
    if (!raw) return;
    try {
      const manifest = JSON.parse(raw);
      for (const rel of Object.keys(manifest.files ?? {})) paths.add(rel.replace(/\\/g, "/"));
    } catch {
    }
  };
  try {
    addManifestFiles(await readFile11(path15.join(repoRoot, MANIFEST_PATH), "utf8"));
  } catch {
  }
  addManifestFiles(await readFileAtRef(repoRoot, baseRef, MANIFEST_PATH));
  return [...paths];
}
async function loadAdrsAtRef(repoRoot, ref, config) {
  const { parseAdrFromPath: parseAdrFromPath2 } = await Promise.resolve().then(() => (init_validation(), validation_exports));
  const { execFile: execFile3 } = await import("node:child_process");
  const { promisify: promisify3 } = await import("node:util");
  const exec = promisify3(execFile3);
  const adrs = [];
  try {
    const { stdout } = await exec("git", ["ls-tree", "-r", "--name-only", ref], {
      cwd: repoRoot
    });
    for (const file of stdout.split("\n").filter(Boolean)) {
      if (!file.endsWith(".md") || file.endsWith("/README.md")) continue;
      let kind = null;
      if (file.startsWith(`${config.layout.acceptedDir}/`)) kind = "accepted";
      else if ((config.layout.mode === "split" || config.layout.acceptedDir !== config.layout.proposedDir) && file.startsWith(`${config.layout.proposedDir}/`)) {
        kind = "proposed";
      }
      if (!kind) continue;
      const content = await readFileAtRef(repoRoot, ref, file);
      if (!content) continue;
      const parsed = parseAdrFromPath2(file, content, kind, config);
      if (parsed) adrs.push(parsed);
    }
  } catch {
    return [];
  }
  return adrs.sort((a, b) => a.number - b.number);
}
async function checkBaseRefDuplicates(repoRoot, baseRef, currentAdrs, config) {
  const { execFile: execFile3 } = await import("node:child_process");
  const { promisify: promisify3 } = await import("node:util");
  const exec = promisify3(execFile3);
  const issues = [];
  const byNumber = /* @__PURE__ */ new Map();
  for (const adr of currentAdrs) {
    const group = byNumber.get(adr.number) ?? [];
    group.push(adr);
    byNumber.set(adr.number, group);
  }
  for (const [number, group] of byNumber) {
    if (group.length > 1) {
      issues.push({
        severity: "error",
        code: "duplicate-number",
        message: `Duplicate ADR number ${number} in current tree: ${group.map((a) => a.path).join(", ")}`
      });
    }
  }
  try {
    const { stdout } = await exec("git", ["ls-tree", "-r", "--name-only", baseRef], {
      cwd: repoRoot
    });
    const baseByNumber = /* @__PURE__ */ new Map();
    for (const file of stdout.split("\n").filter((f) => /\d{4}-.+\.md$/.test(f))) {
      const match = /(\d{4})-/.exec(file);
      if (!match) continue;
      const num = Number.parseInt(match[1] ?? "0", 10);
      const list = baseByNumber.get(num) ?? [];
      list.push(file);
      baseByNumber.set(num, list);
    }
    for (const [num, baseFiles] of baseByNumber) {
      const current = byNumber.get(num) ?? [];
      if (current.length === 0) continue;
      const baseNames = new Set(baseFiles.map((f) => f.split("/").pop()));
      const currentNames = new Set(current.map((a) => a.path.split("/").pop()));
      const overlap = [...baseNames].some((n) => currentNames.has(n));
      if (!overlap && current.length > 0) {
        issues.push({
          severity: "error",
          code: "base-ref-number-collision",
          message: `ADR number ${num} reused with different slug between ${baseRef} and current branch`
        });
      }
    }
  } catch {
    if (config.changeGate.mode === "enforce") {
      issues.push({
        severity: "error",
        code: "base-ref-unavailable",
        message: `Could not compare against ${baseRef}`
      });
    } else {
      issues.push({
        severity: "warning",
        code: "base-ref-unavailable",
        message: `Could not compare against ${baseRef}`
      });
    }
  }
  return issues;
}

// src/cli/commands/attest.ts
import { readFile as readFile12 } from "node:fs/promises";
import path16 from "node:path";
init_decision_evidence();
init_git_diff();
async function runAttest(options) {
  const hasAdr = options.adrIds.length > 0;
  const hasNoAdr = options.noAdrReason !== void 0;
  if (hasAdr === hasNoAdr) {
    throw new Error("Specify exactly one of --adr or --no-adr");
  }
  if (!await refExists(options.repoRoot, options.baseRef)) {
    throw new BaseRefUnavailableError(options.baseRef);
  }
  const corpus = await buildRefDecisionCorpus(options.repoRoot, options.baseRef, options.config);
  const decisionCorpusHash = hashDecisionCorpus(corpus);
  const changeSet = await buildChangeSet(options.repoRoot, options.baseRef);
  const baseCommit = changeSet.baseCommit;
  const adrs = await loadAllAdrs(options.repoRoot, options.config);
  const adrById = new Map(adrs.map((a) => [a.id, a]));
  if (hasAdr) {
    const refs = [];
    for (const id of [...options.adrIds].sort()) {
      const adr = adrById.get(id);
      if (!adr || adr.frontmatter.status !== "accepted") {
        throw new Error(`ADR is not accepted: ${id}`);
      }
      const content = await readFile12(path16.join(options.repoRoot, adr.path), "utf8");
      refs.push({ id, contentHash: contentHashForFile(content) });
    }
    const evidence2 = {
      schemaVersion: 2,
      baseCommit,
      decisionCorpusHash,
      changeSet: {
        algorithm: "git-change-set-v1",
        digest: changeSet.digest
      },
      outcome: { kind: "accepted-adr", refs },
      reviewedProposals: options.reviewedProposalIds.map((id) => ({
        id,
        relation: "unrelated"
      }))
    };
    return parseDecisionEvidence(JSON.parse(serializeDecisionEvidence(evidence2)));
  }
  if (!options.rationale?.trim()) {
    throw new Error("no-ADR attestation requires --rationale");
  }
  const evidence = {
    schemaVersion: 2,
    baseCommit,
    decisionCorpusHash,
    changeSet: {
      algorithm: "git-change-set-v1",
      digest: changeSet.digest
    },
    outcome: {
      kind: "no-adr",
      reason: options.noAdrReason,
      rationale: options.rationale.trim()
    },
    reviewedProposals: options.reviewedProposalIds.map((id) => ({
      id,
      relation: "unrelated"
    }))
  };
  return parseDecisionEvidence(JSON.parse(serializeDecisionEvidence(evidence)));
}

// src/cli/commands/create.ts
init_numbering();
init_lifecycle();
import path17 from "node:path";
async function runCreate(options) {
  const release = await acquireLock(options.repoRoot, "create", "create");
  try {
    const acceptedDir = path17.join(options.repoRoot, options.config.layout.acceptedDir);
    const proposedDir = path17.join(options.repoRoot, options.config.layout.proposedDir);
    const numbers = [];
    for (const dir of [acceptedDir, proposedDir]) {
      for (const name of await listAdrFiles(dir)) {
        const parsed = parseAdrFilename(name);
        if (parsed) numbers.push(parsed.number);
      }
    }
    const number = nextAdrNumber(numbers);
    const slug = slugifyTitle(options.title) || "decision";
    const filename = formatAdrFilename(number, slug, options.config.documents.idDigits);
    const targetDir = options.status === "accepted" || options.status === "superseded" || options.status === "deprecated" ? options.config.layout.acceptedDir : options.config.layout.proposedDir;
    if (options.status === "accepted" && options.config.promotion.requireHumanAcceptance) {
      throw new Error(
        "Cannot create accepted ADR when promotion.requireHumanAcceptance is true. Create as proposed and promote with --approval human."
      );
    }
    if (options.status === "accepted" && options.body.match(/^##\s+Open Points/im)) {
      throw new Error("Accepted ADR cannot contain Open Points");
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const content = buildAdrContent(
      {
        status: options.status,
        date: today,
        acceptance: options.status === "accepted" && !options.config.promotion.requireHumanAcceptance ? "automatic" : void 0
      },
      options.title,
      options.body
    );
    const relPath = path17.join(targetDir, filename);
    const absPath = path17.join(options.repoRoot, relPath);
    await atomicWriteFile(absPath, content);
    return relPath;
  } finally {
    await release();
  }
}

// src/cli/commands/promote.ts
init_lifecycle();
import { readFile as readFile13 } from "node:fs/promises";
import path19 from "node:path";
init_validation();

// src/core/audit-log.ts
import { appendFile, mkdir as mkdir4 } from "node:fs/promises";
import path18 from "node:path";
async function appendAuditLog(repoRoot, entry) {
  const logDir = path18.join(repoRoot, ".adr-governance/state/logs");
  await mkdir4(logDir, { recursive: true });
  const line = JSON.stringify({ ...entry, timestamp: (/* @__PURE__ */ new Date()).toISOString() }) + "\n";
  await appendFile(path18.join(logDir, "audit.ndjson"), line, "utf8");
}

// src/cli/commands/promote.ts
async function runPromote(options) {
  const release = await acquireLock(options.repoRoot, "promote", "promote");
  try {
    const numMatch = /ADR-(\d+)/.exec(options.adrId);
    if (!numMatch) throw new Error(`Invalid ADR id: ${options.adrId}`);
    const proposedDir = path19.join(options.repoRoot, options.config.layout.proposedDir);
    const files = await listAdrFiles(proposedDir);
    const digits = options.config.documents.idDigits;
    const padded = numMatch[1]?.padStart(digits, "0");
    const matchFile = files.find((f) => f.startsWith(`${padded}-`));
    if (!matchFile) throw new Error(`Proposed ADR not found: ${options.adrId}`);
    const rel = path19.join(options.config.layout.proposedDir, matchFile);
    const content = await readFile13(path19.join(options.repoRoot, rel), "utf8");
    const parsed = parseAdrFromPath(rel, content, "proposed", options.config);
    if (!parsed) throw new Error("Could not parse ADR");
    const check = canPromoteToAccepted(
      parsed,
      options.config.promotion.requireHumanAcceptance,
      options.approval ?? "automatic"
    );
    if (!check.ok) throw new Error(check.reason ?? "Cannot promote");
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const newContent = buildAdrContent(
      {
        status: "accepted",
        date: today,
        acceptance: options.approval ?? "automatic"
      },
      parsed.title,
      parsed.body
    );
    if (options.config.layout.mode === "split") {
      const destRel = path19.join(options.config.layout.acceptedDir, matchFile);
      const destAbs = path19.join(options.repoRoot, destRel);
      let moveKind;
      try {
        moveKind = await movePathInRepo(options.repoRoot, rel, destRel);
      } catch (error) {
        throw new Error(`Promote failed: ${String(error)}`);
      }
      try {
        await atomicWriteFile(destAbs, newContent);
        if ((options.approval ?? "automatic") === "human") {
          await appendAuditLog(options.repoRoot, {
            kind: "promotion",
            adrId: options.adrId,
            approval: "human",
            method: "cli"
          });
        }
      } catch (error) {
        try {
          if (moveKind === "git") {
            await gitMv(options.repoRoot, destRel, rel);
          } else {
            await movePathInRepo(options.repoRoot, destRel, rel);
          }
        } catch {
          throw new Error(
            `Promote failed after move; manual recovery may be required at ${destRel}: ${String(error)}`
          );
        }
        throw new Error(`Promote failed: ${String(error)}`);
      }
      return destRel;
    }
    await atomicWriteFile(path19.join(options.repoRoot, rel), newContent);
    return rel;
  } finally {
    await release();
  }
}

// src/cli/commands/supersede.ts
import { readFile as readFile14 } from "node:fs/promises";
import path20 from "node:path";
init_validation();
var RAW_FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---)([\s\S]*)$/;
function updateFrontmatter(content, updates) {
  const match = RAW_FRONTMATTER_RE.exec(content);
  if (!match) throw new Error("Could not update ADR frontmatter");
  const opening = match[1] ?? "";
  const yaml = match[2] ?? "";
  const closing = match[3] ?? "";
  const body = match[4] ?? "";
  const newline = yaml.includes("\r\n") ? "\r\n" : "\n";
  const pending = new Map(Object.entries(updates));
  const lines = yaml.split(/\r?\n/).map((line) => {
    const field = /^(\s*)([^:\s][^:]*?)\s*:/.exec(line);
    if (!field) return line;
    const key = field[2]?.trim();
    if (!key || !pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${field[1] ?? ""}${key}: ${value}`;
  });
  for (const [key, value] of pending) {
    lines.push(`${key}: ${value}`);
  }
  return `${opening}${lines.join(newline)}${closing}${body}`;
}
async function runSupersede(options) {
  const release = await acquireLock(options.repoRoot, "supersede", "supersede");
  try {
    const oldNum = /ADR-(\d+)/.exec(options.oldAdrId)?.[1];
    const newNum = /ADR-(\d+)/.exec(options.newAdrId)?.[1];
    if (!oldNum || !newNum) throw new Error("Invalid ADR ids");
    const acceptedDir = path20.join(options.repoRoot, options.config.layout.acceptedDir);
    const files = await listAdrFiles(acceptedDir);
    const digits = options.config.documents.idDigits;
    const oldFile = files.find((f) => f.startsWith(`${oldNum.padStart(digits, "0")}-`));
    if (!oldFile) throw new Error(`Old ADR not found: ${options.oldAdrId}`);
    const newFile = files.find((f) => f.startsWith(`${newNum.padStart(digits, "0")}-`));
    if (!newFile) throw new Error(`New ADR not found: ${options.newAdrId}`);
    const oldRel = path20.join(options.config.layout.acceptedDir, oldFile);
    const newRel = path20.join(options.config.layout.acceptedDir, newFile);
    const oldPath = path20.join(options.repoRoot, oldRel);
    const newPath = path20.join(options.repoRoot, newRel);
    const oldContent = await readFile14(oldPath, "utf8");
    const newContent = await readFile14(newPath, "utf8");
    const oldParsed = parseAdrFromPath(oldRel, oldContent, "accepted", options.config);
    const newParsed = parseAdrFromPath(newRel, newContent, "accepted", options.config);
    if (!oldParsed) throw new Error("Could not parse old ADR");
    if (!newParsed) throw new Error("Could not parse new ADR");
    if (oldParsed.id === newParsed.id) throw new Error("ADR cannot supersede itself");
    if (oldParsed.frontmatter.status !== "accepted") {
      throw new Error(`Old ADR must be accepted before superseding: ${options.oldAdrId}`);
    }
    if (newParsed.frontmatter.status !== "accepted") {
      throw new Error(`New ADR must be accepted before superseding: ${options.newAdrId}`);
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const oldUpdated = updateFrontmatter(oldContent, {
      status: "superseded",
      date: today,
      superseded_by: newParsed.id
    });
    const newUpdated = updateFrontmatter(newContent, {
      supersedes: [.../* @__PURE__ */ new Set([...newParsed.frontmatter.supersedes ?? [], oldParsed.id])].join(", ")
    });
    const oldCandidate = parseAdrFromPath(oldRel, oldUpdated, "accepted", options.config);
    const newCandidate = parseAdrFromPath(newRel, newUpdated, "accepted", options.config);
    if (!oldCandidate || !newCandidate) throw new Error("Could not parse supersession candidates");
    const currentAdrs = await loadAllAdrs(options.repoRoot, options.config);
    const candidateAdrs = currentAdrs.map((adr) => {
      if (adr.id === oldParsed.id) return oldCandidate;
      if (adr.id === newParsed.id) return newCandidate;
      return adr;
    });
    const candidateIssues = validateAdrTransitions(currentAdrs, candidateAdrs).filter((issue2) => issue2.severity === "error");
    if (candidateIssues.length > 0) {
      throw new Error(`Supersession validation failed: ${candidateIssues.map((issue2) => issue2.message).join("; ")}`);
    }
    let oldWritten = false;
    try {
      await atomicWriteFile(oldPath, oldUpdated);
      oldWritten = true;
      await atomicWriteFile(newPath, newUpdated);
    } catch (error) {
      if (oldWritten) await atomicWriteFile(oldPath, oldContent);
      throw error;
    }
  } finally {
    await release();
  }
}

// src/cli/commands/turn-close.ts
init_types();
import { mkdir as mkdir7, writeFile as writeFile5 } from "node:fs/promises";
import path23 from "node:path";

// src/hooks/audit-chain.ts
import { mkdir as mkdir6, readFile as readFile16, unlink as unlink2, writeFile as writeFile4 } from "node:fs/promises";
import path22 from "node:path";

// src/hooks/turn-pointer.ts
import { mkdir as mkdir5, readdir as readdir5, readFile as readFile15, writeFile as writeFile3 } from "node:fs/promises";
import path21 from "node:path";
var CURRENT_TURN_DIR = ".adr-governance/state/current-turn";
var LEGACY_CURRENT_TURN_POINTER = ".adr-governance/state/current-turn.json";
function sanitizeSessionId(sessionId) {
  const trimmed = sessionId.trim();
  if (!trimmed) return "default";
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}
function turnPointerRelPath(sessionId) {
  return path21.join(CURRENT_TURN_DIR, `${sanitizeSessionId(sessionId)}.json`);
}
async function loadTurnStateForSession(repoRoot, sessionId) {
  const trimmed = sessionId?.trim();
  if (trimmed) {
    return readPointerTurnState(repoRoot, turnPointerRelPath(trimmed));
  }
  const fromLegacy = await readPointerTurnState(repoRoot, LEGACY_CURRENT_TURN_POINTER);
  if (fromLegacy) return fromLegacy;
  return null;
}
async function resolveTurnStateForClose(repoRoot, sessionId) {
  const trimmed = sessionId?.trim();
  if (!trimmed) {
    return loadTurnStateForSession(repoRoot);
  }
  const direct = await loadTurnStateForSession(repoRoot, trimmed);
  if (direct) return direct;
  const byConversation = await findLatestUnreceiptedTurnForConversation(repoRoot, trimmed);
  if (byConversation) return byConversation;
  return null;
}
async function findLatestUnreceiptedTurnForConversation(repoRoot, conversationId) {
  const turnsDir = path21.join(repoRoot, STATE_DIR, "turns");
  let entries;
  try {
    entries = await readdir5(turnsDir);
  } catch {
    return null;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json") || entry.startsWith("receipt-")) continue;
    try {
      const state = JSON.parse(
        await readFile15(path21.join(turnsDir, entry), "utf8")
      );
      if (state.receipt !== null) continue;
      if (state.conversationId === conversationId || state.conversationId === void 0 && state.sessionId === conversationId) {
        candidates.push(state);
      }
    } catch {
      continue;
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return candidates[0] ?? null;
}
async function readPointerTurnState(repoRoot, relPointer) {
  try {
    const pointer = JSON.parse(await readFile15(path21.join(repoRoot, relPointer), "utf8"));
    if (!pointer.turnStatePath) return null;
    const statePath = path21.join(repoRoot, pointer.turnStatePath);
    return JSON.parse(await readFile15(statePath, "utf8"));
  } catch {
    return null;
  }
}

// src/hooks/audit-chain.ts
var AUDIT_CHAIN_DIR = ".adr-governance/state/audit-chain";
var PENDING_AUDIT_CONVERSATION_ID = "__pending__";
function auditChainScope(conversationId) {
  const trimmed = conversationId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : PENDING_AUDIT_CONVERSATION_ID;
}
function auditChainRelPath(conversationId) {
  return path22.join(AUDIT_CHAIN_DIR, `${sanitizeSessionId(conversationId)}.json`);
}
async function clearAuditChain(repoRoot, conversationId) {
  try {
    await unlink2(path22.join(repoRoot, auditChainRelPath(conversationId)));
  } catch {
  }
}
async function markAuditChainResolvedForScope(repoRoot, conversationId) {
  await clearAuditChain(repoRoot, auditChainScope(conversationId));
}

// src/cli/commands/turn-close.ts
async function recordTurnReceiptForState(repoRoot, state, receipt) {
  state.receipt = receipt;
  const statePath = path23.join(repoRoot, STATE_DIR, "turns", `${state.turnId}.json`);
  await writeFile5(statePath, JSON.stringify(state, null, 2));
  await markAuditChainResolvedForScope(repoRoot, state.conversationId);
}
async function runTurnClose(options) {
  if (options.outcome === "no-change") {
    if (!options.reason) {
      throw new Error("--reason is required when outcome is no-change");
    }
    if (!NO_ADR_REASONS.includes(options.reason)) {
      throw new Error(`Invalid reason code: ${options.reason}`);
    }
  }
  const receipt = {
    outcome: options.outcome,
    reason: options.outcome === "no-change" ? options.reason : void 0,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  const state = await resolveTurnStateForClose(options.repoRoot, options.sessionId);
  if (state) {
    await recordTurnReceiptForState(options.repoRoot, state, receipt);
    return;
  }
  const stateDir = path23.join(options.repoRoot, STATE_DIR, "turns");
  await mkdir7(stateDir, { recursive: true });
  await writeFile5(
    path23.join(stateDir, `receipt-${Date.now()}.json`),
    JSON.stringify({ receipt }, null, 2)
  );
}

// src/cli/commands/sync.ts
import { readFile as readFile18 } from "node:fs/promises";
import { existsSync as existsSync12 } from "node:fs";
import path25 from "node:path";

// src/installer/generated-files.ts
import { readFile as readFile17, readdir as readdir6, stat as stat2 } from "node:fs/promises";
import { existsSync as existsSync11 } from "node:fs";
import path24 from "node:path";
init_numbering();
var GENERATOR_VERSION = "0.2.0";
async function hashFile(absPath) {
  const content = await readFile17(absPath, "utf8");
  return sha256(content);
}
async function buildManifest(repoRoot, packageRoot) {
  const files = {};
  const targets = [
    ".agents/skills/managing-adrs",
    ".adr-governance/bin",
    ".adr-governance/schema",
    ".adr-governance/.gitignore",
    ".cursor/rules/adr-governance.mdc",
    ".cursor/hooks/adr-governance.mjs",
    ".cursor/hooks.json",
    ".claude/commands/adr.md",
    ".claude/hooks/adr-governance.mjs",
    ".claude/settings.json",
    ".codex/hooks/adr-governance.mjs",
    ".codex/hooks.json",
    ".gemini/hooks/adr-governance.mjs",
    ".gemini/settings.json",
    "adr.config.json"
  ];
  for (const rel of targets) {
    const abs = path24.join(repoRoot, rel);
    if (!existsSync11(abs)) continue;
    const s = await stat2(abs);
    if (s.isDirectory()) {
      const entries = await readdir6(abs, { recursive: true });
      for (const entry of entries) {
        const entryPath = path24.join(abs, String(entry));
        const st = await stat2(entryPath);
        if (st.isFile()) {
          const r = path24.relative(repoRoot, entryPath);
          files[r] = await hashFile(entryPath);
        }
      }
    } else {
      files[rel] = await hashFile(abs);
    }
  }
  void packageRoot;
  return {
    version: GENERATOR_VERSION,
    generatorVersion: GENERATOR_VERSION,
    files
  };
}
async function copySkillAndBundles(packageRoot, repoRoot, plan) {
  const filteredOperations = plan.operations.filter((op) => {
    if (op.kind !== "create") return true;
    return !existsSync11(path24.join(repoRoot, op.path));
  });
  await applyPlanOperations(repoRoot, filteredOperations);
  const postApplySteps = plan.postApplySteps ?? ["write-manifest"];
  if (postApplySteps.includes("write-manifest")) {
    const manifest = await buildManifest(repoRoot, packageRoot);
    await atomicWriteFile(
      path24.join(repoRoot, ".adr-governance/manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n"
    );
  }
}

// src/cli/commands/sync.ts
async function runSync(options) {
  const manifestPath = path25.join(options.repoRoot, ".adr-governance/manifest.json");
  if (existsSync12(manifestPath)) {
    const existing = JSON.parse(await readFile18(manifestPath, "utf8"));
    for (const [rel, expectedHash] of Object.entries(existing.files ?? {})) {
      const abs = path25.join(options.repoRoot, rel);
      if (!existsSync12(abs)) continue;
      const actual = await readFile18(abs, "utf8");
      const { sha256: sha2562 } = await Promise.resolve().then(() => (init_numbering(), numbering_exports));
      if (sha2562(actual) !== expectedHash) {
        throw new Error(
          `Sync conflict: ${rel} was modified locally. Resolve manually and re-run sync.`
        );
      }
    }
  }
  const tracked = await gitLsFiles(options.repoRoot);
  const planBuild = await buildInitPlanOperations(
    options.packageRoot,
    options.repoRoot,
    options.plan.proposedConfig,
    detectCiProvider(tracked)
  );
  await copySkillAndBundles(options.packageRoot, options.repoRoot, {
    ...options.plan,
    operations: planBuild.operations,
    postApplySteps: options.plan.postApplySteps ?? ["write-manifest"]
  });
}

// src/cli/resolve-package-root.ts
import { existsSync as existsSync13 } from "node:fs";
import path26 from "node:path";
function resolvePackageRoot(defaultRoot, from) {
  const packageRoot = from ? path26.resolve(from) : defaultRoot;
  const skillSrc = path26.join(packageRoot, "skill/managing-adrs");
  const cliBundle = path26.join(packageRoot, "dist/bundle/cli.mjs");
  const hookBundle = path26.join(packageRoot, "dist/bundle/hook.mjs");
  if (!existsSync13(skillSrc) || !existsSync13(cliBundle) || !existsSync13(hookBundle)) {
    throw new Error(
      "Requires the adr-governance package root (skill/ and dist/bundle/). Use --from /path/to/adr-governance"
    );
  }
  return packageRoot;
}

// src/cli/main.ts
import { readFile as readFile19 } from "node:fs/promises";
var PACKAGE_ROOT = path27.resolve(path27.dirname(fileURLToPath(import.meta.url)), "../..");
function usage() {
  console.error(`Usage:
  adr-governance init [--repo <path>]
  adr-governance init --apply <plan.json> [--from <package-root>] [--repo <path>]
  adr-governance check [--base <git-ref>] [--evidence <json-path>] [--github-event <event-path>] [--json] [--repo <path>]
  adr-governance attest --base <git-ref> (--adr ADR-NNNN ... | --no-adr <reason> --rationale <text>) [--reviewed-proposal ADR-NNNN ...] [--format json|github-markdown] [--repo <path>]
  adr-governance sync [--from <package-root>] [--repo <path>]
  adr-governance create --status proposed|accepted --title "<title>" --body-file <path> [--repo <path>]
  adr-governance promote ADR-NNNN [--approval automatic|human] [--repo <path>]
  adr-governance supersede ADR-NNNN --by ADR-MMMM [--repo <path>]
  adr-governance turn-close --outcome docs-updated|no-change [--reason <code>] [--session-id <id>] [--repo <path>]`);
}
function getArgs(name) {
  const values = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name) {
      const value = process.argv[i + 1];
      if (value && !value.startsWith("-")) values.push(value);
    }
  }
  return values;
}
function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return void 0;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("-")) return void 0;
  return value;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
function firstPositionalAfter(command) {
  const start = process.argv.indexOf(command);
  if (start === -1) return void 0;
  const skipValueFor = /* @__PURE__ */ new Set(["--repo", "--from", "--approval", "--by", "--apply", "--base", "--status", "--title", "--body-file", "--outcome", "--reason", "--session-id", "--evidence", "--github-event", "--no-adr", "--rationale", "--format"]);
  for (let i = start + 1; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg) continue;
    if (skipValueFor.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return arg;
  }
  return void 0;
}
async function resolveRepo() {
  const explicit = getArg("--repo");
  if (explicit) return path27.resolve(explicit);
  const root = await gitRoot(process.cwd());
  if (!root) throw new Error("Not a git repository. Use --repo <path>.");
  return root;
}
async function main() {
  const command = process.argv[2];
  if (!command) {
    usage();
    process.exit(2);
  }
  const repoRoot = await resolveRepo();
  switch (command) {
    case "init": {
      const applyPlan = getArg("--apply");
      if (applyPlan) {
        const packageRoot = resolvePackageRoot(PACKAGE_ROOT, getArg("--from"));
        const plan = await loadInitPlan(path27.resolve(applyPlan));
        await applyInitPlan(repoRoot, plan, async (root, p) => {
          await copySkillAndBundles(packageRoot, root, p);
        });
        const result = await runCheck(repoRoot);
        console.log(
          JSON.stringify(
            {
              applied: true,
              check: result,
              nextSteps: [
                "Review merged hook entries in .cursor/hooks.json (and other runtime settings).",
                "If Cursor prompts about untrusted project hooks, approve adr-governance hooks in Cursor settings.",
                "Run: node .adr-governance/bin/cli.mjs check --base origin/main"
              ]
            },
            null,
            2
          )
        );
        process.exit(result.exitCode);
      }
      const outDir = defaultInitOutputDir(repoRoot);
      const scan = await runInitScan(repoRoot, outDir, PACKAGE_ROOT);
      console.log(
        JSON.stringify(
          {
            message: "Init scan complete. Review plan and run init --apply.",
            planPath: scan.planPath,
            evidencePath: scan.evidencePath
          },
          null,
          2
        )
      );
      break;
    }
    case "check": {
      const result = await runCheck(repoRoot, {
        baseRef: getArg("--base"),
        evidencePath: getArg("--evidence"),
        githubEventPath: getArg("--github-event")
      });
      if (hasFlag("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const issue2 of result.issues) {
          console.log(`${issue2.severity.toUpperCase()} [${issue2.code}] ${issue2.message}${issue2.path ? ` (${issue2.path})` : ""}`);
        }
      }
      process.exit(result.exitCode);
    }
    case "sync": {
      const packageRoot = resolvePackageRoot(PACKAGE_ROOT, getArg("--from"));
      const plan = {
        schemaVersion: 1,
        planId: "sync",
        repositoryRootHash: "",
        sourceHeadSha: null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        detectedLayout: "split",
        proposedConfig: defaultConfig(),
        operations: [],
        postApplySteps: ["write-manifest"],
        evidenceReferences: []
      };
      const configPath = path27.join(repoRoot, "adr.config.json");
      try {
        plan.proposedConfig = parseConfig(JSON.parse(await readFile19(configPath, "utf8"))).config;
      } catch {
      }
      await runSync({ packageRoot, repoRoot, plan });
      console.log("Sync complete.");
      break;
    }
    case "create": {
      const status = getArg("--status");
      const title = getArg("--title");
      const bodyFile = getArg("--body-file");
      if (!status || !title || !bodyFile) throw new Error("Missing create arguments");
      const config = parseConfig(
        JSON.parse(await readFile19(path27.join(repoRoot, "adr.config.json"), "utf8"))
      ).config;
      const body = await readFile19(path27.resolve(bodyFile), "utf8");
      const rel = await runCreate({ repoRoot, config, status, title, body });
      console.log(`Created ${rel}`);
      break;
    }
    case "promote": {
      const adrId = firstPositionalAfter("promote");
      if (!adrId) throw new Error("Missing ADR id");
      const config = parseConfig(
        JSON.parse(await readFile19(path27.join(repoRoot, "adr.config.json"), "utf8"))
      ).config;
      const rel = await runPromote({
        repoRoot,
        config,
        adrId,
        approval: getArg("--approval")
      });
      console.log(`Promoted to ${rel}`);
      break;
    }
    case "supersede": {
      const oldId = firstPositionalAfter("supersede");
      const newId = getArg("--by");
      if (!oldId || !newId) throw new Error("Usage: supersede ADR-NNNN --by ADR-MMMM");
      const config = parseConfig(
        JSON.parse(await readFile19(path27.join(repoRoot, "adr.config.json"), "utf8"))
      ).config;
      await runSupersede({ repoRoot, config, oldAdrId: oldId, newAdrId: newId });
      console.log(`Superseded ${oldId} with ${newId}`);
      break;
    }
    case "attest": {
      const baseRef = getArg("--base");
      if (!baseRef) throw new Error("Missing --base");
      const config = parseConfig(
        JSON.parse(await readFile19(path27.join(repoRoot, "adr.config.json"), "utf8"))
      ).config;
      const evidence = await runAttest({
        repoRoot,
        config,
        baseRef,
        adrIds: getArgs("--adr"),
        noAdrReason: getArg("--no-adr"),
        rationale: getArg("--rationale"),
        reviewedProposalIds: getArgs("--reviewed-proposal")
      });
      const format2 = getArg("--format") ?? "json";
      if (format2 === "github-markdown") {
        const { toGitHubMarkdown: toGitHubMarkdown2 } = await Promise.resolve().then(() => (init_github_evidence(), github_evidence_exports));
        console.log(toGitHubMarkdown2(evidence));
      } else {
        const { serializeDecisionEvidence: serializeDecisionEvidence2 } = await Promise.resolve().then(() => (init_decision_evidence(), decision_evidence_exports));
        console.log(serializeDecisionEvidence2(evidence));
      }
      break;
    }
    case "turn-close": {
      const outcome = getArg("--outcome");
      const reason = getArg("--reason");
      if (!outcome) throw new Error("Missing --outcome");
      if (outcome === "no-change" && !reason) {
        throw new Error("--reason required for no-change outcome");
      }
      await runTurnClose({ repoRoot, outcome, reason, sessionId: getArg("--session-id") });
      console.log("Turn receipt recorded.");
      break;
    }
    default:
      usage();
      process.exit(2);
  }
}
main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
