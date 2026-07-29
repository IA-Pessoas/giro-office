## Summary
- Documents the `parcelamento-service` public OpenAPI contract for installments, installment competencies, and monthly panoramas.
- Adds generated smoke coverage for all parcelamento OpenAPI operations, with domain routes gated by `PARCELAMENTO_SMOKE_ENABLED`.
- Wires the smoke harness condition so disabled parcelamento probes are skipped explicitly.

## Changes
- Expanded `buildParcelamentoServiceOpenApiSpec` with domain paths, bearer security, request schemas, typed response envelopes, and DTO/result schemas.
- Added OpenAPI tests for path coverage, pagination parameters, bearer auth, response schema references, and returned installment fields.
- Updated `scripts/generated/parcelamento-service.smoke.mjs` with health/readiness probes plus gated gateway probes for the parcelamento domain routes.
- Added `parcelamentoSmokeEnabled` parsing and disabled-condition reporting to the smoke harness.

## Validation
- `pnpm --filter @workspace/parcelamento-service test -- openapi`: 7 tests passed.
- `pnpm smoke:coverage`: 330/330 operations mapped with paired expectations.
- `pnpm --filter @workspace/parcelamento-service typecheck`: passed.
- `pnpm --filter @workspace/parcelamento-service check`: passed.
- `pnpm graphify:update:services`: completed; local graph artifacts refreshed.

## Performance Review

### Before / After Complexity
- Current: the foundation OpenAPI only documented health/readiness and the generated smoke file only covered service probes.
- Proposed: the OpenAPI document includes static domain metadata and the generated smoke manifest includes one static operation entry per public route.

### Dominant Bottleneck
- Cold-path setup and smoke harness manifest loading. No request handler, database query, external network call, or production domain hot path is added.

### Proposed Change
- Use static OpenAPI objects and generated smoke operation definitions. The runtime smoke gate is a single boolean condition check per smoke operation.

### Tradeoff / Proof
- The change increases source metadata size but keeps production request handling unchanged. `pnpm smoke:coverage` proves the static OpenAPI and smoke manifest remain aligned.

## Code Review
- Reviewed with superpowers:requesting-code-review before commit.
- Critical findings fixed: 0.
- Important findings fixed: 2.
- Minor findings tracked in this PR: 0.
- Notes: the reviewer flagged generic response envelopes and a missing `down_payment_installments_count` field; both were fixed and covered by additional OpenAPI tests.

## Implementation Confidence
- Confidence after implementation: 95%.
- Evidence: OpenAPI tests, smoke coverage, typecheck, Biome check, Graphify refresh, performance review, and independent code review with Important findings fixed.

## Related Issues
- Closes #362

## Milestone
- Parcelamento Service Migration

## Labels
- parcelamento-service
- backend
- openapi
- smoke
- tests

## Signature
Signed-off-by: JohanVPS <johanvictor17@gmail.com>
