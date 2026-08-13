# Supply Chain Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement #771 and #770 in `IA-Pessoas/giro-office`, with isolated branches/worktrees, deterministic security checks, tests, review, and PRs targeting `develop`.

**Architecture:** Keep both changes repository-local and dependency-free. #771 exposes one scanner implementation reused by tests, pre-commit, and CI; #770 adds a versioned ruleset policy plus a read-only drift verifier and rollout documentation. The external GitHub ruleset mutation remains an explicit operator action after review.

**Tech Stack:** Node.js ESM, `node:test`, Node standard library, GitHub Actions YAML, pnpm 9.15.0, Biome.

## Global Constraints

- Work only in the current repository `IA-Pessoas/giro-office`; do not implement in `IA-Pessoas/nexus`.
- Use one branch and one worktree per issue: `codex/issue-771-supply-chain-integrity` and `codex/issue-770-github-rulesets`.
- Do not add npm packages or execute repository content during scanning.
- Never print file bodies, credentials, authorization headers, decoded payloads, or secret values.
- Preserve existing user changes; current `develop` checkout is clean.
- Use test-first development and observe each new test fail before implementation.
- CI permissions default to `contents: read`; production secrets are not available to the security gate.
- Do not apply organization rulesets automatically from code or CI.
- Every commit and PR must use the local git identity and include issue references.

---

### Task 1: Prepare isolated worktrees and baseline

**Files:**
- Create worktree: `../GIROOFFICE-issue-771`
- Create worktree: `../GIROOFFICE-issue-770`
- Read-only checks: repository root, `AGENTS.md`, `.codex/config.toml`, `.codex/rules/default.rules.md`, `scripts/supply-chain-security.test.mjs`, `.husky/pre-commit`, `.github/workflows/*`.

**Interfaces:**
- Produces two clean branches based on `develop` for all later tasks.

- [ ] **Step 1: Verify the canonical checkout and remote**

Run `git status --short --branch`, `git worktree list`, `git remote -v`, and `git log -1 --oneline`. Expected: clean `develop`, origin `IA-Pessoas/giro-office`, current commit `94e1648c` or a newer fetched `develop` commit.

- [ ] **Step 2: Fetch the base branch**

Run `git fetch origin develop`. Do not reset or clean the checkout.

- [ ] **Step 3: Create the issue branches and worktrees**

Run:

```powershell
git worktree add -b codex/issue-771-supply-chain-integrity "..\GIROOFFICE-issue-771" develop
git worktree add -b codex/issue-770-github-rulesets "..\GIROOFFICE-issue-770" develop
```

- [ ] **Step 4: Run worktree readiness checks**

Run the bundled `check-worktree-readiness.ps1` for both worktrees with the canonical checkout as `-EnvSource`. Confirm branch names and clean status without printing environment values.

- [ ] **Step 5: Record the plan workspace ledger**

Run `scripts/sdd-workspace docs/superpowers/plans/2026-08-13-supply-chain-hardening.md`, create its `progress.md` with the plan path as the first line, and record the baseline commit for both branches.

- [ ] **Step 6: Commit the approved design and plan**

Commit the two documentation files from the canonical checkout with:

```text
docs(security): plan supply-chain hardening
```

Create the two issue branches after this documentation commit so both branches share the approved plan baseline. Verify no secrets or generated artifacts are staged.

### Task 2: #771 define scanner behavior with failing tests

**Branch/worktree:** `codex/issue-771-supply-chain-integrity` / `../GIROOFFICE-issue-771`

**Files:**
- Create: `scripts/supply-chain-integrity.mjs`
- Create: `scripts/supply-chain-integrity.test.mjs`
- Create: `scripts/fixtures/supply-chain/` with inert fixtures only
- Modify: `scripts/supply-chain-security.test.mjs`

**Interfaces:**
- Produce `scanRepository(root, options): Promise<ScanReport>` from `scripts/supply-chain-integrity.mjs`.
- `ScanReport` contains only `ok`, `findings`, and sanitized `summary` fields.
- `findings` contain `ruleId`, normalized relative `path`, optional `line`, optional `blobSha`, and `remediation`.

- [ ] **Step 1: Add a failing test for IOC marker families**

Create an inert fixture representation and assert the scanner returns stable rule IDs for `global.o=`, `global.i=`, bracketed global assignment, and the existing incident marker families without returning fixture contents.

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run `node --test scripts/supply-chain-integrity.test.mjs`. It must fail because the scanner module/export does not yet exist or returns no finding.

- [ ] **Step 3: Add failing tests for executable config and suspicious commands**

Cover an executable config line over 2,000 bytes, dangerous `runOn: folderOpen`, force-push, encoded `node -e`, and shell download-and-execute patterns. Include a normal minified asset outside executable/config surfaces that must not fail solely because of line length.

- [ ] **Step 4: Run the focused test and confirm the expected failure**

Run `node --test scripts/supply-chain-integrity.test.mjs`; confirm failures are behavior failures, not fixture syntax or import errors.

- [ ] **Step 5: Add failing tests for font magic and allowlist expiry**

Cover valid `wOF2`, valid WOFF magic, text masquerading as `.woff2`, exact-path/rule allowlist acceptance, missing allowlist owner/issue/expiry rejection, and expired entries failing closed.

- [ ] **Step 6: Run the focused test and confirm the expected failure**

Run the same focused command and capture the RED result in the task report.

### Task 3: #771 implement the minimal scanner

**Branch/worktree:** `codex/issue-771-supply-chain-integrity` / `../GIROOFFICE-issue-771`

**Files:**
- Modify: `scripts/supply-chain-integrity.mjs`
- Modify: `scripts/supply-chain-integrity.test.mjs` only when a test exposes an invalid expectation
- Create: `scripts/security/supply-chain-allowlist.json` only if the current repository needs an approved exception

**Interfaces:**
- Use Node `fs/promises`, `path`, and `crypto` only.
- Keep rule definitions immutable and compile regexes once.
- Read files as bounded chunks or one pass where practical; do not decode or execute suspicious content.

- [ ] **Step 1: Implement safe path traversal**

Skip `.git`, `.next`, `.turbo`, `dist`, `graphify-out`, `node_modules`, environment files, and symlink escapes. Normalize findings to repository-relative POSIX paths.

- [ ] **Step 2: Implement IOC and command rules**

Return stable rule IDs and remediation text. Report only line numbers and safe metadata. Never include matching source text.

- [ ] **Step 3: Implement config line and font validation**

Apply the 2,000-byte threshold only to executable/config surfaces; validate `.woff` and `.woff2` magic bytes before treating them as binary assets.

- [ ] **Step 4: Implement allowlist validation**

Require exact path/rule, owner, reason, issue URL/number, and ISO expiry. Reject expired or malformed entries before scanning results are accepted.

- [ ] **Step 5: Run the focused scanner tests and confirm GREEN**

Run `node --test scripts/supply-chain-integrity.test.mjs`, then run the existing `node --test scripts/supply-chain-security.test.mjs`.

- [ ] **Step 6: Commit the scanner**

Use:

```text
security: add deterministic supply-chain integrity scanner
```

### Task 4: #771 integrate hook and CI

**Branch/worktree:** `codex/issue-771-supply-chain-integrity` / `../GIROOFFICE-issue-771`

**Files:**
- Modify: `scripts/supply-chain-security.test.mjs`
- Modify: `.husky/pre-commit`
- Modify: `package.json`
- Create: `.github/workflows/supply-chain-security.yml`
- Create: `scripts/supply-chain-ci.test.mjs`

- [ ] **Step 1: Add a failing integration assertion**

Assert that the existing compatibility test and pre-commit invoke the shared scanner before lint-staged, and that the workflow uses the root script with `contents: read`, no production environment, and sanitized report handling.

- [ ] **Step 2: Run the integration test and confirm RED**

Run `node --test scripts/supply-chain-ci.test.mjs`; confirm it fails before the workflow/script integration exists.

- [ ] **Step 3: Add the minimal root script and hook integration**

Add `security:supply-chain` that runs the shared scanner against the checkout, retain existing hook ordering, and preserve the current test entrypoint compatibility.

- [ ] **Step 4: Add the dedicated workflow**

Use pinned existing action majors consistent with the repository, `permissions: contents: read`, `pnpm install --frozen-lockfile` only if required by the root script, and upload only a sanitized report on failure.

- [ ] **Step 5: Run all #771 tests and static checks**

Run `node --test scripts/supply-chain-integrity.test.mjs scripts/supply-chain-security.test.mjs scripts/supply-chain-ci.test.mjs`, `pnpm check`, and `pnpm audit --audit-level moderate`.

- [ ] **Step 6: Commit the integration**

Use:

```text
ci(security): enforce supply-chain integrity gate
```

### Task 5: #770 define policy and failing verifier tests

**Branch/worktree:** `codex/issue-770-github-rulesets` / `../GIROOFFICE-issue-770`

**Files:**
- Create: `.github/security/rulesets-policy.json`
- Create: `scripts/github-ruleset-policy.mjs`
- Create: `scripts/github-ruleset-policy.test.mjs`
- Create: `scripts/fixtures/rulesets/approved.json`
- Create: `scripts/fixtures/rulesets/drifted.json`

**Interfaces:**
- Produce `normalizeRulesets(input): NormalizedRuleset[]` and `compareRulesets(actual, expected): PolicyFinding[]`.
- Findings contain only rule names, target patterns, and remediation; no tokens or unrelated API payloads.

- [ ] **Step 1: Add the policy fixture and failing tests**

Specify the global ref-integrity ruleset and protected lifecycle ruleset, then test that an approved fixture passes and a fixture missing force-push/deletion protection, required reviews, Code Owner, IOC status, resolved conversations, latest-push approval, or documented bypass fails.

- [ ] **Step 2: Run the focused policy test and confirm RED**

Run `node --test scripts/github-ruleset-policy.test.mjs`; confirm the verifier is absent or reports the expected missing behavior.

- [ ] **Step 3: Add tests for deterministic normalization**

Cover ordering differences, omitted optional fields, unsupported signed-commit capability, and refusal to accept an undocumented bypass actor.

- [ ] **Step 4: Run the focused policy test and confirm RED**

Run the same command and verify the failures are due to missing implementation.

### Task 6: #770 implement policy verifier and rollout documentation

**Branch/worktree:** `codex/issue-770-github-rulesets` / `../GIROOFFICE-issue-770`

**Files:**
- Modify: `.github/security/rulesets-policy.json`
- Modify: `scripts/github-ruleset-policy.mjs`
- Modify: `scripts/github-ruleset-policy.test.mjs`
- Create: `docs/security/github-rulesets-rollout.md`
- Modify: `package.json`

- [ ] **Step 1: Implement normalization and comparison**

Use standard-library JSON parsing and stable sorting. Compare only approved policy fields and fail closed on missing required rules or undocumented bypasses.

- [ ] **Step 2: Add read-only GitHub export input support**

Accept a JSON file produced by an operator’s read-only `gh api` export. Do not invoke `gh` from tests or mutate GitHub state from the script.

- [ ] **Step 3: Document rollout and rollback**

Document sandbox-first rollout, one non-production repository, organization rollout, checks for #771/#769, break-glass audit evidence, drift checks, and rollback that never disables force-push/deletion protection.

- [ ] **Step 4: Add the root policy verification script**

Add `security:rulesets` with a deterministic fixture/CLI contract and no network side effect.

- [ ] **Step 5: Run focused policy tests and checks**

Run `node --test scripts/github-ruleset-policy.test.mjs`, `pnpm check`, and `pnpm audit --audit-level moderate`.

- [ ] **Step 6: Commit the policy implementation**

Use:

```text
security: add protected-ref ruleset policy verifier
```

### Task 7: Review, validate, push, and open PRs

**Files:**
- Modify only when review findings require it.
- Create PR body files outside the repository or in a temporary directory; never commit tokens or screenshots with secrets.

- [ ] **Step 1: Run branch-level diff and safety checks**

For each worktree run `git diff --check`, search conflict markers, inspect `git diff --stat` and full diff, and verify no `.env`, generated output, payload, or new dependency was added.

- [ ] **Step 2: Run focused and release-gate validations**

For #771 run scanner/integration tests, `pnpm check`, audit, and relevant typecheck/build. For #770 run policy tests, `pnpm check`, audit, and relevant typecheck/build.

- [ ] **Step 3: Dispatch independent code review**

Use the review package for each branch and request findings against the issue acceptance criteria. Fix Critical/Important findings in the owning worktree, rerun tests, and re-review the fix diff.

- [ ] **Step 4: Push both branches**

Use `git push --no-verify -u origin <branch>` only after recording the exact hook result or blocker. Do not use `--no-verify` as a substitute for tests.

- [ ] **Step 5: Create PR #771**

Use `gh pr create` with base `develop`, reviewer `eedsilva`, existing `security` label, milestone `Supply Chain Security Hardening - Q3 2026`, issue link `Closes #771`, validation commands, and no screenshot section because the changes are not UI changes.

- [ ] **Step 6: Create PR #770**

Use the same PR metadata for `Closes #770`, include the external ruleset rollout limitation and explicit evidence that no GitHub mutation was executed.

- [ ] **Step 7: Verify PR metadata and checks**

Run `gh pr view <number> --json baseRefName,headRefName,reviewRequests,labels,milestone,url,statusCheckRollup` and confirm both PRs target `develop`, mention the correct issue, and contain validation evidence.
