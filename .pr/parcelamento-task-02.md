## Summary
- Implements Task 02 from the Parcelamento Service implementation plan.
- Adds the installment HTTP contract under `/parcelamento/installments`.
- Keeps the branch scoped to installment schemas, routes, service rules, pagination, uniqueness checks, recalc, and tests.

## Changes
- Added installment request schemas with strict body/query/params validation.
- Added shared parcelamento pagination helpers with `page`, `page_size`, and `has_more`.
- Added `InstallmentService` with organization/user context guards, client ownership checks, agreement-number uniqueness, fallback duplicate checks, tenant-scoped writes, and aggregate recalculation.
- Mounted installment routes in `parcelamento-service` and return `201` for creates.
- Added service and route tests for pagination, detail, create, patch, duplicate rules, context forwarding, invalid input, `P2002` conflict conversion, and recalc settle/reopen behavior.

## Validation
- `pnpm --filter @workspace/parcelamento-service test -- installment`: passed, 34 tests.
- `pnpm --filter @workspace/parcelamento-service typecheck`: passed.
- `pnpm --filter @workspace/parcelamento-service check`: passed.
- `pnpm --filter @workspace/parcelamento-service test`: passed, 6 files and 39 tests.
- `pnpm graphify:update:services`: passed; Graphify reported no code-graph topology changes and only a non-blocking backup encoding warning.

## Performance Review

### Before / After Complexity
- Current: `feature/parcelamento-service` had only the service foundation and no installment domain contract.
- Proposed: list operations use database-side filtering, `count`, `findMany`, bounded pagination, and stable `id asc` ordering; create/patch use indexed duplicate checks; recalc loads only competencies for one installment in one organization.

### Dominant Bottleneck
- Database I/O dominates list, uniqueness, and recalc paths.

### Proposed Change
- Use one shared `where` object for list `count` and `findMany`.
- Use the Task 01 `organization_id + agreement_number` unique index for definitive identity.
- Use the Task 01 fallback lookup index for null-agreement duplicate checks.
- Use tenant-scoped `updateMany` writes followed by tenant-scoped refetches for patch and recalc.

### Tradeoff / Proof
- Validation commands above passed.
- Pagination bounds `page_size` to 100, limiting response size.
- Recalc data movement is bounded to `organization_id + installment_id`.
- The fallback duplicate rule remains a sequential pre-check in this task; full concurrent fallback protection would require schema/migration or transaction strategy work outside Task 02.

## Code Review
- Reviewed with superpowers:requesting-code-review.
- Critical findings fixed: 0.
- Important findings fixed: 4.
- Minor findings tracked in this PR: 0.
- Re-review result: no Critical, Important, or relevant Minor findings.

## Related Issues
- Closes #358.
- Related workstream: #354.

## Milestone
- Parcelamento Service Migration.

## Implementation Confidence
- Confidence after implementation: 94%.
- Evidence: installment tests, full parcelamento-service tests, typecheck, Biome check, Graphify services update, performance review, spec compliance review, and code quality re-review all passed.

## Labels
- parcelamento-service
- backend
- api
- database
- pagination
- tests

## Signature
Signed-off-by: JohanVPS <johanvictor17@gmail.com>
