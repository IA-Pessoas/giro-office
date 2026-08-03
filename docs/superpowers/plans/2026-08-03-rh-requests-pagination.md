# RH Requests Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the reopened `RH > Solicita??es` pagination gap from issue #430 using the workspace's existing 20-item operational pagination pattern.

**Architecture:** Keep the current RH route and filters, add bounded offset pagination at the service boundary, and return `{ items, total, page, pageSize, hasMore }` inside the standard success envelope. The frontend consumes that page object through the existing React Query flow and reuses `PaginationControls`.

**Tech Stack:** TypeScript, Express, Prisma, Zod, React, React Query, Vitest, Supertest, pnpm workspace.

## Global Constraints

- Use `DEFAULT_PAGE_SIZE = 20` from `app/src/shared/pagination/pagination.ts`.
- Preserve RH permissions: self-service users list only their own requests; managers keep status/category/requester/assignee filters.
- Keep the success envelope `{ success: true, data: ... }`.
- Apply every filter before both `findMany` and `count`; never infer total from the current page.
- Use `Promise.all` for independent page and count queries.
- Reuse `PaginationControls`; add no new dependency or shared pagination component.
- Every behavior change gets a failing test before production code.
- Use Biome formatting and do not stage unrelated checkout changes.

---

### Task 1: Paginate the RH request API

**Files:** Modify `services/rh-service/src/schemas/request.schemas.ts`, `src/services/requestService.ts`, `src/routes/request.routes.ts`, `src/openapi/spec.ts`; test `src/test/requestService.test.ts` and `src/test/request.routes.test.ts`.

**Interfaces:** `RequestListOptions` gains `page: number` and `limit: number`. `RequestService.list(organizationId, options)` returns `Promise<RhRequestListPage>`, with `items: RhRequestSnapshot[]`, `total: number`, `page: number`, `pageSize: number`, and `hasMore: boolean`. `listRequestQuerySchema` accepts coerced `page` default 1 and `limit` default 20, with limit max 100.

- [ ] Write a service test that mocks one `findMany` row and `count=21`, calls `list("org-1", { status: "New", page: 2, limit: 20 })`, and asserts page metadata, `skip: 20`, `take: 20`, and the identical filtered `where` passed to `count`.
- [ ] Run `corepack pnpm --filter @workspace/rh-service test -- requestService.test.ts`; expected RED because the current service has no count/page envelope.
- [ ] Add route tests asserting default `page: 1, limit: 20` forwarding and HTTP 400 for `page=0` or `limit=101`; run `corepack pnpm --filter @workspace/rh-service test -- request.routes.test.ts` and verify RED.
- [ ] Implement Zod query defaults/bounds, copy parsed pagination into options, and preserve the existing permission narrowing of `requester_user_id`.
- [ ] In the service, build one organization-plus-filters `where`, calculate `skip=(page-1)*limit`, run `findMany({ where, orderBy: { created_at: "desc" }, skip, take: limit, select: REQUEST_SELECT })` and `count({ where })` via `Promise.all`, then return `{ items, total, page, pageSize: limit, hasMore: page * limit < total }`.
- [ ] Update OpenAPI query parameters and describe the paginated data envelope.
- [ ] Run `corepack pnpm --filter @workspace/rh-service test -- requestService.test.ts request.routes.test.ts`; expected GREEN, including historical requester and permission cases updated to read `result.items`.
- [ ] Commit only backend files with `fix(rh): paginate request listings`.

---

### Task 2: Consume the paginated page in the frontend

**Files:** Modify `app/src/modules/rh/types.ts`, `services/rhService.contract.ts`, `services/rhRequestsService.ts`, `hooks/useRhRequests.ts`, `components/RhRequestsSection.tsx`, `app/src/shared/components/newLayout/RH.tsx`, and `app/src/modules/rh/run-rh-tests.mjs`.

**Interfaces:** Add `RhRequestListPage = { items: RhRequest[]; total: number; page: number; pageSize: number; hasMore: boolean }`. `RhRequestListFilters` gains optional `page` and `limit`. `listRequests) and `useRhRequests` return the page type. The query key includes page and limit.

- [ ] Add structural assertions that the section imports `DEFAULT_PAGE_SIZE` and `PaginationControls`, sends page/limit, renders `requestsPage.items`, passes total/page/pageSize/hasMore to the controls, and resets to page 1 on status/category/requester changes. Assert the contract builds page/limit params and returns `RhRequestListPage`.
- [ ] Run `corepack pnpm --dir app exec node --experimental-strip-types src/modules/rh/run-rh-tests.mjs`; expected RED because the hook currently returns an array and the section renders every returned row.
- [ ] Add the page type, build `page`/ `limit` params, update service/hook return types, and include page/limit in `rhRequestsQueryKey`.
- [ ] In `RhRequestsSection`, keep local page state at 1, use `DEFAULT_PAGE_SIZE`, derive rows from `requestsPage.items`, reset page from every filter handler, and render `PaginationControls` below the table with total, current page, page size, hasMore, isFetching, previous, and next handlers.
- [ ] Preserve loading/error/empty/delete/detail/edit/permission behavior. Update `RH.tsx` dashboard consumers to use `data?.items ?? []` without adding a second query.
- [ ] Run `corepack pnpm --dir app exec node --experimental-strip-types src/modules/rh/run-rh-tests.mjs`, `corepack pnpm --dir app exec node --experimental-strip-types src/shared/run-pagination-tests.mjs`, and `corepack pnpm --dir app exec node --experimental-strip-types src/modules/clients/run-clients-tests.mjs`; expected GREEN.
- [ ] Commit only frontend files with `fix(rh): show paginated request list`.

---

### Task 3: Verify contract, performance, and UI

**Files:** Modify only focused tests/OpenAPI/smoke entries if verification proves it necessary; screenshots stay outside the repository.

- [ ] Run backend `corepack pnpm --filter @workspace/rh-service test`, `typecheck`, and `build`.
- [ ] Run frontend `corepack pnpm --dir app exec node --experimental-strip-types src/modules/rh/run-rh-tests.mjs`, `test:pagination`, `typecheck`, and `build`.
- [ ] Run `corepack pnpm smoke:coverage`; if the existing RH route needs a good/bad pagination expectation, update only that manifest entry and rerun it.
- [ ] Confirm the diff uses database-side filters, bounded offset pagination, existing projection, and concurrent `findMany`/`count`; offset is intentional for this shallow operational list.
- [ ] Run `corepack pnpm lint`, `git diff --check`, inspect `git diff --stat` and the full relevant diff, and use Playwright for an authenticated UI screenshot when available.
- [ ] If verification finds a defect, add a failing focused test first, apply the smallest fix, rerun the affected suite, and commit with `fix(rh): address pagination verification findings`.

