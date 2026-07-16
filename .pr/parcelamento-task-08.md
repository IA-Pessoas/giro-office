## Summary
- Register `parcelamento-service` in the VPS compose stack, runtime override, buildx push, selective deploy scope, changed-service detection, endpoint wait checks, workflow env mapping, and secrets manifest.
- Finalize `parcelamento-service` README documentation with the active domain routes and env surface.
- Add regression coverage for the new VPS/deploy wiring and record final migration validation in `.pr/parcelamento-service-final.md`.
- Update ignored local/VPS env files with real parcelamento and gateway values before publishing this PR.

## Validation
- `pnpm --filter @workspace/parcelamento-service test`
- `pnpm --filter @workspace/parcelamento-service typecheck`
- `pnpm --filter @workspace/parcelamento-service check`
- `pnpm --filter @workspace/gateway test`
- `pnpm --filter @workspace/gateway typecheck`
- `pnpm smoke:coverage`
- `pnpm harness:test`
- `pnpm security:compose`
- `pnpm turbo run build --filter=@workspace/parcelamento-service`
- `pnpm graphify:update:services`
- `git diff --check`

## Notes
- Env files updated for local and VPS execution are ignored by git and intentionally not included in this PR.
- Full workspace `pnpm check` still reports pre-existing unrelated Biome findings in migration/backup scripts; touched files pass targeted checks.

Closes #364

Signed-off-by: JohanVPS
