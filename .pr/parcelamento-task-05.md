## Summary

- Add `ParcelamentoAuditService` for non-blocking parcelamento domain audit events.
- Wire audit events into installment, competency, and panorama create/update/generate flows.
- Preserve request correlation while generating unique audit row IDs to avoid audit-service uniqueness conflicts.

## Test Plan

- [x] `pnpm --filter @workspace/parcelamento-service test`
- [x] `pnpm --filter @workspace/parcelamento-service typecheck`
- [x] `pnpm --filter @workspace/parcelamento-service check`
- [x] `pnpm graphify:update:services`

## Related

- Closes #361
- Milestone: Parcelamento Service Migration

## Notes

- The plan mentioned `/internal/audit/events`, but the current `audit-service` contract exposes `POST /internal/audit/requests`; this implementation follows the real service contract.
- Domain audit uses fire-and-forget fetch with internal error logging so audit-service latency does not block parcelamento mutations.

Signed-off-by: JohanVPS <johanvictor17@gmail.com>
