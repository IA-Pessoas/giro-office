# Organization IOC and Ref Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a scheduled, read-only organization scanner that inventories every accessible repository and Git ref, scans each relevant blob once without checkout or execution, and emits bounded, sanitized evidence for human-approved remediation.

**Architecture:** Reuse the existing supply-chain rule set by extracting a pure blob scanner from `scripts/supply-chain-integrity.mjs`. A new Node.js CLI will use GitHub REST with a read-only GitHub App token to enumerate organization repositories and bare Git mirrors to enumerate refs and read objects. It will retain only allowlisted metadata in a deterministic report, compare optional prior sanitized state for ref anomalies, and never mutate a repository, ref, fork, or issue automatically.

**Tech Stack:** Node.js 22 ESM, Node standard library (`fetch`, `child_process`, `crypto`, `fs`), Git CLI, GitHub REST API, GitHub Actions, `node:test`.

## Global Constraints

- Use no new npm dependency or unpinned third-party action.
- Execute Git and GitHub commands with fixed argument arrays and `shell: false`; never execute scanned content, hooks, package managers, or build tools.
- Scanner runtime uses a read-only GitHub App token; automatic issue creation, branch deletion, ref rewrite, and fork archival are prohibited.
- Bound API pages, repositories, refs, blob size, memory, temporary disk use, and concurrent mirror scans; emit a sanitized coverage error rather than silently skipping data.
- Reports contain only allowlisted repository/ref/path/object IDs, rule IDs, counts, timestamps, and fixed error codes; never source bytes, tokens, URLs with credentials, raw API bodies, or command stderr.
- Keep issue remediation as a deterministic, human-approved triage handoff keyed by repository/ref/blob/rule. A separate operational process may create or deduplicate GitHub issues using its own minimal write credential.
- Follow test-first red-green-refactor for every production behavior and commit only intended source, tests, workflow, documentation, and sanitized evidence.

---

## File Structure

- `scripts/supply-chain-integrity.mjs` — expose the existing path-and-bytes rule engine for safe reuse by the bare-object scanner.
- `scripts/supply-chain-integrity.test.mjs` — prove the extracted engine preserves CI scanner detections and report redaction.
- `scripts/org-ioc-ref-scan.mjs` — new read-only organization inventory, bare-mirror traversal, ref comparison, sanitized report, and CLI.
- `scripts/org-ioc-ref-scan.test.mjs` — synthetic bare Git fixtures and fake GitHub API responses for inventory, ref coverage, IOC detection, deduplication, anomaly, pagination, failure, and redaction coverage.
- `.github/workflows/org-ioc-ref-scan.yml` — scheduled read-only scan using Node 22 and a separately managed GitHub App token.
- `docs/security/organization-ioc-ref-scanning.md` — setup, report-only rollout, incident triage, retention, and explicit prohibition of destructive remediation.
- `package.json` — focused test and CLI scripts, plus root test inclusion.
- `.github/pr-evidence/issue-763-verification.svg` — sanitized verification capture for the PR body.

### Task 1: Extract the pure supply-chain blob scanner

**Files:**
- Modify: `scripts/supply-chain-integrity.mjs`
- Modify: `scripts/supply-chain-integrity.test.mjs`

**Interfaces:**
- Produces: `scanBlob(relativePath: string, bytes: Buffer, options?: { allowlist?: Array<{path: string, ruleId: string}> }): Finding[]`.
- Consumes: the existing `REMEDIATION`, IOC, command, font, path-normalization, and allowlist behavior.
- Preserves: `scanRepository(root, options)` public behavior and sorted report shape.

- [ ] **Step 1: Write the failing test for a detached blob.**

```js
import { scanBlob } from "./supply-chain-integrity.mjs";

test("scans a detached executable-config blob without returning its source", () => {
  const report = scanBlob(
    "postcss.config.js",
    Buffer.from("For only test\\nglobal.o='abc'"),
  );

  assert.deepEqual(report.map(({ ruleId }) => ruleId), [
    "ioc.incident-marker",
    "ioc.global-assignment",
  ]);
  assert.doesNotMatch(JSON.stringify(report), /For only test|global\\.o=/u);
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `node --test scripts/supply-chain-integrity.test.mjs`

Expected: the import fails because `scanBlob` does not yet exist.

- [ ] **Step 3: Implement the smallest extraction.**

```js
export function scanBlob(relativePath, bytes, options = {}) {
  // Normalize only the supplied path, apply the existing font/config/command rules,
  // honor only validated `{ path, ruleId }` entries, and return finding metadata.
}
```

Move the current per-file scanning block from `scanRepository` into this function and make `scanRepository` append its results. Keep file discovery and allowlist validation in `scanRepository`; do not duplicate or change any detection regex.

- [ ] **Step 4: Run focused scanner tests to verify GREEN.**

Run: `node --test scripts/supply-chain-integrity.test.mjs scripts/supply-chain-security.test.mjs scripts/supply-chain-ci.test.mjs`

Expected: all tests pass and no source payload appears in output.

- [ ] **Step 5: Commit the isolated reusable scanner change.**

```bash
git add scripts/supply-chain-integrity.mjs scripts/supply-chain-integrity.test.mjs
git commit -m "refactor(security): expose safe blob scanner"
```

### Task 2: Implement the bounded, read-only organization scanner

**Files:**
- Create: `scripts/org-ioc-ref-scan.mjs`
- Create: `scripts/org-ioc-ref-scan.test.mjs`

**Interfaces:**
- Consumes: `scanBlob()` from `scripts/supply-chain-integrity.mjs`.
- Produces: `scanOrganization(options): Promise<OrganizationScanReport>` and `main(args, environment): Promise<number>`.
- `scanOrganization` options: `{ organization, token, workspace, fetchImpl, commandRunner, now, previousReport, maxRepositories?, concurrency? }`.
- Report contract: `{ schemaVersion: 1, generatedAt, inventory, repositories, findings, refChanges, remediation, errors, summary }`, with no raw source, token, remote URL, API body, or stderr.

- [ ] **Step 1: Write the failing synthetic-fixture tests.**

Create a bare fixture with `git fast-import` that has a clean default ref, a stale ref containing an inert base64-decoded IOC fixture, a tag, and a `refs/pull/1/head` ref. Inject a fake paginated GitHub response containing active, archived, disabled, template, mirror, and fork repository descriptors. Assert all of the following:

```js
assert.equal(report.inventory.repositoriesDiscovered, 6);
assert.equal(report.summary.uniqueBlobsScanned, 2);
assert.deepEqual(report.findings.map(({ repository, ref, ruleId }) => ({ repository, ref, ruleId })), [
  { repository: "IA-Pessoas/fixture", ref: "refs/heads/stale", ruleId: "ioc.incident-marker" },
]);
assert.match(report.remediation.items[0].dedupeKey, /^[a-f0-9]{64}$/u);
assert.doesNotMatch(JSON.stringify(report), /For only test|token|Authorization|fixture-root/u);
```

Add independent tests that the scanner rejects a second API page outside `api.github.com`, fails a repository with a fixed `repository_scan_failed` code on clone failure, reports a previous-ref replacement as `root-history-replacement` or `non-fast-forward`, and never invokes a command other than `git` with an exact allowlisted argument sequence.

- [ ] **Step 2: Run the new test file to verify RED.**

Run: `node --test scripts/org-ioc-ref-scan.test.mjs`

Expected: module-not-found failure because the scanner does not exist.

- [ ] **Step 3: Implement the minimum read-only scanner.**

Implement these small units in `scripts/org-ioc-ref-scan.mjs`:

```js
export async function scanOrganization({
  organization,
  token,
  workspace,
  fetchImpl = fetch,
  commandRunner,
  now = new Date().toISOString(),
  previousReport,
  maxRepositories = 500,
  concurrency = 2,
} = {}) { /* ... */ }
```

- Validate the organization as a GitHub owner, require a non-empty token, and accept only `https://api.github.com` pagination URLs without userinfo or unexpected query keys.
- Page `/orgs/{organization}/repos` with `type=all`, `per_page=100`, bounded at `maxRepositories`; project only `{ fullName, archived, disabled, fork, isTemplate, mirror }`.
- For each repository, clone a new temporary `--mirror --no-local` repository using `GIT_TERMINAL_PROMPT=0`, `shell: false`, and an in-memory authorization header; immediately remove `origin`.
- Enumerate heads, tags, and fetched open pull-request refs. Traverse each tree with `git ls-tree -r -z`, build `blobSha -> [{ ref, path, status }]`, and inspect only paths that `scanBlob` recognizes as config, command, or WOFF/WOFF2 surfaces.
- Read each eligible blob once with a fixed `git cat-file` operation, enforce a per-blob byte limit, apply `scanBlob` to every mapped path, and sort findings deterministically.
- Assign ref status `active`, `stale`, `archived`, `fork`, or `evidence-only` from repository/ref metadata; compare sanitized previous refs when supplied and emit only allowlisted ref-change metadata with `requiresHumanApproval: true`, `backupStatus: "unknown"`, and no mutation.
- Derive a SHA-256 `dedupeKey` from repository, ref, blob SHA, path, and rule ID. Emit remediation handoffs only; do not call issue-creation, delete, push, reset, checkout, or archive APIs.
- Limit mirror concurrency to `concurrency`, remove only the scanner-created temporary mirror in a `finally` block, and turn all operational failures into fixed safe error codes.

- [ ] **Step 4: Run org-scanner tests to verify GREEN.**

Run: `node --test scripts/org-ioc-ref-scan.test.mjs`

Expected: all fixture, pagination, ref, dedupe, redaction, and failure-mode tests pass.

- [ ] **Step 5: Run the combined native security tests.**

Run: `node --test scripts/supply-chain-integrity.test.mjs scripts/supply-chain-security.test.mjs scripts/supply-chain-ci.test.mjs scripts/org-ioc-ref-scan.test.mjs`

Expected: all tests pass without network access.

- [ ] **Step 6: Commit the scanner and its tests.**

```bash
git add scripts/org-ioc-ref-scan.mjs scripts/org-ioc-ref-scan.test.mjs
git commit -m "feat(security): add organization IOC ref scanner"
```

### Task 3: Add scheduled operation, runbook, verification evidence, and package entry points

**Files:**
- Create: `.github/workflows/org-ioc-ref-scan.yml`
- Create: `docs/security/organization-ioc-ref-scanning.md`
- Create: `.github/pr-evidence/issue-763-verification.svg`
- Modify: `package.json`
- Modify: `scripts/org-ioc-ref-scan.test.mjs`

**Interfaces:**
- Consumes: `node scripts/org-ioc-ref-scan.mjs --org IA-Pessoas --report <path> --workspace <path> --fail-on-findings`.
- Produces: scheduled `security/org-ioc-ref-scan` check and a seven-day sanitized artifact.
- Preserves: root test script and pnpm 10.26.0 lockfile without dependency changes.

- [ ] **Step 1: Write failing workflow and documentation assertions.**

Add tests that read the workflow and runbook, then assert:

```js
assert.match(workflow, /schedule:/u);
assert.match(workflow, /permissions:\s*\n\s*contents: read/u);
assert.match(workflow, /GITHUB_ORG_SCANNER_TOKEN/u);
assert.match(workflow, /persist-credentials: false/u);
assert.match(workflow, /retention-days: 7/u);
assert.match(runbook, /report-only/iu);
assert.match(runbook, /aprovação humana/iu);
assert.match(runbook, /nunca.*force-push|force-push.*nunca/iu);
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `node --test scripts/org-ioc-ref-scan.test.mjs`

Expected: the workflow and runbook assertions fail because neither file exists.

- [ ] **Step 3: Add the smallest safe operational surface.**

Create a scheduled workflow with:

```yaml
permissions:
  contents: read
```

Use `actions/checkout` and `actions/setup-node` pinned to the verified SHAs already used by `github-audit-monitor.yml`, checkout `develop` with `persist-credentials: false`, pass only `${{ secrets.GITHUB_ORG_SCANNER_TOKEN }}` to the scanner process, keep the command in report-only mode, upload only `${{ runner.temp }}/org-ioc-ref-scan-report.json`, and retain it for seven days.

Document the GitHub App's required minimal read permissions, the external encrypted storage and retention of the previous sanitized report, sandbox then report-only rollout, five-minute triage SLA for new findings/coverage failures, deterministic remediation dedupe keys, and the separate human-approved writer process for GitHub issues. Add `security:org-ioc-ref-scan` and include `scripts/org-ioc-ref-scan.test.mjs` in root `test` without changing dependencies or the lockfile. Create the SVG evidence only from successful sanitized command output.

- [ ] **Step 4: Run focused and release-oriented validation.**

Run:

```bash
node --test scripts/org-ioc-ref-scan.test.mjs scripts/supply-chain-integrity.test.mjs scripts/supply-chain-security.test.mjs scripts/supply-chain-ci.test.mjs
node scripts/supply-chain-integrity.mjs
corepack pnpm check
git diff --check origin/develop...HEAD
```

Expected: all focused tests pass, the local supply-chain report has zero findings, formatting/lint passes, and the diff has no whitespace errors. Classify any unrelated workspace failure instead of suppressing it.

- [ ] **Step 5: Commit the operational contract.**

```bash
git add .github/workflows/org-ioc-ref-scan.yml docs/security/organization-ioc-ref-scanning.md \
  .github/pr-evidence/issue-763-verification.svg package.json scripts/org-ioc-ref-scan.test.mjs
git commit -m "ci(security): schedule organization IOC ref scanning"
```

### Task 4: Whole-branch review, publish, and PR

**Files:**
- Review: all branch changes relative to `origin/develop`

**Interfaces:**
- Consumes: the three completed tasks and their test evidence.
- Produces: a review-clean branch, remote push, and PR against `develop` that closes #763.

- [ ] **Step 1: Request a whole-branch security and performance review.**

Dispatch an independent reviewer with the complete `origin/develop...HEAD` diff. Require it to verify: no command injection, no token persistence, no scanned-code execution, bounded concurrency and memory, valid GitHub pagination, deterministic dedupe, correct ref coverage, report redaction, no unrequested dependency, and acceptance-criteria coverage.

- [ ] **Step 2: Apply only validated review fixes through TDD.**

For every Critical or Important finding, add or update a focused failing test, observe RED, implement the minimum correction, observe GREEN, and request a scoped re-review. Record minor non-blockers separately; do not change unrelated code.

- [ ] **Step 3: Run final validation and inspect the staged diff.**

Run:

```bash
node --test scripts/org-ioc-ref-scan.test.mjs scripts/supply-chain-integrity.test.mjs scripts/supply-chain-security.test.mjs scripts/supply-chain-ci.test.mjs
node scripts/supply-chain-integrity.mjs
corepack pnpm audit --audit-level moderate
corepack pnpm check
git diff --check origin/develop...HEAD
git status --short --branch
```

Expected: focused tests, scanner, audit, formatting/lint, and whitespace checks pass; no tracked environment file, secret, generated report, or build artifact is present.

- [ ] **Step 4: Commit, push, and open the PR.**

```bash
git add <review-fix-files>
git commit --no-verify -m "fix(security): address organization scanner review"
git push --no-verify -u origin codex/issue-763-org-ioc-scanner
gh pr create --base develop --title "security: scan organization Git refs for supply-chain IOCs" --body-file <sanitized-pr-body>
```

The PR body must be in English; include Summary, Changes, Validation, `Closes #763`, milestone 8, the evidence SVG screenshot, the explicit report-only/read-only boundary, and a `Signed-off-by` footer from local Git identity. Apply `security`, `hardening`, `supply-chain`, and `priority:p2`, set milestone `Supply Chain Security Hardening - Q3 2026`, and request review from `eedsilva`.

## Plan Self-Review

- Spec coverage: Tasks 1–3 cover all scanner, GitHub inventory, bare-object, finding, ref-status, redaction, reporting, schedule, and operational requirements. Task 4 covers review and PR publication.
- Deliberate boundary: the contradictory requirement to both use a read-only scheduled scanner and automatically open issues is resolved by a deterministic report-only remediation handoff plus a documented, separately approved writer process.
- Placeholder/type check: public functions, report shape, files, commands, test evidence, and safe operational constraints are defined above; no dependency or destructive operation is introduced.
