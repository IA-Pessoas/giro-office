# TI Stock Search and Location Display Design

## Context

Issue #458 reports two related defects in `Tecnologia > Estoque`:

- stock search and filters must apply to the full result set before pagination; and
- the `Local` column must show a readable location name rather than a raw identifier.

The active page already renders `TiStockTab`, not the legacy mock in
`app/src/shared/components/newLayout/Tecnologia.tsx`. The active frontend also already loads
locations from `/ti/stock/locations/list`, sends the four stock filters, and prefers
`item.location.name`. The remaining root problem is the list contract: the backend applies
`skip`/`take` but returns only the resulting array, so the frontend cannot expose a reliable
total or current page. The current location fallback can also expose `location_id` when the
relation is absent.

## Goal

Provide a server-paginated TI stock list whose filters operate before pagination and whose
location cells always resolve to readable text.

## Non-goals

- Do not modify or reactivate the legacy mock `Tecnologia.tsx`.
- Do not standardize pagination across every module; that remains issue #430.
- Do not change stock create, update, entry, exit, category, or location mutation contracts.
- Do not introduce a new pagination component or a new dependency.

## Considered Approaches

### 1. Paginated backend contract with shared frontend controls

Return the filtered page and its metadata from `ti-service`, normalize that contract in the TI
frontend service, and render the existing shared `PaginationControls`.

This is the selected approach because it fixes the missing data contract, keeps filtering in the
database, and follows the pagination primitives already introduced by issue #425.

### 2. Backend-only correction

Add `count` and metadata to the route but leave the frontend returning only an array.

This would not satisfy the acceptance criterion for visible, consistent pagination and would
leave the additional metadata unused.

### 3. Client-side pagination

Fetch every filtered stock item and paginate the result in React.

This would make the UI simpler but would increase payload and rendering costs as stock grows,
contradicting the purpose of server pagination.

## Backend Design

`TiStockService.listItems` will build one Prisma `where` object containing:

- `organization_id`;
- the resolved Tecnologia `department_id`;
- optional `category_id`;
- optional `location_id`;
- optional case-insensitive `name`; and
- optional boolean `status`.

The service will execute `stock.count({ where })` and `stock.findMany({ where, ... })` against the
same predicate. `skip` and `take` apply only to `findMany`, after the filters have been defined.
The existing `category`, `location`, and `department` includes remain unchanged.

The returned value will follow the repository's current operational-list contract:

```ts
{
  data: TiStockItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
```

The request continues to accept `page` and `page_size`. The response uses `limit` and `hasMore`
to remain compatible with `PaginationControls` and the list pattern from issue #425. The route
continues to wrap this result with `createSuccessResponse`.

## Frontend Design

The TI stock service will return `PaginatedResult<TiStockItem>` and normalize both:

- the new paginated object; and
- an array response, as a defensive compatibility fallback.

`useTiStockItems` will expose that paginated result through React Query. `TiStockTab` will keep
the submitted filters separate from the draft fields and maintain a one-based page state. Each
request sends:

```ts
{
  name,
  category_id,
  location_id,
  status,
  page,
  page_size: 50,
}
```

Submitting the filter form resets the page to `1`. Previous and next actions change only the
page, preserving submitted filters. The existing `PaginationControls` receives the server
`total`, returned row count, current page, page size, `hasMore`, and fetch state.

## Readable Location Resolution

Location text will resolve in this order:

1. non-empty `item.location.name`;
2. the matching name from the loaded `/ti/stock/locations/list` options, using `location_id` only
   as an internal lookup key; and
3. `Local não informado`.

The raw `location_id`, a floor number, or another numeric value will never be rendered as the
location label. The same resolver will be used in the table and the item detail dialog.

## Error and State Handling

- Existing React Query loading, error, and empty states remain in `TiQueryStatePanel`.
- Pagination actions are disabled by the shared component while fetching.
- The next action is disabled when `hasMore` is false.
- The previous action is disabled on page `1`.
- No fallback will hide a failed request with mock data.

## Test Design

Implementation follows TDD.

Backend tests will first prove that:

- the same full filter predicate is passed to `count` and `findMany`;
- `skip` and `take` select an item outside the first page;
- the result reports `total`, `page`, `limit`, and `hasMore`; and
- the HTTP route serializes the paginated object while preserving included location names.

Frontend contract tests will first prove that:

- paginated stock responses preserve metadata;
- compatibility array responses normalize deterministically;
- the request includes `page` and `page_size`;
- applying filters resets the page to `1`;
- shared pagination controls are rendered; and
- the location fallback cannot render `location_id`.

Final validation will include scoped TI frontend tests, `ti-service` tests, frontend and service
typechecks, Biome on changed files, smoke contract coverage when applicable, and a direct diff
review for call sites and accidental legacy-file changes.

## Risks and Mitigations

- **Nested `data` fields:** the route envelope contains an inner paginated `data` array. The
  frontend will unwrap the outer success envelope once and then normalize the inner object.
- **Stale page after filtering:** filter submission always sets page `1`.
- **Missing relation data:** the loaded location list provides a second name source, followed by
  an explicit readable fallback.
- **Scope expansion into issue #430:** only the TI stock list adopts the already-existing shared
  controls in this change.
