# Services Security Audit - 2026-05-11

## Executive Summary

This audit adds an extensible service harness so future services are registered once and then picked up by smoke coverage, OpenAPI coverage checks, Prisma generated-client output checks, and scaffold codegen.

The current workspace services are represented in `scripts/service-registry.mjs`. OpenAPI-backed services are still required to have paired smoke expectations through `scripts/check-smoke-spec-coverage.mjs`; future workspace services under `services/*` will fail coverage until they are added to the registry.

## Services Covered

- `gateway`
- `audit-service`
- `user-service`
- `organization-service`
- `department-service`
- `client-service`
- `project-service`
- `task-service`
- `rh-service`
- `fiscal-service`
- `contabil-service`

Legacy `services/src` is not in `pnpm-workspace.yaml`, so it remains outside the new registry gate.

## Findings

| Severity | Area | Evidence | Impact | Recommendation |
| --- | --- | --- | --- | --- |
| Medium | Direct-service CORS | Most service apps use `cors()` directly, while gateway has explicit CORS options. | Directly exposed service ports can accept broader origins than intended. | Prefer gateway-only exposure in deployment and add centralized CORS metadata/policy per service. |
| Medium | Security headers | Express services do not use a shared security-header middleware such as Helmet. | Browser-facing responses may miss standard hardening headers. | Add a shared middleware for HTTP security headers at gateway and any directly exposed services. |
| Medium | Internal token model | Internal service-token metadata was hardcoded in the smoke runner and only covered selected services. | New internal endpoints can miss smoke/security coverage unless manually wired. | Use `scripts/service-registry.mjs` as the source of truth and require new internal endpoints to declare `internalTokenEnvKey`. |
| High | Dependency audit | `pnpm audit:ci` reports `app > next@16.2.4` vulnerable to GHSA-8h8q-6873-q5fj; patched versions are `>=16.2.5`. | CI dependency audit fails and the frontend may be exposed to the advisory's denial-of-service risk. | Upgrade `next` so the lockfile resolves to `>=16.2.5`, then rerun `pnpm audit:ci`. |
| Low | Legacy API harness gap | `services/src` has routes and auth middleware but is not in `pnpm-workspace.yaml` or the new service registry. | "All services" coverage excludes legacy API unless it is intentionally onboarded or deprecated. | Decide whether to add legacy API to the workspace registry or document it as out of scope. |

## Remediation Status

- Direct-service CORS is centralized through `createServiceCorsOptions`; production env parsing now rejects wildcard origins for the gateway and workspace service apps.
- Security headers are centralized through `createSecurityHeadersMiddleware` and mounted in the gateway plus all workspace service apps.
- Internal token metadata now comes from `scripts/service-registry.mjs`, and production config rejects missing, short, or default internal tokens.
- The dependency audit finding is remediated by upgrading `app` to `next@16.2.6` through the lockfile and synced install.
- The legacy API remains documented as out of scope for the harness because `services/src` is not part of `pnpm-workspace.yaml`; onboarding it requires a separate workspace/registry decision.

## Harness Changes

- `scripts/service-registry.mjs` is now the central metadata source for service URL env vars, default URLs, OpenAPI spec paths, internal token env vars, and Prisma output paths.
- `scripts/all-services-smoke.mjs` reads URL and internal-token metadata from the registry.
- `scripts/all-services-smoke.manifest.mjs` derives `specFiles` from the registry and loads generated smoke probes from `scripts/generated/*.smoke.mjs`.
- `scripts/check-smoke-spec-coverage.mjs` now fails if a workspace service is missing from the registry, or if a registry service has an OpenAPI spec but no smoke coverage.
- `scripts/generate-service-harness.mjs` provides the scaffold path for future services through `pnpm smoke:scaffold -- --service=<name> --port=<port>`.
- `scripts/prisma-generate.mjs` derives service Prisma output directories from the registry.

## Verification Appendix

| Command | Result |
| --- | --- |
| `pnpm harness:test` | Pass: 5 tests, 0 failures. |
| `pnpm smoke:coverage` | Pass: 167/167 OpenAPI operations mapped with paired expectations. |
| `pnpm smoke -- --dry-run --filter=gateway` | Pass: gateway health and readiness handlers resolve in dry-run mode. |
| `node scripts/generate-service-harness.mjs --service=billing-service --port=3040 --uses-prisma=true --dry-run` | Pass: emits registry entry, generated smoke path, and onboarding checklist without writing files. |
| `pnpm typecheck` | Pass: 15/15 Turbo tasks successful. |
| `pnpm check` | Pass: Biome checked 453 files with no fixes applied. |
| `pnpm test` | Pass: 26/26 Turbo tasks successful after running outside the sandbox for local IPC/listener support. |
| `pnpm --filter @workspace/app exec next --version` | Pass: `Next.js v16.2.6`. |
| `pnpm --filter @workspace/app build` | Pass: production build completed with Next.js 16.2.6. |
| `pnpm audit:ci` | Pass: no known vulnerabilities found. |
