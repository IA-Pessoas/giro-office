# Stable Services Deploy Alignment Design

Date: 2026-05-11
Status: Draft for user review

## Context

The repository already contains `department-service`, `fiscal-service`, and
`contabil-service` as pnpm workspace packages. The gateway already has
environment variables and route registry entries for them:

- `/department` -> `department-service`, default URL `http://localhost:3036`
- `/fiscal` -> `fiscal-service`, default URL `http://localhost:3037`
- `/contabil` -> `contabil-service`, default URL `http://localhost:3038`

The smoke manifest and OpenAPI aggregation also include these services.
However, the VPS stable stack is still partially aligned to the older set of
stable services. The compose file does not define the three containers, the
gateway does not wait for them, the deploy secrets manifest does not materialize
their VPS env files, and the incremental deploy detector does not map changes in
their directories to their service images.

This creates a deployment gap: the gateway can route to services that are not
started by the stable VPS compose stack.

## Goal

Promote `department-service`, `fiscal-service`, and `contabil-service` to
mandatory members of the VPS stable stack before any new domain migration starts.

After this work, these three services must be treated the same way as the
existing stable services (`user`, `organization`, `task`, `project`, `client`,
and `rh`) across compose, gateway dependency ordering, env materialization,
incremental deploy detection, and deployment documentation.

## Non-Goals

- Do not migrate any new legacy domain.
- Do not change public API contracts for `/department`, `/fiscal`, or
  `/contabil`.
- Do not introduce optional Docker Compose profiles for these three services.
- Do not add fallback routing from the gateway to the legacy API.
- Do not redesign CI/CD workflows beyond aligning the existing deployment
  surfaces.

## Proposed Approach

Use a full stable-stack promotion, not a partial compose-only change.

The implementation should update every deployment surface that currently
declares, starts, documents, or detects stable microservices:

- `docker-compose.vps.yml`
- root `.env.vps.*` files
- `scripts/ci/vps-secrets.manifest`
- `scripts/ci/detect-changed-vps-services.sh`
- `docs/vps-deploy.md`

This approach is preferred because it prevents the same service from being
"stable" in one place and invisible in another.

## Compose Design

`docker-compose.vps.yml` should define three new mandatory services:

- `department-service`
- `fiscal-service`
- `contabil-service`

Each service should follow the existing service pattern:

- use `<<: *service_defaults`
- use image name `workspace-<service-name>:${WORKSPACE_VPS_IMAGE_TAG:-vps}`
- build with `docker/service.Dockerfile`
- pass `WORKSPACE_PACKAGE` and `SERVICE_DIR`
- use a root env file named `.env.vps.<service-name>`
- expose only the internal service port
- join `backend` and `egress`
- use `restart: unless-stopped`
- define a Docker healthcheck

Expected service ports:

- `department-service`: `3036`
- `fiscal-service`: `3037`
- `contabil-service`: `3038`

Healthchecks should match the services that exist today:

- `department-service`: `GET http://127.0.0.1:3036/health`
- `fiscal-service`: `GET http://127.0.0.1:3037/health`
- `contabil-service`: `GET http://127.0.0.1:3038/health`

The gateway service should add all three to `depends_on` with
`condition: service_healthy`. This ensures the gateway does not become ready
while required upstreams are absent or unhealthy.

## Env And Secrets Design

The root already has example files:

- `.env.vps.department-service.example`
- `.env.vps.fiscal-service.example`
- `.env.vps.contabil-service.example`

The implementation should create real root env files:

- `.env.vps.department-service`
- `.env.vps.fiscal-service`
- `.env.vps.contabil-service`

They should be based on the corresponding examples and keep the same variable
set. Values that differ by environment must be supplied through the GitHub
Environment secret for that file, matching the existing VPS env materialization
pattern.

`scripts/ci/vps-secrets.manifest` should add:

- `ENV_VPS_DEPARTMENT_SERVICE|.env.vps.department-service`
- `ENV_VPS_FISCAL_SERVICE|.env.vps.fiscal-service`
- `ENV_VPS_CONTABIL_SERVICE|.env.vps.contabil-service`

This makes the deploy materialization step aware of the mandatory services.
The GitHub Environment setup documented in `docs/vps-deploy.md` must tell
operators to register these three secrets for every VPS environment where the
stable stack runs.

The gateway env already contains:

- `DEPARTMENT_SERVICE_URL=http://department-service:3036`
- `FISCAL_SERVICE_URL=http://fiscal-service:3037`
- `CONTABIL_SERVICE_URL=http://contabil-service:3038`

The implementation should preserve these values and avoid introducing alternate
hostnames.

## Incremental Deploy Detection

`scripts/ci/detect-changed-vps-services.sh` should map service path changes to
their compose service names:

- `services/department-service/*` -> `department-service`
- `services/fiscal-service/*` -> `fiscal-service`
- `services/contabil-service/*` -> `contabil-service`

This prevents changes in these packages from falling through to `ALL` or being
missed by service-specific deploy behavior. Existing global rebuild rules should
stay unchanged.

## Documentation Design

`docs/vps-deploy.md` should be updated so the stable deploy docs match the
actual stack:

- include the three `.env.vps.*` files in the file list
- include the three GitHub secrets in the secrets/environment guidance
- include examples for updating each service without touching the rest
- include healthcheck notes for the three services
- update `Current scope` to include:
  - `/department`
  - `/fiscal`
  - `/contabil`

The documentation should continue to state that legacy routes are out of scope
for this deployment.

## Runtime Flow

The expected runtime path is:

1. Browser or Next.js app calls the public gateway URL.
2. Gateway authenticates and authorizes as it does today.
3. Gateway matches `/department`, `/fiscal`, or `/contabil`.
4. Gateway proxies to the corresponding Docker service hostname on the backend
   network.
5. The upstream service handles the request using its existing route and service
   implementation.

No request should route to the legacy API for these prefixes in the stable VPS
stack.

## Error Handling

The primary failure mode this spec addresses is "gateway route exists, upstream
container absent". Making the three services mandatory should eliminate that
state in normal deployments.

If one of the services is unhealthy at startup, Docker Compose should keep the
gateway dependency from satisfying `service_healthy`. If a service becomes
unhealthy after startup, the gateway may still return an upstream error through
the existing proxy path; no new gateway fallback should be added.

Env materialization failures should remain visible during deploy rather than
being hidden by defaults in compose.

## Verification Plan

The implementation should be considered complete only after these checks are
available and pass in the relevant environment:

- `pnpm --filter @workspace/department-service run build`
- `pnpm --filter @workspace/fiscal-service run build`
- `pnpm --filter @workspace/contabil-service run build`
- `pnpm --filter @workspace/gateway run build`
- `docker compose -f docker-compose.vps.yml config`
- `node scripts/check-smoke-spec-coverage.mjs`
- smoke checks filtered to `department-service`, `fiscal-service`, and
  `contabil-service` when a local or VPS stack is available

The implementation should also include a lightweight check of
`scripts/ci/detect-changed-vps-services.sh` using test diffs or a controlled
local invocation if practical.

## Acceptance Criteria

- `docker-compose.vps.yml` starts all three services as mandatory services.
- `gateway.depends_on` includes all three services with health requirements.
- Real `.env.vps.*` files exist for all three services.
- `scripts/ci/vps-secrets.manifest` includes all three env files.
- `scripts/ci/detect-changed-vps-services.sh` maps changes in all three service
  directories to their compose service names.
- `docs/vps-deploy.md` accurately documents the expanded stable stack.
- The stable scope explicitly includes `/department`, `/fiscal`, and
  `/contabil`.
- No new domain migration is included in this work.

## Implementation Notes

This work should be done as a narrow deployment alignment change. The service
code for `department-service`, `fiscal-service`, and `contabil-service` should
not be refactored unless a build or deploy verification failure proves a small
service-local fix is necessary.

If implementation reveals that any example env file lacks a required production
variable, the implementation should update both the real env file and its
`.example` counterpart so future services remain reproducible.
