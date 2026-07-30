# TI Stock Search and Location Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TI stock filters operate on the full server-side result set, expose reliable pagination metadata and controls, and ensure location cells never display a raw identifier.

**Architecture:** `ti-service` will use one Prisma predicate for both `count` and the paginated `findMany`, returning the established `{ data, total, page, limit, hasMore }` contract. The TI frontend service and hook will preserve that metadata, while `TiStockTab` will reuse `PaginationControls` and a small pure resolver for readable location labels.

**Tech Stack:** TypeScript, Prisma, Express, Zod, Vitest, React, TanStack React Query, existing shared pagination helpers, Biome, pnpm.

## Global Constraints

- Work only on branch `fix/458-ti-stock-search-location-display` in `.worktrees/issue-458`.
- Keep the request parameters as `page` and `page_size`; use page size `50`.
- Return `{ data, total, page, limit, hasMore }` inside the existing success envelope.
- Apply `name`, `category_id`, `location_id`, and `status` before `count`, `skip`, and `take`.
- Resolve location text as relation name, then loaded-location name, then `Local não informado`.
- Never render `location_id`, a floor, or another numeric value as the location label.
- Reuse `PaginationControls`; do not create a second pagination component.
- Do not modify `app/src/shared/components/newLayout/Tecnologia.tsx`.
- Do not expand the work into the global pagination standard tracked by issue #430.
- Add no dependency and do not change package manifests or `pnpm-lock.yaml`.

---

### Task 1: Paginated TI stock backend contract

**Files:**
- Modify: `services/ti-service/src/test/tiStockService.test.ts`
- Modify: `services/ti-service/src/test/tiStock.routes.test.ts`
- Modify: `services/ti-service/src/test/app.test.ts`
- Modify: `services/ti-service/src/services/tiStockService.ts`
- Modify: `services/ti-service/src/openapi/spec.ts`

**Interfaces:**
- Consumes: `ListTiStockItemsQuery` with `page`, `page_size`, `name`, `category_id`, `location_id`, and `status`.
- Produces: exported `TiStockListResult` and `TiStockService.listItems(...): Promise<TiStockListResult>`.
- Produces HTTP data: `{ data: unknown[], total: number, page: number, limit: number, hasMore: boolean }`.

- [ ] **Step 1: Recreate the worktree dependencies and verify the starting point**

Run:

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/ti-service exec vitest run src/test/tiStockService.test.ts src/test/tiStock.routes.test.ts src/test/app.test.ts
pnpm --filter @workspace/app test:ti
```

Expected: installation succeeds without changing manifests; the existing scoped tests pass before behavior changes.

- [ ] **Step 2: Write the failing service pagination test**

Append this case inside `describe("TiStockService", ...)` in
`services/ti-service/src/test/tiStockService.test.ts`:

```ts
it("filters the full stock result before pagination and returns page metadata", async () => {
  const item = {
    id: stockId,
    name: "Mouse sem fio",
    category_id: categoryId,
    location_id: locationId,
    status: true,
    location: { id: locationId, name: "Almoxarifado TI" },
  };
  const count = vi.fn(async () => 3);
  const findMany = vi.fn(async () => [item]);
  const prisma = {
    department: { findFirst: vi.fn(async () => ({ id: departmentId })) },
    stock: { count, findMany },
  };
  const service = new TiStockService(prisma as never);

  const result = await service.listItems(context, {
    name: "Mouse",
    category_id: categoryId,
    location_id: locationId,
    status: true,
    page: 2,
    page_size: 1,
  });
  const where = {
    organization_id: context.organizationId,
    department_id: departmentId,
    category_id: categoryId,
    location_id: locationId,
    name: { contains: "Mouse", mode: "insensitive" },
    status: true,
  };

  expect(count).toHaveBeenCalledWith({ where });
  expect(findMany).toHaveBeenCalledWith({
    where,
    include: {
      category: true,
      location: true,
      department: true,
    },
    orderBy: { name: "asc" },
    skip: 1,
    take: 1,
  });
  expect(result).toEqual({
    data: [item],
    total: 3,
    page: 2,
    limit: 1,
    hasMore: true,
  });
});
```

- [ ] **Step 3: Update the route and OpenAPI tests to require metadata**

Change the successful list expectation in
`services/ti-service/src/test/tiStock.routes.test.ts` to:

```ts
expect(response.body).toMatchObject({
  success: true,
  data: {
    data: [],
    total: 0,
    page: 1,
    limit: 50,
    hasMore: false,
  },
});
```

In `services/ti-service/src/test/app.test.ts`, add this assertion after the existing stock
movement schema assertion:

```ts
expect(
  response.body.paths["/ti/stock/items/list"].get.responses["200"].content[
    "application/json"
  ].schema,
).toMatchObject({
  type: "object",
  required: ["success", "data"],
  properties: {
    success: { type: "boolean", enum: [true] },
    data: {
      type: "object",
      required: ["data", "total", "page", "limit", "hasMore"],
      properties: {
        data: { type: "array" },
        total: { type: "integer", minimum: 0 },
        page: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1 },
        hasMore: { type: "boolean" },
      },
    },
  },
});
```

- [ ] **Step 4: Run the new backend expectations and verify RED**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiStockService.test.ts src/test/tiStock.routes.test.ts src/test/app.test.ts
```

Expected: failures show that `listItems` returns an array, the route lacks pagination metadata,
and the OpenAPI response still uses only the generic success schema.

- [ ] **Step 5: Implement the minimal paginated service result**

In `services/ti-service/src/services/tiStockService.ts`, add:

```ts
export type TiStockListResult = {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
```

Replace `listItems` with:

```ts
async listItems(
  context: TiAuthContext,
  query: ListTiStockItemsQuery,
): Promise<TiStockListResult> {
  const departmentId = await this.resolveDepartment(context.organizationId);
  const page = query.page ?? 1;
  const { skip, take } = getPaginationParams(query);
  const where = {
    organization_id: context.organizationId,
    department_id: departmentId,
    ...(query.category_id ? { category_id: query.category_id } : {}),
    ...(query.location_id ? { location_id: query.location_id } : {}),
    ...(query.name ? { name: { contains: query.name, mode: "insensitive" as const } } : {}),
    ...(query.status === undefined ? {} : { status: query.status }),
  };
  const [total, data] = await Promise.all([
    this.prisma.stock.count({ where }),
    this.prisma.stock.findMany({
      where,
      include: {
        category: true,
        location: true,
        department: true,
      },
      orderBy: { name: "asc" },
      skip,
      take,
    }),
  ]);

  return {
    data,
    total,
    page,
    limit: take,
    hasMore: page * take < total,
  };
}
```

- [ ] **Step 6: Document the exact paginated success envelope**

Add this `successSchema` to the `/ti/stock/items/list` operation in
`services/ti-service/src/openapi/spec.ts`:

```ts
successSchema: {
  type: "object",
  required: ["success", "data"],
  properties: {
    success: { type: "boolean", enum: [true] },
    data: {
      type: "object",
      required: ["data", "total", "page", "limit", "hasMore"],
      properties: {
        data: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        total: { type: "integer", minimum: 0 },
        page: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1 },
        hasMore: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: true,
},
```

- [ ] **Step 7: Run the backend tests and verify GREEN**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiStockService.test.ts src/test/tiStock.routes.test.ts src/test/app.test.ts
```

Expected: all selected Vitest files pass and the service test proves `count` and `findMany` share
the same pre-pagination predicate.

- [ ] **Step 8: Commit the backend contract**

```bash
git add services/ti-service/src/test/tiStockService.test.ts services/ti-service/src/test/tiStock.routes.test.ts services/ti-service/src/test/app.test.ts services/ti-service/src/services/tiStockService.ts services/ti-service/src/openapi/spec.ts
git commit -m "fix(ti): paginate filtered stock items"
```

---

### Task 2: Preserve pagination metadata in the TI frontend data layer

**Files:**
- Modify: `app/src/modules/ti/run-ti-tests.mjs`
- Modify: `app/src/modules/ti/services/tiStockService.ts`
- Modify: `app/src/modules/ti/hooks/useTiStock.ts`

**Interfaces:**
- Consumes: `TiEnvelope<TiStockItem[] | PaginatedResult<TiStockItem>>`.
- Produces: `tiStockService.listStockItems(filters): Promise<PaginatedResult<TiStockItem>>`.
- Produces: `useTiStockItems(...): UseQueryResult<PaginatedResult<TiStockItem>, Error>`.

- [ ] **Step 1: Add a failing frontend data-contract test**

Add this case to `app/src/modules/ti/run-ti-tests.mjs`:

```js
await runTest("ti stock list preserves server pagination metadata", async () => {
  const serviceSource = await readModuleSource("services/tiStockService.ts");
  const hookSource = await readModuleSource("hooks/useTiStock.ts");

  assert.match(serviceSource, /PaginatedResult<TiStockItem>/);
  assert.match(serviceSource, /normalizePaginatedResult/);
  assert.match(serviceSource, /page:\s*Number\(filters\?\.page\s*\?\?\s*1\)/);
  assert.match(serviceSource, /limit:\s*Number\(filters\?\.page_size\s*\?\?\s*50\)/);
  assert.match(
    hookSource,
    /UseQueryResult<PaginatedResult<TiStockItem>, Error>/,
  );
});
```

- [ ] **Step 2: Run the frontend module test and verify RED**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: the new case fails because the service and hook still expose only `TiStockItem[]`.

- [ ] **Step 3: Return the normalized paginated result from the service**

In `app/src/modules/ti/services/tiStockService.ts`, import:

```ts
import {
  normalizePaginatedResult,
  type PaginatedResult,
} from "@shared/pagination/pagination";
```

Replace `listStockItems` with:

```ts
async listStockItems(filters?: TiListFilters): Promise<PaginatedResult<TiStockItem>> {
  const response = await api.get<
    TiEnvelope<TiStockItem[] | PaginatedResult<TiStockItem>>
  >(TI_ENDPOINTS.stockItems.list, {
    params: buildTiListParams(filters),
  });
  const fallback = {
    page: Number(filters?.page ?? 1),
    limit: Number(filters?.page_size ?? 50),
  };

  return normalizePaginatedResult(
    unwrapTiEnvelope<TiStockItem[] | PaginatedResult<TiStockItem>>(response.data),
    fallback,
  );
},
```

- [ ] **Step 4: Align the React Query hook return type**

In `app/src/modules/ti/hooks/useTiStock.ts`, import:

```ts
import type { PaginatedResult } from "@shared/pagination/pagination";
```

Change the `useTiStockItems` return type to:

```ts
): UseQueryResult<PaginatedResult<TiStockItem>, Error> {
```

- [ ] **Step 5: Run the frontend contract test and verify GREEN**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: all TI frontend contract tests pass.

- [ ] **Step 6: Commit the frontend data contract**

```bash
git add app/src/modules/ti/run-ti-tests.mjs app/src/modules/ti/services/tiStockService.ts app/src/modules/ti/hooks/useTiStock.ts
git commit -m "fix(ti): preserve stock pagination metadata"
```

---

### Task 3: Add stock pagination controls and readable location resolution

**Files:**
- Create: `app/src/modules/ti/utils/stockDisplay.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`
- Modify: `app/src/modules/ti/components/tiFormControls.tsx`
- Modify: `app/src/modules/ti/components/TiStockTab.tsx`

**Interfaces:**
- Produces: `resolveTiStockLocationName(item, locations): string`.
- Consumes: `PaginatedResult<TiStockItem>` from Task 2.
- Consumes: shared `PaginationControls`.
- Extends: `TiDataTable` with an optional `footer?: ReactNode` rendered inside its existing
  bordered container.

- [ ] **Step 1: Write failing tests for location names and pagination wiring**

Add these cases to `app/src/modules/ti/run-ti-tests.mjs`. The dynamic import keeps the missing
helper inside the named RED test instead of aborting the entire test module:

```js
await runTest("ti stock location display never falls back to a raw id", async () => {
  const { resolveTiStockLocationName } = await import("./utils/stockDisplay.ts");
  const locations = [{ id: 24, name: "Almoxarifado TI" }];

  assert.equal(
    resolveTiStockLocationName(
      { id: 1, location_id: 24, location: { id: 24, name: "Sala de Equipamentos" } },
      locations,
    ),
    "Sala de Equipamentos",
  );
  assert.equal(
    resolveTiStockLocationName({ id: 2, location_id: 24 }, locations),
    "Almoxarifado TI",
  );
  assert.equal(
    resolveTiStockLocationName({ id: 3, location_id: 99 }, locations),
    "Local não informado",
  );
});

await runTest("ti stock filters reset and render server pagination", async () => {
  const tabSource = await readModuleSource("components/TiStockTab.tsx");

  assert.match(tabSource, /const STOCK_PAGE_SIZE = 50/);
  assert.match(tabSource, /const \[stockPage, setStockPage\] = useState\(1\)/);
  assert.match(tabSource, /page:\s*stockPage/);
  assert.match(tabSource, /page_size:\s*STOCK_PAGE_SIZE/);
  assert.match(tabSource, /setStockPage\(1\)/);
  assert.match(tabSource, /<PaginationControls/);
  assert.match(tabSource, /resolveTiStockLocationName/);
  assert.doesNotMatch(
    tabSource,
    /getRelatedName\(item\.location,\s*item\.location_id\)/,
  );
});
```

- [ ] **Step 2: Run the frontend test and verify RED**

Run:

```bash
pnpm --filter @workspace/app test:ti
```

Expected: the test cannot import `stockDisplay.ts`, and the stock tab lacks page state and shared
controls.

- [ ] **Step 3: Implement the pure readable-location resolver**

Create `app/src/modules/ti/utils/stockDisplay.ts`:

```ts
import type { TiStockItem, TiStockLocation } from "../types";

const STOCK_LOCATION_FALLBACK = "Local não informado";

function normalizeLocationName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function resolveTiStockLocationName(
  item: TiStockItem,
  locations: TiStockLocation[],
): string {
  const relationName = normalizeLocationName(item.location?.name);

  if (relationName) {
    return relationName;
  }

  const registeredLocation = locations.find(
    (location) => String(location.id) === String(item.location_id ?? ""),
  );

  return normalizeLocationName(registeredLocation?.name) ?? STOCK_LOCATION_FALLBACK;
}
```

- [ ] **Step 4: Make the existing query-state control accept an array adapter**

In `app/src/modules/ti/components/tiFormControls.tsx`, replace the `TiListQuery` type with:

```ts
type TiListQuery<T> = {
  data?: T[];
  error: Error | null;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
};
```

Remove the now-unused `UseQueryResult` type import. This remains structurally compatible with all
existing array queries and lets the stock tab pass `{ ...stockItemsQuery, data: stockItems }`.

- [ ] **Step 5: Add an optional in-container table footer**

In `TiDataTable`, add `footer` to the destructured props:

```ts
export function TiDataTable({
  children,
  className,
  footer,
  headers,
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  headers: string[];
}) {
```

Immediately after the closing `</table>` and before the outer `</div>`, render:

```tsx
{footer}
```

Existing tables omit the optional prop and remain unchanged.

- [ ] **Step 6: Wire page state and query parameters in `TiStockTab`**

Import:

```ts
import { PaginationControls } from "@shared/components";
import { resolveTiStockLocationName } from "../utils/stockDisplay";
```

Add next to the existing stock constants:

```ts
const STOCK_PAGE_SIZE = 50;
```

Add state and the memoized request:

```ts
const [stockPage, setStockPage] = useState(1);
const stockListFilters = useMemo(
  () => ({
    ...filters,
    page: stockPage,
    page_size: STOCK_PAGE_SIZE,
  }),
  [filters, stockPage],
);
```

Change the query and row derivation to:

```ts
const stockItemsQuery = useTiStockItems(stockListFilters);
const stockItems = stockItemsQuery.data?.data ?? [];
```

At the start of `applyStockFilters`, before `setFilters`, add:

```ts
setStockPage(1);
```

- [ ] **Step 7: Render readable locations and shared pagination**

Pass the array adapter to `TiQueryStatePanel`:

```tsx
query={{ ...stockItemsQuery, data: stockItems }}
```

Replace both table/detail location expressions with:

```tsx
{resolveTiStockLocationName(item, stockLocations)}
```

and:

```tsx
{resolveTiStockLocationName(selectedItem, stockLocations)}
```

Pass this `footer` prop to `TiDataTable`:

```tsx
footer={
  <PaginationControls
    page={stockPage}
    limit={STOCK_PAGE_SIZE}
    total={stockItemsQuery.data?.total ?? 0}
    count={stockItems.length}
    hasMore={stockItemsQuery.data?.hasMore ?? false}
    isFetching={stockItemsQuery.isFetching}
    onPrevious={() => setStockPage((current) => Math.max(1, current - 1))}
    onNext={() => setStockPage((current) => current + 1)}
  />
}
```

- [ ] **Step 8: Run frontend tests and typecheck, then verify GREEN**

Run:

```bash
pnpm --filter @workspace/app test:ti
pnpm --filter @workspace/app typecheck
```

Expected: TI contract tests and the app typecheck pass; the pure helper proves IDs are not
rendered.

- [ ] **Step 9: Commit the stock UI**

```bash
git add app/src/modules/ti/utils/stockDisplay.ts app/src/modules/ti/run-ti-tests.mjs app/src/modules/ti/components/tiFormControls.tsx app/src/modules/ti/components/TiStockTab.tsx
git commit -m "fix(ti): show paginated stock locations"
```

---

### Task 4: Refresh context and complete essential verification

**Files:**
- Verify only: all files changed in Tasks 1–3.
- Must remain unchanged: `app/src/shared/components/newLayout/Tecnologia.tsx`.
- Must remain unchanged: `package.json`, `app/package.json`, service manifests, and `pnpm-lock.yaml`.

**Interfaces:**
- Verifies the public route, frontend consumer, OpenAPI contract, and source graph remain aligned.

- [ ] **Step 1: Refresh the affected Graphify scopes**

Run:

```bash
pnpm graphify:update:ui
pnpm graphify:update:services
```

Expected: both local graphs refresh. If Graphify remains unavailable, record that fact and use
the repository-prescribed manual checks in Step 6; do not block the issue.

- [ ] **Step 2: Run all essential scoped tests**

Run:

```bash
pnpm --filter @workspace/ti-service exec vitest run src/test/tiStockService.test.ts src/test/tiStock.routes.test.ts src/test/app.test.ts
pnpm --filter @workspace/app test:ti
pnpm --filter @workspace/app test:pagination
```

Expected: all selected tests pass with no failures.

- [ ] **Step 3: Run both affected typechecks**

Run:

```bash
pnpm --filter @workspace/ti-service typecheck
pnpm --filter @workspace/app typecheck
```

Expected: both TypeScript checks exit `0`.

- [ ] **Step 4: Run formatting, lint, and smoke contract coverage**

Run:

```bash
pnpm exec biome check services/ti-service/src/services/tiStockService.ts services/ti-service/src/test/tiStockService.test.ts services/ti-service/src/test/tiStock.routes.test.ts services/ti-service/src/test/app.test.ts services/ti-service/src/openapi/spec.ts app/src/modules/ti/services/tiStockService.ts app/src/modules/ti/hooks/useTiStock.ts app/src/modules/ti/components/tiFormControls.tsx app/src/modules/ti/components/TiStockTab.tsx app/src/modules/ti/utils/stockDisplay.ts app/src/modules/ti/run-ti-tests.mjs
pnpm smoke:coverage
```

Expected: Biome and smoke coverage exit `0`.

- [ ] **Step 5: Verify branch scope and untouched files**

Run:

```bash
git diff --check origin/develop...HEAD
git diff --stat origin/develop...HEAD
git diff --name-only origin/develop...HEAD
git status --short --branch
```

Expected: the diff contains only the design/plan and TI stock backend/frontend files listed by
this plan; the worktree is clean; no manifest, lockfile, or legacy `Tecnologia.tsx` change appears.

- [ ] **Step 6: Manually review the real call sites**

Run:

```bash
rg -n "listStockItems|useTiStockItems|resolveTiStockLocationName|PaginationControls|page_size|hasMore" app/src/modules/ti services/ti-service/src
git diff origin/develop...HEAD -- services/ti-service/src app/src/modules/ti
```

Expected: the request, route, service, hook, table, detail dialog, OpenAPI, and tests use the same
contract; there is no raw location-ID display fallback.

- [ ] **Step 7: Prepare publication**

After verification, invoke `superpowers:requesting-code-review`, then `github:yeet`. Commit any
review fixes using focused English conventional commits, push
`fix/458-ti-stock-search-location-display`, and open a PR against `develop` with an English title
and an English Markdown description that links issue #458 and lists the executed tests.
