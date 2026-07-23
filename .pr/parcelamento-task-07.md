## Summary
- Routes the public `/parcelamento` gateway prefix to the new `parcelamento-service`.
- Adds gateway authorization policy and forwarded modular permission handling for the `parcelamento` module.
- Aggregates the parcelamento OpenAPI contract through the gateway.

## Changes
- Added `PARCELAMENTO_SERVICE_URL` to the gateway env with default `http://localhost:3043`.
- Registered `parcelamento-service` in the gateway service registry with prefix `/parcelamento`, `permissionModule: "parcelamento"`, and `auditTarget: "parcelamento-service"`.
- Added modular route policy for `/parcelamento` requiring module permission level `1`.
- Included `buildParcelamentoServiceOpenApiSpec` in the aggregated gateway OpenAPI document and excluded parcelamento health/readiness paths from the public aggregate.
- Added gateway integration tests for env defaults, OpenAPI aggregation, proxy routing, permission blocking, forwarded modular permission, global admin fallback, and audit route target.
- Documented the parcelamento upstream in `services/gateway/README.md`.

## Validation
- `pnpm --filter @workspace/gateway test -- app.routes env`: 80 tests passed.
- `pnpm --filter @workspace/gateway typecheck`: passed.
- `pnpm smoke:coverage`: 330/330 operations mapped with paired expectations.
- `pnpm --filter @workspace/gateway check`: passed.
- `pnpm graphify:update:services`: completed; local graph artifacts refreshed.

Note: the first gateway typecheck surfaced stale local `@workspace/shared` declarations under `shared/dist`. Rebuilding `@workspace/shared` aligned the local generated declarations; no `shared` files changed in git.

## Performance Review

### Before / After Complexity
- Current: gateway prefix lookup and OpenAPI aggregation did not include parcelamento.
- Proposed: one static service-registry entry, one static policy matcher, and one static OpenAPI service definition were added.

### Dominant Bottleneck
- Runtime impact is limited to the existing gateway service iteration and policy matcher list. OpenAPI aggregation remains app startup work, not per-request work.

### Proposed Change
- Reuse the existing registry, authorization, proxy, audit, and OpenAPI aggregation paths instead of adding a parallel route map.

### Tradeoff / Proof
- The route/policy lists grow by one entry, preserving the current O(service count) prefix lookup behavior. Gateway tests prove routing, auth, forwarded permission, audit target, and OpenAPI aggregation for `/parcelamento`.

## Code Review
- Reviewed with superpowers:requesting-code-review before commit.
- Critical findings fixed: 0.
- Important findings fixed: 0.
- Minor findings tracked in this PR: 0.
- Reviewer assessment: ready to merge; no actionable issues found.

## Implementation Confidence
- Confidence after implementation: 95%.
- Evidence: RED/GREEN gateway tests, gateway typecheck, smoke coverage, Biome check, Graphify refresh, performance review, and independent code review with no actionable findings.

## Related Issues
- Related to #362

## Milestone
- Parcelamento Service Migration

## Labels
- parcelamento-service
- backend
- gateway
- auth
- openapi
- tests

## Signature
Signed-off-by: JohanVPS <johanvictor17@gmail.com>
