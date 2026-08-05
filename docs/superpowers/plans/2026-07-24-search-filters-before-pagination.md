# Search and Filters Before Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task, task-model, Regularize process/site, and Pessoal union searches and filters operate on the complete organization-scoped result before pagination, while preserving existing full-list catalog consumers.

**Architecture:** Add backward-compatible, opt-in pagination to the existing list endpoints: requests without `page` and `limit` keep returning arrays, while requests containing either field return `{ data, total, page, limit, hasMore }`. Management screens use dedicated paginated hooks with 300 ms debounced search and shared previous/next controls; catalog/select hooks keep requesting the legacy array shape. Integration tasks already paginate remotely and will additionally return global filtered totals and summaries for their cards.

**Tech Stack:** TypeScript, Express, Zod, Prisma, React 18, Next.js, TanStack Query, Vitest, Supertest, Node contract-test scripts, OpenAPI 3.0.

## Global Constraints

- Work only in `/home/bruno/Documents/Projects/giro-office/.worktrees/issue-425` on `fix/425-search-filters-before-pagination`.
- Keep all issue #425 changes in this branch and a single pull request against `develop`.
- Do not add dependencies, database migrations, or new HTTP endpoints.
- Keep organization scoping in every Prisma `where`.
- A request without both `page` and `limit` must preserve the current array response.
- A request containing `page` or `limit` must use defaults `page = 1`, `limit = 20`, cap `limit` at `100`, and return `{ data, total, page, limit, hasMore }`.
- Reject invalid query values with HTTP 400; an out-of-range valid page returns an empty `data` array with correct metadata.
- Search is case-insensitive and executes in Prisma before `skip`/`take`.
- Management pages use 20 rows per page and a 300 ms search debounce.
- A raw search or filter change immediately resets page to 1 and hides rows from the previous criteria.
- Regularize Sites remains an organization-wide catalog and is not restricted by the selected client.
- Existing full-list consumers used by forms, dropdowns, dashboards, and payroll remain full-list consumers.
- Document dual array/page responses with OpenAPI `oneOf`.
- Use `pnpm`; do not use npm or Yarn.

---

### Task 1: Shared paginated-list frontend primitives

**Files:**
- Create: `app/src/shared/pagination/pagination.ts`
- Create: `app/src/shared/components/ui/PaginationControls.tsx`
- Create: `app/src/shared/hooks/useDebouncedValue.ts`
- Create: `app/src/shared/run-pagination-tests.mjs`
- Modify: `app/src/shared/components/index.ts`
- Modify: `app/src/shared/hooks/index.ts`
- Modify: `app/package.json`

**Interfaces:**
- Produces: `PaginatedResult<T>`, `normalizePaginatedResult<T>(value, fallback)`, `getLastPage(total, limit)`, `getPaginationRange(page, limit, count)`, `useDebouncedValue<T>(value, delayMs)`, and `PaginationControls`.
- `PaginationControls` consumes `{ page, limit, total, count, hasMore, isFetching, onPrevious, onNext }`.

- [ ] **Step 1: Write the failing shared contract tests**

Create `app/src/shared/run-pagination-tests.mjs` with assertions that:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getLastPage,
  getPaginationRange,
  normalizePaginatedResult,
} from "./pagination/pagination.ts";

assert.deepEqual(
  normalizePaginatedResult(["a", "b"], { page: 1, limit: 20 }),
  { data: ["a", "b"], total: 2, page: 1, limit: 20, hasMore: false },
);
assert.deepEqual(
  normalizePaginatedResult(
    { data: ["b"], total: 21, page: 2, limit: 20, hasMore: false },
    { page: 2, limit: 20 },
  ),
  { data: ["b"], total: 21, page: 2, limit: 20, hasMore: false },
);
assert.equal(getLastPage(0, 20), 1);
assert.equal(getLastPage(41, 20), 3);
assert.deepEqual(getPaginationRange(2, 20, 7), { start: 21, end: 27 });

const hookSource = readFileSync("src/shared/hooks/useDebouncedValue.ts", "utf8");
const controlsSource = readFileSync("src/shared/components/ui/PaginationControls.tsx", "utf8");
assert.match(hookSource, /setTimeout/);
assert.match(hookSource, /clearTimeout/);
assert.match(controlsSource, /Anterior/);
assert.match(controlsSource, /Próxima/);
```

Add `"test:pagination": "node --experimental-strip-types src/shared/run-pagination-tests.mjs"` to `app/package.json` and include it in the aggregate `test` script.

- [ ] **Step 2: Run the shared test and verify the red state**

Run:

```bash
pnpm --filter @workspace/app test:pagination
```

Expected: FAIL because `src/shared/pagination/pagination.ts` does not exist.

- [ ] **Step 3: Implement the pagination types and pure helpers**

Create `app/src/shared/pagination/pagination.ts`:

```ts
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function normalizePaginatedResult<T>(
  value: T[] | PaginatedResult<T>,
  fallback: { page: number; limit: number },
): PaginatedResult<T> {
  if (Array.isArray(value)) {
    return {
      data: value,
      total: value.length,
      page: fallback.page,
      limit: fallback.limit,
      hasMore: false,
    };
  }

  return value;
}

export function getLastPage(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}

export function getPaginationRange(
  page: number,
  limit: number,
  count: number,
): { start: number; end: number } {
  if (count === 0) return { start: 0, end: 0 };
  return { start: (page - 1) * limit + 1, end: (page - 1) * limit + count };
}
```

- [ ] **Step 4: Implement the debounce hook and controls**

Create `app/src/shared/hooks/useDebouncedValue.ts` using `useEffect` and `useState`; schedule `setDebouncedValue(value)` with `setTimeout(delayMs)` and clear it in the effect cleanup. Create `PaginationControls.tsx` using `getPaginationRange`; render “Exibindo X–Y de Z”, disable “Anterior” at page 1, disable “Próxima” when `hasMore` is false, and disable both while fetching. Export both from their existing barrel files.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm --filter @workspace/app test:pagination
pnpm --filter @workspace/app typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/src/shared
git commit -m "feat: add paginated list ui primitives"
```

---

### Task 2: Integration task global summaries and debounced search

**Files:**
- Create: `services/task-service/src/schemas/taskList.schemas.ts`
- Create: `services/task-service/src/test/taskList.schemas.test.ts`
- Modify: `services/task-service/src/routes/taskCrud.routes.ts`
- Modify: `services/task-service/src/services/taskCrudService.ts`
- Modify: `services/task-service/src/test/taskCrud.routes.test.ts`
- Modify: `services/task-service/src/test/taskCrudService.test.ts`
- Modify: `services/task-service/src/openapi/spec.ts`
- Modify: `app/src/modules/integracao/types/integracaoTask.ts`
- Modify: `app/src/modules/integracao/components/TasksWorkspace.tsx`
- Modify: `app/src/modules/integracao/run-project-tests.mjs`

**Interfaces:**
- Produces: `IntegracaoTaskListResult = { data, total, hasMore, summary: { inProgress, billable } }`.
- Consumes: `useDebouncedValue(searchTerm, 300)` from Task 1.

- [ ] **Step 1: Add failing backend tests**

Add tests that require:

```ts
expect(taskCrudServiceMock.listTasks).toHaveBeenCalledWith({
  organization_id: "org-1",
  status: "Todos",
  ref: "",
  ref_id: "",
  search: "registro 21",
  page: 2,
  limit: 20,
});
```

Add schema cases for `page=0`, `limit=101`, and non-integer values returning validation errors. Extend the service test mock so `findMany` returns the page rows and `count` returns, in order, total, in-progress, and billable counts; assert the result:

```ts
{
  data: pageRows,
  total: 41,
  hasMore: true,
  summary: { inProgress: 9, billable: 14 },
}
```

Also assert all three counts reuse the organization/search/status/ref base filter, with only their summary predicate added.

- [ ] **Step 2: Run focused task-service tests and verify failure**

Run:

```bash
pnpm --filter @workspace/task-service test -- src/test/taskList.schemas.test.ts src/test/taskCrud.routes.test.ts src/test/taskCrudService.test.ts
```

Expected: FAIL because the schema and new result fields do not exist.

- [ ] **Step 3: Add strict query parsing and aggregate counts**

Define `taskListQuerySchema` with optional strings plus coerced `page` and `limit` constrained to `1..100`; apply it through `parseWithZod` in the route. In `listTasks`, execute `findMany` plus three `count` calls in one `Promise.all`: base filtered total, base plus case-insensitive status containing `andamento`, and base plus billing not containing `não`. Return `total`, `hasMore`, and `summary`.

- [ ] **Step 4: Update the frontend contract and regression assertions**

Add `total` and `summary` to `IntegracaoTaskListResult`. In `run-project-tests.mjs`, assert the unwrap function preserves a page containing a record beyond the first page and its global summary.

- [ ] **Step 5: Make TasksWorkspace use server totals**

Use:

```ts
const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300);
const isSearchPending = searchTerm.trim() !== debouncedSearch;
```

Put `debouncedSearch` in `listParams`, clear `visibleTasks` and reset page on the raw search/status/ref change, and do not merge query rows while `isSearchPending`. Set the three cards from `tasksQuery.data?.total`, `.summary.inProgress`, and `.summary.billable`; update copy to say the numbers cover all filtered records. Keep “Carregar mais” behavior.

- [ ] **Step 6: Document and verify**

Update `/task/list` OpenAPI response schema with `total` and `summary`. Run:

```bash
pnpm --filter @workspace/task-service test
pnpm --filter @workspace/app test:projects
pnpm --filter @workspace/app typecheck
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add services/task-service app/src/modules/integracao
git commit -m "fix: calculate task summaries before pagination"
```

---

### Task 3: Task-model opt-in pagination and management UI

**Files:**
- Create: `services/task-service/src/schemas/taskModelList.schemas.ts`
- Create: `services/task-service/src/test/taskModelList.schemas.test.ts`
- Modify: `services/task-service/src/routes/taskModel.routes.ts`
- Modify: `services/task-service/src/services/taskModelService.ts`
- Modify: `services/task-service/src/test/taskModel.routes.test.ts`
- Modify: `services/task-service/src/test/taskModelService.test.ts`
- Modify: `services/task-service/src/openapi/spec.ts`
- Modify: `app/src/modules/integracao/types/taskModel.ts`
- Modify: `app/src/modules/integracao/services/taskModelService.contract.ts`
- Modify: `app/src/modules/integracao/services/taskModelService.ts`
- Modify: `app/src/modules/integracao/hooks/queryKeys.ts`
- Modify: `app/src/modules/integracao/hooks/useTaskModels.tsx`
- Modify: `app/src/pages/configs/integracao/tasks/index.tsx`
- Modify: `app/src/modules/integracao/run-project-tests.mjs`

**Interfaces:**
- Backend consumes `ListTaskModelsParams { organizationId, type?, billing?, search?, page?, limit? }`.
- Frontend keeps `taskModelService.list()` returning the legacy array and adds `taskModelService.listPage(params)` returning `PaginatedResult<TaskModelListItem>`.

- [ ] **Step 1: Add failing route and service tests**

Test the legacy request with no pagination still calls the service without pagination and returns an array. Test `?search=fiscal&page=2&limit=20` returns a page envelope. In the service test, assert Prisma receives:

```ts
where: {
  organization_id: "org-1",
  OR: [
    { name: { contains: "fiscal", mode: "insensitive" } },
    { department: { name: { contains: "fiscal", mode: "insensitive" } } },
  ],
},
skip: 20,
take: 20,
orderBy: { name: "asc" },
```

and that both `findMany` and `count` receive the same base `where`.

- [ ] **Step 2: Verify the backend red state**

Run:

```bash
pnpm --filter @workspace/task-service test -- src/test/taskModelList.schemas.test.ts src/test/taskModel.routes.test.ts src/test/taskModelService.test.ts
```

Expected: FAIL on missing search/pagination support.

- [ ] **Step 3: Implement the backward-compatible backend**

Create a strict schema with optional `type`, `billing`, trimmed `search`, `page`, and `limit`. Determine `paginationRequested` from raw `request.query.page !== undefined || request.query.limit !== undefined`, then default missing pagination values after parsing. Expand `TASK_MODEL_LIST_SELECT` with `department: { select: { id: true, name: true } }`. The service builds one organization-scoped `where`, applies search before pagination, and returns an array when pagination was not requested or a page envelope when it was.

- [ ] **Step 4: Add failing frontend contract tests**

In `run-project-tests.mjs`, assert:

```ts
buildTaskModelListParams({ search: "Fiscal", page: 2, limit: 20 })
// => { search: "Fiscal", page: 2, limit: 20 }
```

and assert `unwrapTaskModelPage` accepts the page envelope without losing metadata. Add source assertions that the config page no longer calls `.filter` for model search and uses `PaginationControls`.

- [ ] **Step 5: Implement dedicated legacy and paginated clients**

Extend `TaskModelListParams` with `search`, `page`, and `limit`. Keep `list()` for modal/catalog consumers, add `listPage()` which always sends pagination and normalizes the dual response. Make `taskModelsListQueryKey(params)` include normalized `type`, `billing`, `search`, `page`, and `limit`.

- [ ] **Step 6: Convert the config page**

Change `useTaskModels(params)` to fetch a page and return `models`, `total`, `page`, `limit`, and `hasMore`. In the page, keep raw search, debounced search, and page state; reset page immediately on raw search, hide old rows while the debounce is pending, remove `filteredModels`, and render `PaginationControls`. If a mutation leaves the current page empty, set the page to `getLastPage(total, 20)`.

- [ ] **Step 7: Document and verify**

Document query parameters and an OpenAPI `oneOf` between the legacy array and page envelope for `/task/model/list`. Run:

```bash
pnpm --filter @workspace/task-service test
pnpm --filter @workspace/app test:projects
pnpm --filter @workspace/app typecheck
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add services/task-service app/src/modules/integracao app/src/pages/configs/integracao/tasks/index.tsx
git commit -m "fix: paginate task model search on the server"
```

---

### Task 4: Regularize process and site opt-in pagination

**Files:**
- Modify: `services/regularize-service/src/schemas/process.schemas.ts`
- Modify: `services/regularize-service/src/schemas/password.schemas.ts`
- Modify: `services/regularize-service/src/routes/process.routes.ts`
- Modify: `services/regularize-service/src/routes/password.routes.ts`
- Modify: `services/regularize-service/src/services/processService.ts`
- Modify: `services/regularize-service/src/services/passwordService.ts`
- Create: `services/regularize-service/src/test/listPagination.routes.test.ts`
- Modify: `services/regularize-service/src/openapi/spec.ts`

**Interfaces:**
- Process search covers `process_type`, `cpf_cnpj`, `clientPF.name`, `clientPF.cpf`, `clientPJ.name`, and `clientPJ.cpf_cnpj`; status remains exact unless `"Todos"`.
- Site search covers `name`, `sphere`, `link`, and `user`; status remains exact boolean.

- [ ] **Step 1: Write failing route tests for both response modes**

Create authenticated Supertest cases for each endpoint:

```ts
GET /regularize/processes?status=Todos
GET /regularize/processes?status=Aberto&search=acme&page=2&limit=20
GET /regularize/sites-pass?status=true
GET /regularize/sites-pass?status=false&search=gov&page=2&limit=20
```

Assert legacy requests return arrays, paginated requests return metadata, Prisma search filters include related client fields for processes, `skip` is 20, and `count` uses the same `where`. Add invalid `page=0` and `limit=101` cases expecting 400.

- [ ] **Step 2: Verify the Regularize red state**

Run:

```bash
pnpm --filter @workspace/regularize-service test -- src/test/listPagination.routes.test.ts
```

Expected: FAIL because the schemas reject the new query keys.

- [ ] **Step 3: Implement strict dual-mode schemas and services**

Add optional trimmed `search`, coerced `page`, and `limit` fields. Pass a parameter object from each route instead of positional values. Build a single organization-scoped `where` per service, run search/status before `skip` and `take`, and return the legacy array or paginated envelope based on whether raw `page` or `limit` was supplied.

- [ ] **Step 4: Document dual responses**

For `/regularize/processes` and `/regularize/sites-pass`, document search/page/limit parameters and a response `oneOf` containing the current array schema and `{ data, total, page, limit, hasMore }`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @workspace/regularize-service test
pnpm --filter @workspace/regularize-service typecheck
```

Expected: both PASS.

```bash
git add services/regularize-service
git commit -m "fix: filter regularize lists before pagination"
```

---

### Task 5: Regularize paginated management tables

**Files:**
- Modify: `app/src/modules/regularize/types.ts`
- Modify: `app/src/modules/regularize/services/regularizeService.contract.ts`
- Modify: `app/src/modules/regularize/services/regularizeService.ts`
- Modify: `app/src/modules/regularize/hooks/queryKeys.ts`
- Modify: `app/src/modules/regularize/hooks/useRegularizeOperations.ts`
- Modify: `app/src/modules/regularize/hooks/useRegularizeCredentials.ts`
- Modify: `app/src/modules/regularize/components/RegularizePage.tsx`
- Modify: `app/src/modules/regularize/run-regularize-tests.mjs`

**Interfaces:**
- Keeps `useRegularizeProcesses({ status })` and `useRegularizeSitePasswords({ status })` returning complete arrays for dashboards/form options.
- Adds `usePaginatedRegularizeProcesses(filters)` and `usePaginatedRegularizeSitePasswords(filters)` returning `PaginatedResult`.

- [ ] **Step 1: Add failing frontend contracts**

Assert process/site parameter builders include `search`, `page`, and `limit`, their query keys include every criterion, and page unwrappers preserve metadata. Add source assertions that both table tabs use the paginated hooks, `useDebouncedValue(..., 300)`, status/search controls, and `PaginationControls`.

- [ ] **Step 2: Verify the frontend red state**

Run:

```bash
pnpm --filter @workspace/app test:regularize
```

Expected: FAIL because the paginated hooks do not exist.

- [ ] **Step 3: Add page-specific types, clients, and hooks**

Extend both filter types with optional `search`, `page`, and `limit`. Keep the existing list methods omitting pagination. Add `listProcessesPage` and `listSitePasswordsPage`, each forcing page/limit and calling `normalizePaginatedResult`. Add query-key branches named `"processes-page"` and `"sites-page"` containing status/search/page/limit; do not use placeholder data.

- [ ] **Step 4: Wire independent process and site controls**

In `RegularizePage`, retain the full-list queries under names such as `processCatalogQuery` and `siteCatalogQuery` for metrics/options. Add separate raw search, debounced search, status, and page state for each management tab. Reset page in each input/filter handler, show a loading state instead of prior rows while debounce is pending, render paginated rows, and add `PaginationControls` below each table. Keep site requests independent of `selectedCredentialClientId`.

- [ ] **Step 5: Handle selection and out-of-range pages**

When process/site criteria change, clear the corresponding selected detail ID if it is not in the new page. When a successful fetch returns an empty page with `total > 0`, set its page to `getLastPage(total, 20)`. Leave dashboard totals and form options sourced from the full-list catalog queries.

- [ ] **Step 6: Verify and commit**

Run:

```bash
pnpm --filter @workspace/app test:regularize
pnpm --filter @workspace/app typecheck
```

Expected: both PASS.

```bash
git add app/src/modules/regularize
git commit -m "fix: paginate regularize management searches"
```

---

### Task 6: Pessoal union opt-in pagination

**Files:**
- Modify: `services/pessoal-service/src/schemas/union.schemas.ts`
- Modify: `services/pessoal-service/src/routes/union.routes.ts`
- Modify: `services/pessoal-service/src/services/unionService.ts`
- Modify: `services/pessoal-service/src/test/union.routes.test.ts`
- Modify: `services/pessoal-service/src/test/unionService.test.ts`
- Modify: `services/pessoal-service/src/openapi/spec.ts`
- Modify: `services/pessoal-service/src/test/openapi.test.ts`

**Interfaces:**
- `UnionService.list(context, query)` searches name/CNPJ and returns `UnionRecord[] | PaginatedUnionResult`.
- No query parameters preserves the array used by payroll.

- [ ] **Step 1: Add failing schema, route, service, and OpenAPI assertions**

Test no-query legacy output, `?search=metal&page=2&limit=20`, invalid boundaries, and a service `where` containing:

```ts
{
  organization_id: organizationId,
  OR: [
    { name: { contains: "metal", mode: "insensitive" } },
    { cnpj: { contains: "metal", mode: "insensitive" } },
  ],
}
```

Assert `skip: 20`, `take: 20`, shared `where` for `findMany`/`count`, and OpenAPI `oneOf`.

- [ ] **Step 2: Verify the Pessoal red state**

Run:

```bash
pnpm --filter @workspace/pessoal-service test -- src/test/union.routes.test.ts src/test/unionService.test.ts src/test/openapi.test.ts
```

Expected: FAIL on absent list-query support.

- [ ] **Step 3: Implement and document dual-mode listing**

Add `listUnionsQuerySchema` with optional trimmed search/page/limit, parse it in the route, preserve raw pagination presence, and pass normalized values to the service. Apply search before `skip`/`take`; return the legacy array or page envelope. Document all parameters and both response shapes.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm --filter @workspace/pessoal-service test
pnpm --filter @workspace/pessoal-service typecheck
```

Expected: both PASS.

```bash
git add services/pessoal-service
git commit -m "fix: filter unions before pagination"
```

---

### Task 7: Pessoal paginated union management

**Files:**
- Modify: `app/src/modules/pessoal/types/unions.ts`
- Modify: `app/src/modules/pessoal/services/pessoalService.ts`
- Modify: `app/src/modules/pessoal/hooks/usePessoalUnions.ts`
- Modify: `app/src/modules/pessoal/components/PessoalUnionsSection.tsx`
- Modify: `app/src/modules/pessoal/run-pessoal-tests.mjs`

**Interfaces:**
- Keeps `usePessoalUnions()` and `pessoalService.listUnions()` as full-list APIs for `PessoalPayrollSection`.
- Adds `PessoalUnionListParams`, `pessoalService.listUnionsPage(params)`, and `usePaginatedPessoalUnions(params)`.

- [ ] **Step 1: Add failing contract and source tests**

Add assertions that the page request sends `{ search, page, limit }`, the page response preserves metadata, payroll still calls `usePessoalUnions()`, and `PessoalUnionsSection` calls `usePaginatedPessoalUnions`, debounces for 300 ms, and renders `PaginationControls`.

- [ ] **Step 2: Verify the frontend red state**

Run:

```bash
pnpm --filter @workspace/app test:pessoal
```

Expected: FAIL because page-specific union APIs are absent.

- [ ] **Step 3: Implement the separate page client and hook**

Add:

```ts
export interface PessoalUnionListParams {
  search?: string;
  page: number;
  limit: number;
}
```

Implement `listUnionsPage` with Axios params and `normalizePaginatedResult`. Key the paginated hook by `"unions-page"`, trimmed search, page, and limit. Keep mutation invalidation rooted at `["pessoal", "unions"]` so both legacy and page caches refresh.

- [ ] **Step 4: Convert only the management section**

Add raw search and page state to `PessoalUnionsSection`, debounce at 300 ms, reset page immediately on input, hide old rows while pending, render page data and `PaginationControls`, and correct an empty out-of-range page with `getLastPage`. Keep create/edit behavior and the payroll consumer unchanged.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @workspace/app test:pessoal
pnpm --filter @workspace/app typecheck
```

Expected: both PASS.

```bash
git add app/src/modules/pessoal
git commit -m "fix: paginate union management search"
```

---

### Task 8: Cross-scope regression, graph fallback review, and release readiness

**Files:**
- Modify only if verification exposes an issue: files already listed in Tasks 1–7.

**Interfaces:**
- Consumes all prior task outputs.
- Produces a verified branch ready for review and publication.

- [ ] **Step 1: Refresh available Graphify scopes**

Run:

```bash
pnpm graphify:refresh
```

Expected: refreshes available graphs; if graphs remain absent, record the fallback and continue with source/diff review.

- [ ] **Step 2: Run every affected test suite**

Run:

```bash
pnpm --filter @workspace/task-service test
pnpm --filter @workspace/regularize-service test
pnpm --filter @workspace/pessoal-service test
pnpm --filter @workspace/app test:projects
pnpm --filter @workspace/app test:regularize
pnpm --filter @workspace/app test:pessoal
pnpm --filter @workspace/app test:pagination
```

Expected: all PASS.

- [ ] **Step 3: Run typechecks, smoke coverage, and production builds**

Run:

```bash
pnpm --filter @workspace/task-service typecheck
pnpm --filter @workspace/regularize-service typecheck
pnpm --filter @workspace/pessoal-service typecheck
pnpm --filter @workspace/app typecheck
pnpm smoke:coverage
pnpm --filter @workspace/task-service build
pnpm --filter @workspace/regularize-service build
pnpm --filter @workspace/pessoal-service build
pnpm --filter @workspace/app build
```

Expected: every command exits 0.

- [ ] **Step 4: Review the complete diff and call sites**

Run:

```bash
git diff --check origin/develop...HEAD
git diff --stat origin/develop...HEAD
git diff origin/develop...HEAD
rg -n "listUnions\\(|listProcesses\\(|listSitePasswords\\(|taskModelService\\.list\\(" app/src
git status --short
```

Expected: no whitespace errors; legacy full-list calls remain in payroll/forms/catalog paths; management paths use page methods; only issue #425 files and the approved docs are changed.

- [ ] **Step 5: Perform the essential browser regression**

Start the required local services and app, then verify:

1. Create or identify at least 21 matching records in each manageable list fixture/environment.
2. Search for a value that exists only after row 20 and confirm it appears on page 1 of filtered results.
3. Change search and status while on page 2 and confirm page resets to 1 and old rows disappear immediately.
4. Confirm task cards show the full filtered total and summaries while “Carregar mais” still appends rows.
5. Confirm task-model, process, site, and union Previous/Next controls show 20 rows per page.
6. Confirm Regularize Sites does not change when the selected client changes.
7. Confirm payroll’s union selector still contains the complete union catalog.

- [ ] **Step 6: Commit any verification-only correction and confirm clean status**

If a correction was required:

```bash
git add <only-the-corrected-files>
git commit -m "fix: address pagination regression"
```

Then run:

```bash
git status --short
git log --oneline origin/develop..HEAD
```

Expected: clean worktree and a focused commit series containing the design, plan, and implementation.
