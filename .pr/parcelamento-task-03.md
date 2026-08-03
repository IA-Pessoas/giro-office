## Summary
- Implements Task 03 from the Parcelamento Service implementation plan.
- Adds the installment competency HTTP contract for list, create, and patch flows.
- Keeps this branch scoped to competency schemas, service logic, routes, route mounting, and tests.

## Changes
- Adds Zod schemas for competency params, pagination query, create body, and strict patch body.
- Adds `InstallmentCompetencyService` with tenant-scoped parent lookup, duplicate checks, pagination, audit calls, and parent aggregate recalculation.
- Mounts competency collection routes under `/parcelamento/installments` and item patch routes under `/parcelamento/installment-competencies`.
- Adds service and route tests for pagination, duplicate conflicts, validation failures, recalc triggers, and organization scoping.

## Validation
- `pnpm --filter @workspace/parcelamento-service test -- installmentCompetencyService`: passed, 6 tests.
- `pnpm --filter @workspace/parcelamento-service test -- competency`: passed, 11 tests.
- `pnpm --filter @workspace/parcelamento-service test -- installment`: passed, 45 tests.
- `pnpm --filter @workspace/parcelamento-service test`: passed, 8 files and 50 tests.
- `pnpm --filter @workspace/parcelamento-service typecheck`: passed.
- `pnpm --filter @workspace/parcelamento-service check`: passed.
- `pnpm graphify:update:services`: passed; local Graphify backup emitted the existing Windows encoding warning and continued successfully.

## Performance Review

### Before / After Complexity
- Current: `feature/parcelamento-service` had installment CRUD and aggregate recalculation, but no competency contract.
- Proposed: competency list performs one parent ownership lookup plus one `count` and one paginated `findMany` using the same tenant-scoped `where`; create and patch perform bounded lookups/writes and trigger exactly one parent recalc when needed.

### Dominant Bottleneck
- Database I/O.

### Proposed Change
- Use indexed tenant and parent filters (`organization_id`, `installment_id`, `competence`) for parent validation, duplicate checks, list pagination, and patch writes.
- Keep recalc centralized in `InstallmentService.recalculateAggregates` and call it once per create or relevant patch.

### Tradeoff / Proof
- Offset pagination is consistent with Task 02 and bounded by `page_size` max 100.
- Patch writes use `updateMany({ id, organization_id })` plus a scoped refetch to preserve tenant isolation.
- Validation commands above passed after the code review fix.

## Code Review
- Spec compliance review: passed with no gaps.
- Code quality review: one Important finding found and fixed (`PATCH` write is now tenant-scoped).
- Critical findings fixed: 0.
- Important findings fixed: 1.
- Minor findings tracked in this PR: 2.

## Related Issues
- Closes #359.
- Related workstream: #354.

## Milestone
- Parcelamento Service Migration.

## Implementation Confidence
- Confidence after implementation: 94%.
- Evidence: TDD red/green was performed for competency service and route behavior, all parcelamento-service tests/typecheck/check passed, Graphify services was refreshed, performance review completed, and spec/code reviews passed after the tenant-scoped patch fix.

## Labels
- parcelamento-service
- backend
- api
- database
- pagination
- tests

## Signature
Signed-off-by: JohanVPS <johanvictor17@gmail.com>
