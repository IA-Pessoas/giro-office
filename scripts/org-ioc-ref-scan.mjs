import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanBlob } from "./supply-chain-integrity.mjs";

const API_ORIGIN = "https://api.github.com";
const MAX_REPOSITORIES = 500;
const MAX_REPOSITORY_PAGES = 5;
const MAX_FETCH_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 60_000;
const MAX_CONCURRENCY = 2;
const MAX_REFS_PER_REPOSITORY = 10_000;
const MAX_BLOB_BYTES = 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_PREVIOUS_REPORT_BYTES = 2 * 1024 * 1024;
const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const REF_PATTERN = /^refs\/(?:heads|tags|pull)\/[A-Za-z0-9._/-]+$/u;
const OBJECT_ID_PATTERN = /^[a-f0-9]{40,64}$/u;
const SAFE_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\x20-\x7e]{1,1024}$/u;
const ELIGIBLE_PATH_PATTERN =
  /(?:^|\/)(?:\.github\/(?:actions|workflows)\/.+|\.husky\/.+|\.vscode\/.+|\.cursor\/.+|\.agents\/.+|scripts\/.+|docker\/.+|\.npmrc|package\.json|(?:babel|biome|eslint|next|nuxt|postcss|prettier|tailwind|tsup|vite|webpack)\.config\.(?:cjs|cts|js|json|mjs|mts|ts)|Dockerfile|[^/]+\.(?:woff|woff2))$/iu;

function fail(message) {
  throw new Error(message);
}

function validateOptions({
  organization,
  token,
  workspace,
  maxRepositories,
  concurrency,
  maxBlobBytes,
  maxRefsPerRepository,
}) {
  if (typeof organization !== "string" || !OWNER_PATTERN.test(organization)) {
    fail("invalid organization");
  }
  if (typeof token !== "string" || token.trim() === "") fail("missing token");
  if (typeof workspace !== "string" || workspace.trim() === "") fail("missing workspace");
  if (
    !Number.isInteger(maxRepositories) ||
    maxRepositories < 1 ||
    maxRepositories > MAX_REPOSITORIES
  ) {
    fail("invalid repository limit");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    fail("invalid concurrency");
  }
  if (!Number.isInteger(maxBlobBytes) || maxBlobBytes < 1 || maxBlobBytes > MAX_BLOB_BYTES) {
    fail("invalid blob limit");
  }
  if (
    !Number.isInteger(maxRefsPerRepository) ||
    maxRefsPerRepository < 1 ||
    maxRefsPerRepository > MAX_REFS_PER_REPOSITORY
  ) {
    fail("invalid ref limit");
  }
}

function safeApiUrl(value, organization) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("invalid pagination URL");
  }
  const expectedPath = `/orgs/${encodeURIComponent(organization)}/repos`;
  const allowedKeys = new Set(["type", "per_page", "page"]);
  if (
    url.origin !== API_ORIGIN ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== expectedPath ||
    [...url.searchParams.keys()].some((key) => !allowedKeys.has(key)) ||
    url.searchParams.get("type") !== "all" ||
    url.searchParams.get("per_page") !== "100"
  ) {
    fail("invalid pagination URL");
  }
  const page = url.searchParams.get("page");
  if (page !== null && (!/^[1-9][0-9]*$/u.test(page) || Number(page) > MAX_REPOSITORIES)) {
    fail("invalid pagination URL");
  }
  return url;
}

function nextPageUrl(response, organization) {
  const link = response.headers.get("link");
  if (!link) return undefined;
  const match = /<([^>]+)>;\s*rel="next"/u.exec(link);
  return match ? safeApiUrl(match[1], organization).toString() : undefined;
}

function projectRepository(value) {
  if (!value || typeof value !== "object" || !REPOSITORY_PATTERN.test(value.full_name ?? "")) {
    return undefined;
  }
  return {
    fullName: value.full_name,
    archived: value.archived === true,
    disabled: value.disabled === true,
    fork: value.fork === true,
    isTemplate: value.is_template === true,
    mirror: typeof value.mirror_url === "string" && value.mirror_url.length > 0,
  };
}

function retryDelay(response, attempt, now = Date.now()) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0)
    return Math.min(retryAfter * 1000, MAX_BACKOFF_MS);
  const resetAt = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(resetAt) && resetAt * 1000 > now)
    return Math.min(resetAt * 1000 - now, MAX_BACKOFF_MS);
  return Math.min(100 * 2 ** attempt, MAX_BACKOFF_MS);
}

async function fetchInventoryPage(fetchImpl, url, headers, sleep) {
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers });
      if (response?.ok || !response || ![429, 500, 502, 503, 504].includes(response.status))
        return response;
      if (attempt === MAX_FETCH_ATTEMPTS - 1) return response;
      await sleep(retryDelay(response, attempt));
    } catch {
      if (attempt === MAX_FETCH_ATTEMPTS - 1) throw new Error("inventory request failed");
      await sleep(Math.min(100 * 2 ** attempt, MAX_BACKOFF_MS));
    }
  }
  throw new Error("inventory request failed");
}

async function listRepositories({ organization, token, fetchImpl, maxRepositories, sleep }) {
  const repositories = [];
  let coverageLimited = false;
  let pages = 0;
  let next = safeApiUrl(
    `${API_ORIGIN}/orgs/${encodeURIComponent(organization)}/repos?type=all&per_page=100`,
    organization,
  ).toString();

  while (next && repositories.length < maxRepositories && pages < MAX_REPOSITORY_PAGES) {
    pages += 1;
    let response;
    try {
      response = await fetchInventoryPage(
        fetchImpl,
        next,
        {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        sleep,
      );
    } catch {
      return {
        repositories,
        errors: [{ code: "inventory_request_failed" }],
        coverageLimited: true,
      };
    }
    if (!response || !response.ok) {
      return {
        repositories,
        errors: [{ code: "inventory_request_failed" }],
        coverageLimited: true,
      };
    }
    let body;
    try {
      body = await response.json();
    } catch {
      return {
        repositories,
        errors: [{ code: "inventory_response_invalid" }],
        coverageLimited: true,
      };
    }
    if (!Array.isArray(body)) {
      return {
        repositories,
        errors: [{ code: "inventory_response_invalid" }],
        coverageLimited: true,
      };
    }
    for (const item of body) {
      if (repositories.length === maxRepositories) {
        coverageLimited = true;
        break;
      }
      const repository = projectRepository(item);
      if (repository) repositories.push(repository);
    }
    next = nextPageUrl(response, organization);
    if (next && (repositories.length === maxRepositories || pages === MAX_REPOSITORY_PAGES))
      coverageLimited = true;
  }
  return {
    repositories,
    errors: coverageLimited ? [{ code: "repository_limit_reached" }] : [],
    coverageLimited,
  };
}

function outputBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value);
  throw new Error("invalid command result");
}

function runNativeGit(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, GIT_TERMINAL_PROMPT: "0" },
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks = [];
    let size = 0;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_GIT_OUTPUT_BYTES) child.kill();
      else chunks.push(chunk);
    });
    child.once("error", () => reject(new Error("git failed")));
    child.once("close", (status) => {
      if (size > MAX_GIT_OUTPUT_BYTES || status !== 0) reject(new Error("git failed"));
      else resolve(Buffer.concat(chunks));
    });
  });
}

async function runGit(commandRunner, args, options = {}) {
  try {
    const result = commandRunner
      ? await commandRunner("git", args, { ...options, shell: false })
      : { stdout: await runNativeGit(args, options) };
    const stdout = outputBuffer(result?.stdout);
    if (stdout.length > MAX_GIT_OUTPUT_BYTES) throw new Error("git output too large");
    return stdout;
  } catch {
    throw new Error("git failed");
  }
}

function parseRefs(output, repository, now, maxRefsPerRepository) {
  const refs = [];
  for (const line of output.toString("utf8").split(/\r?\n/u)) {
    if (!line) continue;
    const [name, objectId, createdAt] = line.split("\0");
    if (!REF_PATTERN.test(name ?? "") || !OBJECT_ID_PATTERN.test(objectId ?? "")) continue;
    const timestamp = Number(createdAt);
    const status = name.startsWith("refs/pull/")
      ? "evidence-only"
      : repository.archived
        ? "archived"
        : repository.fork
          ? "fork"
          : Number.isFinite(timestamp) && timestamp * 1000 < now - STALE_AFTER_MS
            ? "stale"
            : "active";
    refs.push({ name, objectId, status });
  }
  const sorted = refs.sort((left, right) => left.name.localeCompare(right.name));
  return {
    refs: sorted.slice(0, maxRefsPerRepository),
    limited: sorted.length > maxRefsPerRepository,
  };
}

function isEligiblePath(relativePath) {
  return SAFE_PATH_PATTERN.test(relativePath) && ELIGIBLE_PATH_PATTERN.test(relativePath);
}

function parseTree(output) {
  const entries = [];
  for (const record of output.toString("utf8").split("\0")) {
    if (!record) continue;
    const match = /^[0-7]{6} blob ([a-f0-9]{40,64})\t(.+)$/u.exec(record);
    if (match && isEligiblePath(match[2])) entries.push({ blobSha: match[1], path: match[2] });
  }
  return entries;
}

async function refChangesFor(repository, refs, previousReport, commandRunner, mirrorDirectory) {
  const previousRefs = new Map();
  for (const item of previousReport?.repositories ?? []) {
    if (!item || item.fullName !== repository.fullName || !Array.isArray(item.refs)) continue;
    for (const ref of item.refs) {
      if (REF_PATTERN.test(ref?.name ?? "") && OBJECT_ID_PATTERN.test(ref?.objectId ?? "")) {
        previousRefs.set(ref.name, ref.objectId);
      }
    }
  }
  const changes = [];
  for (const { name, objectId } of refs) {
    const previousObjectId = previousRefs.get(name);
    if (!previousObjectId || previousObjectId === objectId) continue;
    try {
      await runGit(commandRunner, [
        "-C",
        mirrorDirectory,
        "merge-base",
        "--is-ancestor",
        previousObjectId,
        objectId,
      ]);
    } catch {
      changes.push({
        repository: repository.fullName,
        ref: name,
        kind: "root-history-replacement",
        cleanRecoverySha: previousObjectId,
        requiresHumanApproval: true,
        backupStatus: "unknown",
        approver: "human-approval-required",
        rollbackPath: "manual-approved-quarantine-recovery",
      });
    }
  }
  return changes;
}

function safeDedupeKey({ repository, ref, blobSha, path: relativePath, ruleId }) {
  return createHash("sha256")
    .update(`${repository}\0${ref}\0${blobSha}\0${relativePath}\0${ruleId}`)
    .digest("hex");
}

async function scanRepository({
  repository,
  workspace,
  token,
  commandRunner,
  now,
  previousReport,
  maxBlobBytes,
  maxRefsPerRepository,
}) {
  let mirrorDirectory;
  let largeBlobsSkipped = 0;
  try {
    await mkdir(workspace, { recursive: true });
    mirrorDirectory = await mkdtemp(path.join(path.resolve(workspace), "org-ioc-ref-"));
    const cloneHeader = {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.extraHeader",
      GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`,
      GIT_TERMINAL_PROMPT: "0",
    };
    await runGit(
      commandRunner,
      [
        "clone",
        "--mirror",
        "--no-local",
        "--",
        `https://github.com/${repository.fullName}.git`,
        mirrorDirectory,
      ],
      { env: cloneHeader },
    );
    await runGit(
      commandRunner,
      ["-C", mirrorDirectory, "fetch", "origin", "+refs/pull/*/head:refs/pull/*/head"],
      { env: cloneHeader },
    );
    await runGit(commandRunner, ["-C", mirrorDirectory, "remote", "remove", "origin"]);
    const parsedRefs = parseRefs(
      await runGit(commandRunner, [
        "-C",
        mirrorDirectory,
        "for-each-ref",
        "--format=%(refname)%00%(objectname)%00%(creatordate:unix)",
        "refs/heads",
        "refs/tags",
        "refs/pull",
      ]),
      repository,
      now,
      maxRefsPerRepository,
    );
    const { refs } = parsedRefs;
    const blobs = new Map();
    for (const ref of refs) {
      const entries = parseTree(
        await runGit(commandRunner, [
          "-C",
          mirrorDirectory,
          "ls-tree",
          "-r",
          "-z",
          "--full-tree",
          ref.name,
        ]),
      );
      for (const entry of entries) {
        const mapped = blobs.get(entry.blobSha) ?? [];
        mapped.push({ ref: ref.name, path: entry.path, status: ref.status });
        blobs.set(entry.blobSha, mapped);
      }
    }
    const findings = [];
    for (const [blobSha, mappings] of blobs) {
      const size = Number(
        (await runGit(commandRunner, ["-C", mirrorDirectory, "cat-file", "-s", blobSha]))
          .toString("utf8")
          .trim(),
      );
      if (!Number.isSafeInteger(size) || size < 0 || size > maxBlobBytes) {
        largeBlobsSkipped += 1;
        continue;
      }
      const bytes = await runGit(commandRunner, [
        "-C",
        mirrorDirectory,
        "cat-file",
        "blob",
        blobSha,
      ]);
      for (const mapping of mappings) {
        for (const finding of scanBlob(mapping.path, bytes)) {
          findings.push({
            repository: repository.fullName,
            ref: mapping.ref,
            path: mapping.path,
            blobSha,
            ruleId: finding.ruleId,
            ...(Number.isInteger(finding.line) ? { line: finding.line } : {}),
            status: mapping.status,
          });
        }
      }
    }
    findings.sort((left, right) =>
      `${left.repository}\0${left.ref}\0${left.path}\0${left.ruleId}\0${left.line ?? 0}`.localeCompare(
        `${right.repository}\0${right.ref}\0${right.path}\0${right.ruleId}\0${right.line ?? 0}`,
      ),
    );
    return {
      repository: { ...repository, refs, scanStatus: "scanned" },
      findings,
      refChanges: await refChangesFor(
        repository,
        refs,
        previousReport,
        commandRunner,
        mirrorDirectory,
      ),
      errors: [
        ...(largeBlobsSkipped > 0
          ? [{ repository: repository.fullName, code: "blob_size_limit_reached" }]
          : []),
        ...(parsedRefs.limited
          ? [{ repository: repository.fullName, code: "ref_limit_reached" }]
          : []),
      ],
      blobs: blobs.size,
      largeBlobsSkipped,
    };
  } catch {
    return {
      repository: { ...repository, refs: [], scanStatus: "failed" },
      findings: [],
      refChanges: [],
      errors: [{ repository: repository.fullName, code: "repository_scan_failed" }],
      blobs: 0,
      largeBlobsSkipped: 0,
    };
  } finally {
    if (mirrorDirectory) await rm(mirrorDirectory, { recursive: true, force: true });
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

export async function scanOrganization({
  organization,
  token,
  workspace,
  fetchImpl = fetch,
  commandRunner,
  now = new Date().toISOString(),
  previousReport,
  maxRepositories = MAX_REPOSITORIES,
  concurrency = MAX_CONCURRENCY,
  maxBlobBytes = MAX_BLOB_BYTES,
  maxRefsPerRepository = MAX_REFS_PER_REPOSITORY,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
} = {}) {
  validateOptions({
    organization,
    token,
    workspace,
    maxRepositories,
    concurrency,
    maxBlobBytes,
    maxRefsPerRepository,
  });
  const generatedAt = new Date(now).toISOString();
  if (Number.isNaN(Date.parse(generatedAt))) fail("invalid timestamp");
  const inventory = await listRepositories({
    organization,
    token,
    fetchImpl,
    maxRepositories,
    sleep,
  });
  const results = await mapWithConcurrency(inventory.repositories, concurrency, (repository) =>
    scanRepository({
      repository,
      workspace,
      token,
      commandRunner,
      now: Date.parse(generatedAt),
      previousReport,
      maxBlobBytes,
      maxRefsPerRepository,
    }),
  );
  const repositories = results.map(({ repository }) => repository);
  const findings = results
    .flatMap(({ findings: entries }) => entries)
    .sort((left, right) =>
      `${left.repository}\0${left.ref}\0${left.path}\0${left.ruleId}`.localeCompare(
        `${right.repository}\0${right.ref}\0${right.path}\0${right.ruleId}`,
      ),
    );
  const refChanges = results
    .flatMap(({ refChanges }) => refChanges)
    .sort((left, right) =>
      `${left.repository}\0${left.ref}`.localeCompare(`${right.repository}\0${right.ref}`),
    );
  const errors = [...inventory.errors, ...results.flatMap(({ errors: entries }) => entries)];
  const remediation = findings.map((finding) => ({
    repository: finding.repository,
    ref: finding.ref,
    path: finding.path,
    ruleId: finding.ruleId,
    dedupeKey: safeDedupeKey(finding),
    requiresHumanApproval: true,
  }));
  return {
    schemaVersion: 1,
    generatedAt,
    inventory: {
      repositoriesDiscovered: inventory.repositories.length,
      repositoriesScanned: results.filter(({ repository }) => repository.scanStatus === "scanned")
        .length,
      repositoriesSkipped: results.filter(({ repository }) => repository.scanStatus === "skipped")
        .length,
      coverageLimited: inventory.coverageLimited,
    },
    repositories,
    findings,
    refChanges,
    remediation: { items: remediation },
    errors,
    summary: {
      uniqueBlobsScanned: results.reduce((total, result) => total + result.blobs, 0),
      largeBlobsSkipped: results.reduce((total, result) => total + result.largeBlobsSkipped, 0),
      findings: findings.length,
      errors: errors.length,
    },
  };
}

export async function main(
  args = process.argv.slice(2),
  environment = process.env,
  {
    scanOrganization: scan = scanOrganization,
    readPreviousReport = readFile,
    writeReport = writeFile,
    writeOutput = (output) => process.stdout.write(output),
  } = {},
) {
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : undefined;
  };
  const organization = valueAfter("--org");
  const reportPath = valueAfter("--report");
  const previousReportPath = valueAfter("--previous-report");
  const requirePreviousReport = args.includes("--require-previous-report");
  const workspace = valueAfter("--workspace") ?? path.join(os.tmpdir(), "giro-org-ioc-ref-scan");
  if (!organization || !reportPath || !environment.GITHUB_ORG_SCANNER_TOKEN) return 2;
  try {
    let previousReport;
    const previousReportBytes = previousReportPath
      ? await readPreviousReport(previousReportPath)
      : environment.ORG_IOC_REF_PREVIOUS_REPORT
        ? Buffer.from(environment.ORG_IOC_REF_PREVIOUS_REPORT, "utf8")
        : undefined;
    if (requirePreviousReport && !previousReportBytes) return 2;
    if (previousReportBytes) {
      if (
        !Buffer.isBuffer(previousReportBytes) ||
        previousReportBytes.length > MAX_PREVIOUS_REPORT_BYTES
      ) {
        return 2;
      }
      previousReport = JSON.parse(previousReportBytes.toString("utf8"));
      if (!previousReport || typeof previousReport !== "object" || Array.isArray(previousReport))
        return 2;
    }
    const report = await scan({
      organization,
      token: environment.GITHUB_ORG_SCANNER_TOKEN,
      workspace,
      previousReport,
    });
    const output = `${JSON.stringify(report)}\n`;
    await writeReport(reportPath, output, "utf8");
    writeOutput(output);
    return report.errors.length > 0 ||
      (args.includes("--fail-on-findings") &&
        (report.findings.length > 0 || report.refChanges.length > 0))
      ? 1
      : 0;
  } catch {
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
