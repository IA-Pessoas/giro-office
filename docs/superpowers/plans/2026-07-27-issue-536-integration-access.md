# Issue #536 Integration Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide Clients and Projects and block their pages when a user has no Integration module access.

**Architecture:** Reuse the existing `APP_ROUTE_MODULE_MAP` route-to-module source of truth. Mapping the two root paths to `integracao` makes the existing `AppShell` filter navigation and render its access-denied state for every matching child route.

**Tech Stack:** Next.js, React, TypeScript, Node `assert` test runner.

## Global Constraints

- Keep the change frontend-only and do not add auth state, a route wrapper, or an API contract.
- Reuse the existing `integracao` `ModuleKey`; no new permission literal or dependency.
- Preserve the established denied/loading behavior in `AppShell`.
- Follow Ponytail ultra: modify only the central mapping and its focused regression test.

---

### Task 1: Protect the Integration-owned routes

**Files:**
- Modify: `app/src/modules/auth/utils/moduleAccess.ts`
- Modify: `app/src/modules/auth/run-auth-tests.mjs`

**Interfaces:**
- Consumes: `APP_ROUTE_MODULE_MAP: Partial<Record<string, ModuleKey>>`
- Produces: `/clients` and `/projects` resolve to `integracao`; `AppShell` therefore applies the existing menu filter and prefix route guard.

- [x] **Step 1: Write the failing regression test**

  In `run-auth-tests.mjs`, add an `await runTest(...)` case importing/using `APP_ROUTE_MODULE_MAP` and asserting:

  ```js
  assert.equal(APP_ROUTE_MODULE_MAP["/clients"], "integracao");
  assert.equal(APP_ROUTE_MODULE_MAP["/projects"], "integracao");
  ```

- [x] **Step 2: Verify the test is red**

  Run: `corepack pnpm --filter @workspace/app test:auth`

  Expected: the new test fails because both paths are currently unmapped.

- [x] **Step 3: Add the central route mappings**

  In `APP_ROUTE_MODULE_MAP`, add only:

  ```ts
  "/clients": "integracao",
  "/projects": "integracao",
  ```

  Do not modify `AppShell`: it already resolves path prefixes and uses this map both for navigation filtering and access-denied rendering.

- [x] **Step 4: Verify the focused behavior and types**

  Run:

  ```bash
  corepack pnpm --filter @workspace/app test:auth
  corepack pnpm --filter @workspace/app typecheck
  ```

  Expected: both commands exit 0.

- [x] **Step 5: Commit the focused change**

  ```bash
  git add app/src/modules/auth/utils/moduleAccess.ts app/src/modules/auth/run-auth-tests.mjs docs/superpowers/plans/2026-07-27-issue-536-integration-access.md
  git commit -m "fix: restrict clients and projects by integration access"
  ```
