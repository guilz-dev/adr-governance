#!/usr/bin/env node
// adr-governance hook bundle
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// src/core/numbering.ts
import { createHash as createHash2 } from "node:crypto";
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
function sha256(input) {
  return createHash2("sha256").update(input).digest("hex");
}
var ADR_FILENAME_RE;
var init_numbering = __esm({
  "src/core/numbering.ts"() {
    "use strict";
    ADR_FILENAME_RE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
  }
});

// src/hooks/before-turn.ts
import { mkdir as mkdir4, writeFile as writeFile4 } from "node:fs/promises";
import path7 from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";

// src/hooks/resolve-hook-session-id.ts
import { createHash, randomUUID } from "node:crypto";
var PENDING_SCOPE_WARNING = "[adr-governance] Hook payload has no conversation_id, session_id, or transcript_path; using a repository-wide pending audit scope. Parallel sessions are not isolated.";
function resolveHookTurnKeyOptional(payload) {
  const generationId = readNonEmptyString(payload.generation_id ?? payload.generationId);
  if (generationId) return generationId;
  return readNonEmptyString(
    payload.conversation_id ?? payload.session_id ?? payload.conversationId ?? payload.sessionId
  );
}
function resolveHookTurnKey(payload) {
  return resolveHookTurnKeyOptional(payload) ?? randomUUID();
}
function resolveHookConversationKeyOptional(payload) {
  const runtimeId = readNonEmptyString(
    payload.conversation_id ?? payload.conversationId ?? payload.session_id ?? payload.sessionId
  );
  if (runtimeId) return runtimeId;
  const transcriptPath = readNonEmptyString(payload.transcript_path ?? payload.transcriptPath);
  if (!transcriptPath) return void 0;
  return `transcript-${createHash("sha256").update(transcriptPath).digest("hex")}`;
}
function pendingConversationScopeWarning(payload) {
  return resolveHookConversationKeyOptional(payload) ? void 0 : PENDING_SCOPE_WARNING;
}
function readNonEmptyString(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}

// src/core/types.ts
var SUPPORTED_CONFIG_VERSION = 2;
var SUPPORTED_CONFIG_VERSIONS = [1, 2];

// src/core/config.ts
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

// src/core/risk-signals.ts
init_numbering();
var HIGH_SIGNAL_TERMS_EN = [
  "architecture",
  "boundary",
  "database",
  "storage",
  "migration",
  "auth",
  "permission",
  "api contract",
  "event",
  "queue",
  "provider",
  "deployment",
  "infrastructure",
  "dependency",
  "monorepo",
  "deprecation",
  "delete policy",
  "adr",
  "context",
  "design decision",
  "trade-off",
  "supersede"
];
var HIGH_SIGNAL_TERMS_JA = [
  "\u30A2\u30FC\u30AD\u30C6\u30AF\u30C1\u30E3",
  "\u5883\u754C",
  "\u30C7\u30FC\u30BF\u30D9\u30FC\u30B9",
  "\u30DE\u30A4\u30B0\u30EC\u30FC\u30B7\u30E7\u30F3",
  "\u8A8D\u8A3C",
  "\u6A29\u9650",
  "API\u5951\u7D04",
  "\u30A4\u30D9\u30F3\u30C8",
  "\u30AD\u30E5\u30FC",
  "\u30D7\u30ED\u30D0\u30A4\u30C0",
  "\u30C7\u30D7\u30ED\u30A4",
  "\u30A4\u30F3\u30D5\u30E9",
  "\u4F9D\u5B58",
  "\u30E2\u30CE\u30EC\u30DD",
  "\u975E\u63A8\u5968",
  "\u524A\u9664\u30DD\u30EA\u30B7\u30FC",
  "\u8A2D\u8A08\u5224\u65AD",
  "\u30C8\u30EC\u30FC\u30C9\u30AA\u30D5"
];
var WATCH_PATH_PATTERNS = [
  /package\.json$/i,
  /pnpm-workspace\.yaml$/i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /schema\.ts$/i,
  /migrations?\//i,
  /drizzle\//i,
  /routes?\//i,
  /\.github\/workflows\//i,
  /wrangler\.toml$/i,
  /terraform/i,
  /infra\//i,
  /auth/i,
  /permission/i,
  /policy/i
];
function assessPromptRisk(prompt, config) {
  const normalized = prompt.toLowerCase();
  const signals = [];
  const terms = config.documents.language === "ja" ? [...HIGH_SIGNAL_TERMS_EN, ...HIGH_SIGNAL_TERMS_JA] : HIGH_SIGNAL_TERMS_EN;
  for (const term of terms) {
    if (normalized.includes(term.toLowerCase())) {
      signals.push(`term:${term}`);
    }
  }
  if (signals.length >= 3) return { risk: "likely", signals };
  if (signals.length >= 1) return { risk: "possible", signals };
  return { risk: "none", signals };
}
function isWatchPath(relativePath) {
  return WATCH_PATH_PATTERNS.some((re) => re.test(relativePath));
}
function rankRelevantAdrs(prompt, adrs, limit = 5) {
  const tokens = prompt.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const scored = adrs.map((adr) => {
    const haystack = `${adr.title} ${adr.slug}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1;
    }
    if (adr.frontmatter.status === "proposed") score += 0.5;
    return { adr, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.adr);
}
function hashPrompt(prompt) {
  return sha256(prompt);
}

// src/core/repository-state.ts
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

// src/core/validation.ts
init_numbering();

// src/core/lifecycle.ts
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
var TITLE_RE = /^#\s+(.+)$/m;
var OPEN_POINTS_RE = /^##\s+Open Points\b/im;
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
function extractTitle(body) {
  const match = TITLE_RE.exec(body);
  return match?.[1]?.trim() ?? "Untitled ADR";
}
function hasOpenPoints(body) {
  return OPEN_POINTS_RE.test(body);
}

// src/core/validation.ts
init_numbering();
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

// src/core/repository-state.ts
var CONFIG_FILENAME = "adr.config.json";
var MANIFEST_PATH = ".adr-governance/manifest.json";
var STATE_DIR = ".adr-governance/state";
function findRepoRoot(startPath) {
  let current = path.resolve(startPath);
  while (true) {
    const hasConfig = existsSync(path.join(current, CONFIG_FILENAME));
    const hasManifest = existsSync(path.join(current, MANIFEST_PATH));
    if (hasConfig && hasManifest) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
async function listAdrFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md").map((e) => e.name);
}
async function loadAllAdrs(repoRoot, config) {
  const adrs = [];
  const acceptedDir = path.join(repoRoot, config.layout.acceptedDir);
  const proposedDir = path.join(repoRoot, config.layout.proposedDir);
  for (const name of await listAdrFiles(acceptedDir)) {
    const rel = path.join(config.layout.acceptedDir, name);
    const content = await readFile(path.join(repoRoot, rel), "utf8");
    const parsed = parseAdrFromPath(rel, content, "accepted", config);
    if (parsed) adrs.push(parsed);
  }
  if (config.layout.mode === "split" || config.layout.acceptedDir !== config.layout.proposedDir) {
    for (const name of await listAdrFiles(proposedDir)) {
      const rel = path.join(config.layout.proposedDir, name);
      const content = await readFile(path.join(repoRoot, rel), "utf8");
      const parsed = parseAdrFromPath(rel, content, "proposed", config);
      if (parsed) adrs.push(parsed);
    }
  }
  return adrs.sort((a, b) => a.number - b.number);
}
async function readConfig(repoRoot) {
  const configPath = path.join(repoRoot, CONFIG_FILENAME);
  if (!existsSync(configPath)) return null;
  const raw = await readFile(configPath, "utf8");
  return { raw, path: configPath };
}

// src/hooks/common.ts
function buildStandingReminder() {
  return "ADR governance is active. Record architectural decisions in ADR/CONTEXT when the three criteria apply.";
}
function buildFullInstruction(config, relevantAdrPaths) {
  const paths = relevantAdrPaths.length > 0 ? relevantAdrPaths.map((p) => `- ${p}`).join("\n") : "- (none matched)";
  return [
    "ADR governance: possible or likely architectural impact detected.",
    "Read `.agents/skills/managing-adrs/SKILL.md` completely and follow it.",
    "",
    "Three criteria (all required for a new ADR):",
    "1. Hard to reverse",
    "2. Surprising without context",
    "3. Real trade-off",
    "",
    `Context file: ${config.layout.contextFile}`,
    `Accepted ADRs: ${config.layout.acceptedDir}`,
    `Proposed ADRs: ${config.layout.proposedDir}`,
    "",
    "Relevant ADRs:",
    paths,
    "",
    "Before finishing, update ADR/CONTEXT or explicitly record a no-ADR reason via turn-close when no ADR is required.",
    "The after-turn hook may request one audit follow-up but never records a no-ADR reason on your behalf."
  ].join("\n");
}
function buildHookContext(config, risk, signals, relevantAdrPaths, degradationReason) {
  const standingReminder = buildStandingReminder();
  let fullInstruction = risk === "none" ? standingReminder : buildFullInstruction(config, relevantAdrPaths);
  if (degradationReason) {
    const label = degradationReason === "git-unavailable" ? "unavailable" : degradationReason;
    fullInstruction += `

Repository change detection is using metadata fallback (${label}).
The CI decision gate remains authoritative.`;
  }
  return {
    risk,
    signals,
    relevantAdrPaths,
    config,
    standingReminder,
    fullInstruction
  };
}
var AUDIT_FOLLOWUP_MESSAGE = "ADR audit: this turn may have architectural impact but no ADR/CONTEXT update or no-ADR reason was recorded. Read `.agents/skills/managing-adrs/SKILL.md` and either document the decision or record a reason code.";
function isAuditFollowUpPrompt(prompt) {
  return prompt.trim() === AUDIT_FOLLOWUP_MESSAGE;
}
function decideAfterTurn(state, docsUpdated, config, conversationFollowUpCount = 0, repositoryChanged = false) {
  if (docsUpdated || state.receipt !== null) {
    return { allowFinish: true };
  }
  const effectiveFollowUpCount = Math.max(state.followUpCount, conversationFollowUpCount);
  const auditEnabled = config.hooks.afterTurnAudit && effectiveFollowUpCount < config.hooks.maxFollowUps;
  if (state.isAuditFollowUp) {
    if (auditEnabled) {
      return {
        allowFinish: false,
        followUpMessage: AUDIT_FOLLOWUP_MESSAGE
      };
    }
    return {
      allowFinish: true,
      warning: "ADR evaluation unresolved; CI decision gate remains authoritative"
    };
  }
  if (state.risk === "none" && !repositoryChanged) {
    return { allowFinish: true };
  }
  if (repositoryChanged || state.risk === "likely") {
    if (auditEnabled) {
      return {
        allowFinish: false,
        followUpMessage: AUDIT_FOLLOWUP_MESSAGE
      };
    }
    return {
      allowFinish: true,
      warning: "ADR evaluation unresolved; CI decision gate remains authoritative"
    };
  }
  return { allowFinish: true };
}

// src/core/fingerprint-build.ts
import { createHash as createHash3 } from "node:crypto";
import { existsSync as existsSync2 } from "node:fs";
import { readFile as readFile2, stat as stat2 } from "node:fs/promises";
import path2 from "node:path";
init_numbering();
var MAX_FINGERPRINT_FILES = 500;
var MAX_FINGERPRINT_BYTES = 1024 * 1024;
async function runGit(repoRoot, args) {
  try {
    const { execFile: execFile2 } = await import("node:child_process");
    const { promisify: promisify2 } = await import("node:util");
    const exec = promisify2(execFile2);
    const { stdout } = await exec("git", args, {
      cwd: repoRoot,
      maxBuffer: MAX_FINGERPRINT_BYTES
    });
    return stdout;
  } catch {
    return null;
  }
}
async function metadataHashForPaths(repoRoot, paths, reason) {
  const parts = [];
  for (const rel of paths) {
    try {
      const info = await stat2(path2.join(repoRoot, rel));
      if (!info.isFile()) continue;
      parts.push(`${rel.replace(/\\/g, "/")}\0${info.size}\0${Math.trunc(info.mtimeMs)}`);
    } catch {
      parts.push(`${rel.replace(/\\/g, "/")}\0-\0-`);
    }
  }
  return {
    hash: sha256(parts.join("\n")),
    mode: "metadata",
    reason
  };
}
async function hashUntrackedFiles(repoRoot, status) {
  const paths = status.split("\0").filter((entry) => entry.startsWith("?? ")).map((entry) => entry.slice(3));
  if (paths.length > MAX_FINGERPRINT_FILES) {
    return metadataHashForPaths(repoRoot, paths, "untracked-count");
  }
  const hashes = [];
  for (const rel of paths) {
    try {
      const file = path2.join(repoRoot, rel);
      const info = await stat2(file);
      if (!info.isFile()) continue;
      if (info.size > MAX_FINGERPRINT_BYTES) {
        return metadataHashForPaths(repoRoot, paths, "untracked-size");
      }
      const content = await readFile2(file);
      hashes.push(`${rel}:${createHash3("sha256").update(content).digest("hex")}`);
    } catch {
      return null;
    }
  }
  return { hash: sha256(hashes.join("\n")), mode: "content" };
}
async function observeRepositoryState(repoRoot) {
  const [status, head, diff] = await Promise.all([
    runGit(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    runGit(repoRoot, ["rev-parse", "HEAD"]),
    runGit(repoRoot, ["diff", "--no-ext-diff", "--binary", "HEAD"])
  ]);
  if (status === null || head === null || diff === null) return null;
  const untracked = await hashUntrackedFiles(repoRoot, status);
  if (untracked === null) return null;
  return {
    gitStatusHash: createHash3("sha256").update(status).digest("hex"),
    repositoryStateHash: sha256(`${head}
${diff}
${untracked.hash}`),
    collectionMode: untracked.mode,
    degradationReason: untracked.reason
  };
}
async function hashWatchFile(repoRoot, rel) {
  const abs = path2.join(repoRoot, rel);
  if (!existsSync2(abs)) return null;
  try {
    const s = await stat2(abs);
    if (!s.isFile()) return null;
    const content = await readFile2(abs, "utf8");
    return sha256(content);
  } catch {
    return null;
  }
}
async function readWatchPathsGitStatusHash(repoRoot, watchPaths) {
  if (watchPaths.length === 0) return sha256("");
  try {
    const { execFile: execFile2 } = await import("node:child_process");
    const { promisify: promisify2 } = await import("node:util");
    const exec = promisify2(execFile2);
    const { stdout } = await exec("git", ["status", "--porcelain"], { cwd: repoRoot });
    const matchingLines = stdout.split("\n").filter((line) => line.length > 3).filter((line) => {
      const file = (line.slice(3).trim().split(" -> ").pop() ?? "").trim();
      return watchPaths.some(
        (watchPath) => file === watchPath || file.startsWith(`${watchPath}/`) || watchPath.startsWith(`${file}/`)
      );
    });
    return sha256(matchingLines.join("\n"));
  } catch {
    return sha256("");
  }
}
async function hashOverflowWatchPaths(repoRoot, overflowPaths) {
  const parts = [];
  for (const rel of overflowPaths) {
    const hash = await hashWatchFile(repoRoot, rel);
    if (hash) parts.push(`${rel}:${hash}`);
  }
  return sha256(parts.join("\n"));
}
async function buildRepositoryFingerprint(repoRoot, trackedRelativePaths) {
  const watchPaths = trackedRelativePaths.filter(isWatchPath);
  const truncated = watchPaths.length > MAX_FINGERPRINT_FILES;
  const selected = truncated ? watchPaths.slice(0, MAX_FINGERPRINT_FILES) : watchPaths;
  const overflowPaths = truncated ? watchPaths.slice(MAX_FINGERPRINT_FILES) : [];
  const contentHashes = {};
  for (const rel of selected) {
    const hash = await hashWatchFile(repoRoot, rel);
    if (hash) contentHashes[rel] = hash;
  }
  const observation = await observeRepositoryState(repoRoot);
  const gitStatusHash = observation?.gitStatusHash ?? sha256("");
  const watchGitStatusHash = await readWatchPathsGitStatusHash(repoRoot, watchPaths);
  const overflowWatchHash = await hashOverflowWatchPaths(repoRoot, overflowPaths);
  const collectionMode = observation?.collectionMode ?? "unavailable";
  const degradationReason = observation === null ? "git-unavailable" : observation.degradationReason;
  return {
    paths: truncated ? watchPaths : selected,
    gitStatusHash,
    watchGitStatusHash,
    overflowWatchHash,
    contentHashes,
    repositoryStateHash: observation?.repositoryStateHash,
    collectionMode,
    degradationReason
  };
}
function degradationWarningMessage(reason) {
  const label = reason === "git-unavailable" ? "unavailable" : reason;
  return `Repository change detection is using metadata fallback (${label}).
The CI decision gate remains authoritative.`;
}

// src/core/fingerprint.ts
function repositoryFingerprintChanged(before, after) {
  const beforeMode = before.collectionMode ?? "unavailable";
  const afterMode = after.collectionMode ?? "unavailable";
  if (beforeMode === "unavailable" || afterMode === "unavailable") {
    return null;
  }
  if (!before.repositoryStateHash || !after.repositoryStateHash) {
    return null;
  }
  return before.repositoryStateHash !== after.repositoryStateHash;
}

// src/core/decision-corpus.ts
init_numbering();
import { existsSync as existsSync3 } from "node:fs";
import { readFile as readFile3 } from "node:fs/promises";
import path3 from "node:path";
function normalizeRepoPath(relativePath) {
  return relativePath.split(path3.sep).join("/");
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
async function listWorkingCorpusPaths(repoRoot, config) {
  const paths = [];
  const { readdir: readdir4 } = await import("node:fs/promises");
  for (const dir of corpusDirectories(config)) {
    const abs = path3.join(repoRoot, dir);
    if (!existsSync3(abs)) continue;
    const names = await readdir4(abs);
    for (const name of names.sort()) {
      if (!isAdrMarkdown(name)) continue;
      paths.push(normalizeRepoPath(path3.join(dir, name)));
    }
  }
  for (const file of [config.layout.contextFile, config.layout.contextMapFile]) {
    if (existsSync3(path3.join(repoRoot, file))) {
      paths.push(normalizeRepoPath(file));
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
async function buildWorkingDecisionCorpus(repoRoot, config) {
  const paths = await listWorkingCorpusPaths(repoRoot, config);
  return collectCorpusEntries(paths, async (relativePath) => {
    const abs = path3.join(repoRoot, relativePath);
    if (!existsSync3(abs)) return null;
    return readFile3(abs, "utf8");
  });
}
function hashDecisionCorpus(entries) {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const payload = sorted.map((e) => `${e.path}\0${e.contentHash}
`).join("");
  return `sha256:${sha256(payload)}`;
}
function snapshotDecisionCorpus(entries) {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  return {
    hash: hashDecisionCorpus(sorted),
    entries: sorted
  };
}
function changedDecisionCorpusPaths(before, after) {
  const beforeMap = new Map(before.entries.map((entry) => [entry.path, entry.contentHash]));
  const afterMap = new Map(after.entries.map((entry) => [entry.path, entry.contentHash]));
  const paths = /* @__PURE__ */ new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changed = [];
  for (const relativePath of paths) {
    if (beforeMap.get(relativePath) !== afterMap.get(relativePath)) {
      changed.push(relativePath);
    }
  }
  return changed.sort();
}

// src/core/locks.ts
import { mkdir, open, readFile as readFile4, readdir as readdir2, rm, lstat, unlink, writeFile } from "node:fs/promises";
import { existsSync as existsSync4 } from "node:fs";
import path4 from "node:path";
var LOCK_STALE_MS = 10 * 60 * 1e3;
async function pruneOldState(repoRoot, maxAgeDays = 7) {
  const stateDir = path4.join(repoRoot, ".adr-governance/state");
  if (!existsSync4(stateDir)) return;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1e3;
  const entries = await readdir2(stateDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "locks") continue;
    await pruneStateEntry(path4.join(stateDir, entry.name), cutoff);
  }
}
async function pruneStateEntry(entryPath, cutoff) {
  const entryStat = await lstat(entryPath);
  if (entryStat.isDirectory()) {
    const children = await readdir2(entryPath);
    for (const child of children) {
      await pruneStateEntry(path4.join(entryPath, child), cutoff);
    }
    return;
  }
  if (entryStat.mtimeMs < cutoff) {
    await rm(entryPath, { force: true });
  }
}

// src/cli/git.ts
import { execFile } from "node:child_process";
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

// src/hooks/audit-chain.ts
import { mkdir as mkdir3, readFile as readFile6, unlink as unlink2, writeFile as writeFile3 } from "node:fs/promises";
import path6 from "node:path";

// src/hooks/turn-pointer.ts
import { mkdir as mkdir2, readdir as readdir3, readFile as readFile5, writeFile as writeFile2 } from "node:fs/promises";
import path5 from "node:path";
var CURRENT_TURN_DIR = ".adr-governance/state/current-turn";
var LEGACY_CURRENT_TURN_POINTER = ".adr-governance/state/current-turn.json";
function sanitizeSessionId(sessionId) {
  const trimmed = sessionId.trim();
  if (!trimmed) return "default";
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}
function turnPointerRelPath(sessionId) {
  return path5.join(CURRENT_TURN_DIR, `${sanitizeSessionId(sessionId)}.json`);
}
async function writeTurnPointer(repoRoot, sessionId, pointer) {
  const pointerPath = path5.join(repoRoot, turnPointerRelPath(sessionId));
  await mkdir2(path5.dirname(pointerPath), { recursive: true });
  await writeFile2(pointerPath, JSON.stringify(pointer, null, 2));
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
async function readPointerTurnState(repoRoot, relPointer) {
  try {
    const pointer = JSON.parse(await readFile5(path5.join(repoRoot, relPointer), "utf8"));
    if (!pointer.turnStatePath) return null;
    const statePath = path5.join(repoRoot, pointer.turnStatePath);
    return JSON.parse(await readFile5(statePath, "utf8"));
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
  return path6.join(AUDIT_CHAIN_DIR, `${sanitizeSessionId(conversationId)}.json`);
}
async function loadAuditChain(repoRoot, conversationId) {
  try {
    const raw = await readFile6(path6.join(repoRoot, auditChainRelPath(conversationId)), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function loadAuditChainForScope(repoRoot, conversationId) {
  return loadAuditChain(repoRoot, auditChainScope(conversationId));
}
async function writeAuditChain(repoRoot, state) {
  const rel = auditChainRelPath(state.conversationId);
  const abs = path6.join(repoRoot, rel);
  await mkdir3(path6.dirname(abs), { recursive: true });
  await writeFile3(abs, JSON.stringify(state, null, 2));
}
async function clearAuditChain(repoRoot, conversationId) {
  try {
    await unlink2(path6.join(repoRoot, auditChainRelPath(conversationId)));
  } catch {
  }
}
async function incrementAuditChainFollowUp(repoRoot, conversationId, turnId) {
  const existing = await loadAuditChain(repoRoot, conversationId);
  const next = {
    schemaVersion: 1,
    conversationId,
    followUpCount: (existing?.followUpCount ?? 0) + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastTurnId: turnId,
    pendingAudit: true
  };
  await writeAuditChain(repoRoot, next);
  return next;
}
async function incrementAuditChainFollowUpForScope(repoRoot, conversationId, turnId) {
  return incrementAuditChainFollowUp(repoRoot, auditChainScope(conversationId), turnId);
}
async function markAuditChainResolvedForScope(repoRoot, conversationId) {
  await clearAuditChain(repoRoot, auditChainScope(conversationId));
}

// src/hooks/before-turn.ts
async function runBeforeTurn(input) {
  const repoRoot = findRepoRoot(input.cwd);
  if (!repoRoot) return { ok: true };
  const configFile = await readConfig(repoRoot);
  if (!configFile) return { ok: true };
  let config;
  try {
    config = parseConfig(JSON.parse(configFile.raw)).config;
  } catch (e) {
    return { ok: true, warning: `Invalid adr.config.json: ${String(e)}` };
  }
  if (!config.hooks.enabled) return { ok: true };
  await pruneOldState(repoRoot).catch(() => void 0);
  const conversationId = input.conversationId?.trim() || (input.hookPayload ? resolveHookConversationKeyOptional(input.hookPayload) : void 0);
  const isAuditFollowUp = isAuditFollowUpPrompt(input.prompt);
  if (!isAuditFollowUp) {
    await markAuditChainResolvedForScope(repoRoot, conversationId);
  }
  const auditChain = isAuditFollowUp ? await loadAuditChainForScope(repoRoot, conversationId) : null;
  const adrs = await loadAllAdrs(repoRoot, config);
  const assessed = isAuditFollowUp ? { risk: "none", signals: ["audit-follow-up"] } : assessPromptRisk(input.prompt, config);
  const relevant = isAuditFollowUp ? [] : rankRelevantAdrs(input.prompt, adrs);
  const tracked = await gitLsFiles(repoRoot);
  const beforeFingerprint = await buildRepositoryFingerprint(repoRoot, tracked);
  const degradationReason = beforeFingerprint.degradationReason;
  const shouldWarnDegradation = degradationReason !== void 0;
  const hookContext = buildHookContext(
    config,
    assessed.risk,
    assessed.signals,
    relevant.map((a) => a.path),
    shouldWarnDegradation ? degradationReason : void 0
  );
  const stateDir = path7.join(repoRoot, STATE_DIR, "turns");
  await mkdir4(stateDir, { recursive: true });
  const turnId = randomUUID2();
  const sessionId = input.sessionId?.trim() || (input.hookPayload ? resolveHookTurnKey(input.hookPayload) : randomUUID2());
  const beforeDecisionCorpus = snapshotDecisionCorpus(
    await buildWorkingDecisionCorpus(repoRoot, config)
  );
  const turnState = {
    schemaVersion: 2,
    sessionId,
    turnId,
    conversationId,
    isAuditFollowUp: isAuditFollowUp || void 0,
    promptHash: hashPrompt(input.prompt),
    risk: assessed.risk,
    signals: assessed.signals,
    beforeFingerprint,
    beforeDecisionCorpus,
    degradationWarningShown: shouldWarnDegradation || void 0,
    relevantAdrPaths: relevant.map((a) => a.path),
    followUpCount: auditChain?.followUpCount ?? 0,
    receipt: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const turnStatePath = path7.join(stateDir, `${turnId}.json`);
  await writeFile4(turnStatePath, JSON.stringify(turnState, null, 2));
  await writeTurnPointer(repoRoot, sessionId, {
    turnId,
    turnStatePath: path7.relative(repoRoot, turnStatePath),
    risk: assessed.risk,
    fullInstruction: hookContext.fullInstruction,
    updatedAt: turnState.createdAt
  });
  if (conversationId) {
    await writeTurnPointer(repoRoot, conversationId, {
      turnId,
      turnStatePath: path7.relative(repoRoot, turnStatePath),
      risk: assessed.risk,
      fullInstruction: hookContext.fullInstruction,
      updatedAt: turnState.createdAt
    });
  }
  return {
    ok: true,
    hookContext,
    turnStatePath,
    sessionId,
    conversationId,
    warning: shouldWarnDegradation ? degradationWarningMessage(degradationReason) : void 0
  };
}
async function loadCurrentTurnState(repoRoot, sessionId) {
  return loadTurnStateForSession(repoRoot, sessionId);
}

// src/hooks/after-turn.ts
import { writeFile as writeFile5 } from "node:fs/promises";
import path8 from "node:path";
async function runAfterTurn(input) {
  const repoRoot = findRepoRoot(input.cwd);
  if (!repoRoot) return { allowFinish: true };
  const configFile = await readConfig(repoRoot);
  if (!configFile) return { allowFinish: true };
  let config;
  try {
    config = parseConfig(JSON.parse(configFile.raw)).config;
  } catch {
    return { allowFinish: true, warning: "Invalid adr.config.json" };
  }
  if (!config.hooks.enabled || !config.hooks.afterTurnAudit) {
    return { allowFinish: true };
  }
  const state = await loadCurrentTurnState(repoRoot, input.sessionId) ?? (input.conversationId ? await loadCurrentTurnState(repoRoot, input.conversationId) : null);
  if (!state) return { allowFinish: true };
  const conversationId = input.conversationId ?? state.conversationId;
  const auditChain = await loadAuditChainForScope(repoRoot, conversationId);
  const conversationFollowUpCount = auditChain?.followUpCount ?? 0;
  let docsUpdated = false;
  let warning;
  if (state.beforeDecisionCorpus) {
    const afterDecisionCorpus = snapshotDecisionCorpus(
      await buildWorkingDecisionCorpus(repoRoot, config)
    );
    docsUpdated = state.beforeDecisionCorpus.hash !== afterDecisionCorpus.hash;
    if (docsUpdated) {
      state.changedDecisionCorpusPaths = changedDecisionCorpusPaths(
        state.beforeDecisionCorpus,
        afterDecisionCorpus
      );
    }
  } else {
    warning = "Legacy turn state without decision corpus snapshot; docs update not verified (fail-open)";
    docsUpdated = false;
  }
  const afterFingerprint = await buildRepositoryFingerprint(repoRoot, await gitLsFiles(repoRoot));
  const repositoryChanged = repositoryFingerprintChanged(state.beforeFingerprint, afterFingerprint);
  const decision = decideAfterTurn(
    state,
    docsUpdated,
    config,
    conversationFollowUpCount,
    repositoryChanged === true
  );
  if (docsUpdated || state.receipt !== null) {
    await markAuditChainResolvedForScope(repoRoot, conversationId);
  }
  if (!decision.allowFinish && decision.followUpMessage) {
    state.followUpCount += 1;
    const stateDir = path8.join(repoRoot, STATE_DIR, "turns");
    const statePath = path8.join(stateDir, `${state.turnId}.json`);
    await writeFile5(statePath, JSON.stringify(state, null, 2));
    await incrementAuditChainFollowUpForScope(repoRoot, conversationId, state.turnId);
  }
  return {
    ...decision,
    warning: warning ?? decision.warning
  };
}

// src/hooks/adapters/cursor.ts
function toCursorSessionStart(ctx) {
  return {
    continue: true,
    additional_context: ctx?.standingReminder
  };
}
function toCursorBeforeSubmit() {
  return { continue: true };
}
function toCursorStop(followUpMessage) {
  if (!followUpMessage) return {};
  return { followup_message: followUpMessage };
}
function toClaudeUserPromptSubmit(ctx) {
  if (!ctx?.fullInstruction) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: ctx.fullInstruction
    }
  };
}
function toClaudeStop(followUpMessage) {
  if (!followUpMessage) return {};
  return {
    decision: "block",
    reason: followUpMessage
  };
}
function toGeminiBeforeAgent(ctx) {
  if (!ctx?.fullInstruction) return { decision: "allow" };
  return {
    decision: "allow",
    hookSpecificOutput: {
      additionalContext: ctx.fullInstruction
    }
  };
}
function toGeminiAfterAgent(followUpMessage) {
  if (!followUpMessage) return { decision: "allow" };
  return { decision: "deny", reason: followUpMessage };
}

// src/hooks/hook-main.ts
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function resolveRepoRoot(cwd) {
  return findRepoRoot(cwd);
}
async function main() {
  const runtime = process.argv[2] ?? "cursor";
  const phase = process.argv[3] ?? "before-turn";
  const payload = await readStdinJson();
  const cwd = String(payload.cwd ?? process.cwd());
  const prompt = String(payload.prompt ?? payload.text ?? payload.user_message ?? "");
  const repoRoot = resolveRepoRoot(cwd);
  const conversationId = resolveHookConversationKeyOptional(payload);
  const scopeWarning = pendingConversationScopeWarning(payload);
  if (repoRoot && scopeWarning) console.error(scopeWarning);
  try {
    if (phase === "before-turn" || phase === "session-start") {
      const result = await runBeforeTurn({
        cwd,
        prompt,
        sessionId: resolveHookTurnKey(payload),
        conversationId,
        hookPayload: payload
      });
      const ctx = result.hookContext;
      if (runtime === "cursor") {
        const out = phase === "session-start" ? toCursorSessionStart(ctx) : toCursorBeforeSubmit();
        process.stdout.write(JSON.stringify(out));
        if (result.warning) console.error(result.warning);
        return;
      }
      if (runtime === "claude" || runtime === "codex") {
        process.stdout.write(JSON.stringify(toClaudeUserPromptSubmit(ctx)));
        if (result.warning) console.error(result.warning);
        return;
      }
      if (runtime === "gemini") {
        process.stdout.write(JSON.stringify(toGeminiBeforeAgent(ctx)));
        if (result.warning) console.error(result.warning);
        return;
      }
    }
    if (phase === "after-turn") {
      const result = await runAfterTurn({
        cwd,
        sessionId: resolveHookTurnKeyOptional(payload),
        conversationId
      });
      if (runtime === "cursor") {
        process.stdout.write(JSON.stringify(toCursorStop(result.followUpMessage)));
        if (result.warning && !result.warning.includes("Legacy turn state")) {
          console.error(result.warning);
        }
        return;
      }
      if (runtime === "claude" || runtime === "codex") {
        process.stdout.write(JSON.stringify(toClaudeStop(result.followUpMessage)));
        if (result.warning && !result.warning.includes("Legacy turn state")) {
          console.error(result.warning);
        }
        return;
      }
      if (runtime === "gemini") {
        process.stdout.write(JSON.stringify(toGeminiAfterAgent(result.followUpMessage)));
        if (result.warning && !result.warning.includes("Legacy turn state")) {
          console.error(result.warning);
        }
        return;
      }
    }
    process.stdout.write(JSON.stringify({ continue: true }));
  } catch (e) {
    console.error(String(e));
    process.stdout.write(JSON.stringify({ continue: true }));
  }
}
void main();
