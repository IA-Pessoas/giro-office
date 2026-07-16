## Summary
- Introduces the new `@workspace/parcelamento-service` microservice.
- Adds installment, installment competency, and panorama domain flows.
- Adds `agreement_number` as the canonical installment agreement identity.
- Wires gateway routing, modular permissions, OpenAPI aggregation, audit integration, and smoke coverage.
- Registers VPS compose/deploy/workflow coverage and finalizes README, env, and validation records for release review.

## Validation Matrix

| Step | Command | Result |
|---|---|---|
| 2 | `pnpm --filter @workspace/parcelamento-service test` | Passed: 11 test files, 77 tests. |
| 2 | `pnpm --filter @workspace/parcelamento-service typecheck` | Passed: `prisma:generate` then `tsc --noEmit`. |
| 2 | `pnpm --filter @workspace/parcelamento-service check` | Passed: Biome checked 33 files, no fixes applied. |
| 3 | `pnpm --filter @workspace/gateway test` | Passed: 3 test files, 81 tests. |
| 3 | `pnpm --filter @workspace/gateway typecheck` | Passed: `tsc --noEmit`. |
| 4 | `pnpm smoke:coverage` | Passed: 330/330 operations mapped with paired expectations. |
| 5 | `pnpm turbo run build --filter=@workspace/parcelamento-service` | Passed: 2 successful tasks; `@workspace/parcelamento-service` ran `prebuild`, `prisma:generate`, then `tsc`. |
| 6 | `pnpm graphify:update:services` | Passed: graph update completed; no code-graph topology changes detected; postprocess refreshed local service artifacts. |
| 8 | `pnpm harness:test` | Passed: 50 tests. |
| 8 | `pnpm security:compose` | Passed. |
| 8 | `git diff --check` | Passed. |
| 8 | Env sanity check | Passed: local and VPS parcelamento/gateway env files contain the expected keys and upstream URLs. |

## Milestone Status
- Task issues 01 through 07 are closed.
- Task PRs 01 through 07 are merged into `feature/parcelamento-service`.
- Task 08 remains open for this final hardening branch.
- Final aggregate PR closes the backend migration readiness scope for `feature/parcelamento-service`.

## Notes
- Local and VPS `.env` files were updated with real non-empty values where needed, but remain ignored and are not committed.
- `parcelamento-service` is now covered by VPS compose, runtime override, selective deploy scope, buildx push, endpoint wait checks, active workflow env mapping, and env materialization manifest.
- Graphify artifacts under `services/graphify-out/` are local and are not versioned.
- Full workspace `pnpm check` still reports pre-existing unrelated Biome findings in migration/backup scripts; touched files pass targeted checks.
- Issue #305 remains open because it includes frontend integration acceptance criteria outside this backend task.

Signed-off-by: JohanVPS
