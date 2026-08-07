# Search and Filters Before Pagination Design

## Context

Issue #425 requires search and filters to operate on the complete remote dataset before
pagination. The issue now covers four active product flows:

- integration tasks and their summary cards;
- task model administration;
- Regularize processes and base sites;
- Personnel unions.

Older `newLayout` examples for Commercial and Marketing are not active product routes, and
Personnel now renders `PessoalShell`. They are not part of this change.

## Goals

- Apply search and filters in the database query before `skip` and `take`.
- Reset administrative lists to page 1 when search or filters change.
- Prevent rows from different queries or pages from being mixed.
- Return correct totals and task summaries for the complete filtered dataset.
- Preserve full-list contracts used by selects and forms.
- Add regression coverage for records that would be outside the first unfiltered page.

## Scope

### Integration tasks

The existing task list already accepts `search`, `status`, `ref`, `page`, and `limit`, and
applies its filters before pagination. Its response will be extended additively with:

```ts
type IntegracaoTaskListResult = {
  data: IntegracaoTaskListItem[];
  total: number;
  hasMore: boolean;
  summary: {
    inProgress: number;
    billable: number;
  };
};
```

All counts use the same organization, search, status, and origin filters as the list. The
`total` card uses `total`, the in-progress card uses `summary.inProgress`, and the billing
card uses `summary.billable`. The current "Carregar mais" interaction remains.

### Task models

`GET /task/model/list` will accept optional `search`, `page`, and `limit` in addition to the
existing `type` and `billing` filters. Search matches:

- model name;
- related department name.

The management screen uses the paginated response and 20 rows per page. Existing consumers
that omit pagination continue receiving the current complete array.

### Regularize processes

`GET /regularize/processes` will accept optional `search`, `page`, and `limit` while
preserving the existing `status` filter. Search matches:

- process type;
- process document;
- PF client name or CPF;
- PJ client name or CNPJ.

The Processos tab adds a text search, status filter, total summary, and
`Anterior`/`Próxima` navigation.

### Regularize base sites

`GET /regularize/sites-pass` will accept optional `search`, `page`, and `limit` while
preserving the existing `status` filter. Search matches:

- site name;
- sphere;
- link;
- user.

The Sites tab remains a global catalog. The selected client does not restrict this list.
The management table uses pagination, while existing full-list consumers remain unchanged.

### Personnel unions

`GET /pessoal/unions` will accept optional `search`, `page`, and `limit`. Search matches:

- union name;
- CNPJ.

The Sindicatos tab adds text search, total summary, and `Anterior`/`Próxima` navigation.
Payroll and other lookup consumers that omit pagination continue receiving the complete
array.

## Backward-Compatible API Contract

The four newly paginated endpoints use opt-in pagination:

- when neither `page` nor `limit` is present, the endpoint returns its current array shape;
- when either `page` or `limit` is present, the endpoint returns a paginated result;
- a missing `page` defaults to `1`;
- a missing `limit` defaults to `20`.

The paginated shape is:

```ts
type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
```

Validation requires `page >= 1` and `1 <= limit <= 100`. Invalid query parameters produce
the existing standard `400` error envelope. OpenAPI documents both response modes with
`oneOf`.

## Frontend State and Data Flow

A shared `useDebouncedValue(value, 300)` hook stabilizes server-side search. Each
administrative screen keeps the raw input separately from the debounced query value.

When raw search or a filter changes:

1. the current page resets immediately to `1`;
2. the previous query is not appended to or labeled as the new result;
3. while debounce or the new request is pending, the table shows an updating state;
4. the query key includes search, filters, page, and limit;
5. the response replaces the page instead of merging it.

If a mutation leaves the current page above the final valid page, the UI moves to the last
valid page and refetches it.

Task models, Regularize sites, and Personnel unions receive dedicated paginated management
hooks. Existing full-list hooks and service methods remain available for selects and forms.

## Pagination UI

- Integration tasks keeps the existing "Carregar mais" flow.
- Task models, Processes, Sites, and Unions use 20 rows per page.
- Paginated tables show the range `X–Y de Z`.
- `Anterior` is disabled on page 1.
- `Próxima` is disabled when `hasMore` is false.
- Navigation controls are disabled while the current query is fetching.

## Error Handling

- Search values are trimmed before reaching the API.
- Empty search values are omitted or treated as no search.
- Database text matching is case-insensitive.
- A page beyond the result returns an empty `data` array with correct metadata.
- Existing authentication, authorization, domain errors, and success/error envelopes remain
  unchanged.
- No new dependency, database migration, or endpoint is introduced.

## Testing Strategy

Implementation follows red-green-refactor for each domain.

### Backend

- Service tests verify that search and filters build the database `where` before
  `skip`/`take`.
- Regression fixtures prove that a search finds an item outside the first unfiltered page.
- Count tests verify the same filtered `where` is used for `total`.
- Task tests verify `total`, `inProgress`, and `billable` over the complete filtered set.
- Route tests verify parsing, defaults, invalid bounds, and paginated response shapes.
- OpenAPI tests verify the added query parameters and response documentation.

### Frontend

- Contract tests verify query parameter builders and both array/paginated unwrappers.
- Query key tests verify that search, filters, page, and limit isolate caches.
- UI guardrail tests verify debouncing, page resets, navigation, and preservation of
  full-list lookup flows.
- Existing module suites cover integration tasks, Regularize, and Personnel regressions.

### Final validation

- `pnpm --filter @workspace/task-service test`
- `pnpm --filter @workspace/regularize-service test`
- `pnpm --filter @workspace/pessoal-service test`
- `pnpm --filter @workspace/app test:projects`
- `pnpm --filter @workspace/app test:regularize`
- `pnpm --filter @workspace/app test:pessoal`
- typecheck for all affected packages;
- OpenAPI and smoke coverage checks;
- app build;
- authenticated browser smoke for all four screens when the environment permits it.

Any authentication or service limitation that prevents the browser smoke is reported
explicitly and is not presented as a completed smoke test.
