# Issue #503 - TI terms available asset selector

## Root cause

The TI terms form loaded inventory assets without an availability filter:

- `TiTermsTab` called `useTiInventory(undefined, { enabled: canManage })`.
- The TI inventory list endpoint had no `status=available` filter.

That meant the selector depended on the first paginated, mixed inventory result instead of asking for the same available assets shown by inventory.

## Minimal fix

- Add `status=available|assigned` to the TI inventory list query.
- Map `available` to `user_id: null` and `assigned` to `user_id: { not: null }`.
- Make the terms asset selector request `{ status: "available", page_size: 100 }`.
- Cover the contract with the existing TI static test runner and focused service/route tests.

## Validation target

- `pnpm --filter @workspace/app run test:ti`
- TI service check/typecheck
- App typecheck
- OpenAPI smoke coverage
- UI screenshot of the new term dialog selecting the available `test` asset
