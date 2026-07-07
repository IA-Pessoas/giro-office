# Workflow Runtime Optimization Design

## Context

The current CI/CD flow keeps the quality stage acceptable, but the post-quality stages are costly:

- `build-and-push` uses `docker compose build` on GitHub-hosted runners, so Docker layer cache is mostly lost between runs.
- The Dockerfiles install dependencies and build workspaces inside each selected image build.
- Broad invalidation rules, especially `shared/*`, `package.json`, `pnpm-lock.yaml`, Compose files, and workflow files, often force `ALL`.
- VPS deploy always runs a full `compose up -d --wait --wait-timeout 900 --no-build` unless the script exits early.
- Some fixed costs, such as `sshpass` installation and runner disk cleanup, run even when they are not always needed.

The goal is to combine conservative quick wins with persistent Docker cache and safer deploy selectivity.

## Goals

- Reduce elapsed time after `quality` for common changes affecting one or a few services.
- Avoid real deploy work when the detected image scope is `NONE`.
- Add persistent Docker build cache for selected service builds.
- Preserve the existing rollback behavior on VPS deploy failures.
- Keep the current workflow structure recognizable: `quality -> build-and-push -> vps-deploy`.
- Keep `ALL` available for broad changes and explicit full deploys.

## Non-Goals

- Replace the whole CI/CD architecture.
- Remove the existing VPS rollback mechanism.
- Build a complete dependency graph for all workspace packages in the first iteration.
- Change the quality gate.
- Change production release semantics in `main-cicd.yml` beyond applying the same low-risk optimizations where appropriate.

## Proposed Approach

Use a phased design that combines options A and B:

1. Remove avoidable fixed costs.
2. Add timing and scope visibility.
3. Replace uncached Compose image builds with Buildx builds using persistent cache.
4. Improve VPS deploy selectivity while preserving rollback.
5. Refine invalidation rules after measurement confirms the main bottlenecks.

## Workflow Architecture

The existing workflow shape remains:

```text
quality -> build-and-push -> vps-deploy
```

`quality` remains the gate. `build-and-push` continues to use the output of `scripts/ci/detect-changed-vps-services.sh`, but the actual image build path changes from plain `docker compose build` to a Buildx-backed build path with cache.

`vps-deploy` receives the same service scope:

- `NONE`: copy only what is needed for bookkeeping, then skip registry pull and `compose up`.
- `ALL`: preserve the current full-stack behavior.
- service list: pull and retag only selected images, then recreate selected services with `compose up -d --wait --no-build <services>`.

## Build And Push Design

The build stage should use per-service Buildx cache. A service-specific cache key avoids one large shared cache and reduces cache churn.

Example cache references:

```text
{registry}/cache/workspace-gateway:buildcache
{registry}/cache/workspace-user-service:buildcache
{registry}/cache/workspace-web:buildcache
```

For each selected service:

1. Resolve local Compose service name to Dockerfile, build args, and image name.
2. Build with `cache-from` pointing at that service cache.
3. Export cache with `cache-to` in `mode=max` or a conservative equivalent.
4. Push the final image as `{registry}/{service}:{github.sha}`.

If the scope is `NONE`, skip Docker setup, disk cleanup, build, and push.

If the scope is `ALL`, build all workspace images using the same cached path.

## VPS Deploy Design

The deploy script keeps the rollback model already present in `scripts/ci/vps-remote-deploy.sh`:

1. Record current local image IDs in `.deploy/image-ids-before-<tag>.txt`.
2. Pull and retag new images.
3. Run `compose up`.
4. If `compose up` fails, retag old image IDs and attempt to bring the previous version back up.

This rollback behavior must remain intact for full and selective deploys.

Selective deploy behavior:

- `NONE`: do not pull images and do not run `compose up --wait`.
- `ALL`: use existing full-stack path.
- service list: pull selected images and run `compose up -d --wait --wait-timeout <timeout> --no-build <services>`.

The first implementation should keep dependency expansion simple and explicit. For example:

- backend service change: recreate that backend service only.
- `gateway` change: recreate `gateway`.
- `web` change: recreate `web`.
- Compose, env contract, Dockerfile, lockfile, or broad dependency changes: use `ALL`.

If a required image is missing locally, the existing safety behavior may pull the missing required image. This is operational safety, not a silent fallback to full scope.

## Fallback And Rollback Policy

Rollback and fallback are distinct:

- Rollback is preserved and runs when deploy of the selected scope fails after images have changed.
- Silent fallback from selective deploy to `ALL` should not happen automatically.
- Full deploy should happen only when the detector emits `ALL` or an explicit workflow input/environment flag requests it.

This keeps failures visible and prevents the pipeline from silently returning to high-cost behavior.

## Fixed-Cost Reductions

Low-risk changes to apply before or with cache:

- Install `sshpass` only when `VPS_SSH_PASSWORD` is set and `VPS_SSH_PRIVATE_KEY` is empty.
- Skip Docker disk cleanup when scope is `NONE`.
- Run aggressive disk cleanup by default for `ALL`; make it conditional or lighter for small selective builds.
- Avoid Docker Buildx setup when scope is `NONE`.
- Add timing logs around build, push, remote pull, and remote `compose up`.

## Measurement

Add lightweight timing output to compare before and after:

- `build-and-push` total duration.
- service scope emitted by the detector.
- Docker build duration per selected service.
- Docker push duration per selected service.
- VPS pull/tag duration.
- VPS `compose up --wait` duration.

The workflow does not need a metrics backend for the first iteration. GitHub Actions logs are enough.

## Testing Strategy

Tests should cover behavior without requiring a real production deploy:

- Unit-style shell tests or scripted checks for `detect-changed-vps-services.sh`:
  - docs-only change emits `NONE`.
  - single service change emits that service.
  - app change emits `web`.
  - Compose/Dockerfile/lockfile changes emit `ALL`.
  - `shared/*` remains `ALL` initially unless a safe narrower mapping is added.
- Dry-run support or log-only validation for build service selection.
- Dry-run support or command planning validation for deploy service selection.
- Branch test deploy scenarios:
  - `NONE` skips build/push/deploy work.
  - one backend service rebuilds and redeploys only that service.
  - `ALL` preserves current full behavior.
  - forced failure during `compose up` still attempts rollback to old image IDs.

## Rollout Plan

1. Add timing and skip behavior for `NONE`.
2. Make `sshpass` and disk cleanup conditional.
3. Introduce cached Buildx build path for one non-critical test workflow.
4. Extend cached build path to develop/staging test deploy workflows.
5. Add selective VPS deploy for service-list scopes.
6. Apply to develop/staging workflows after test deploy validation.
7. Consider main workflow optimizations separately, preserving production immutability.

## Success Criteria

- A docs-only or tooling-only change does not run Docker build/push or VPS `compose up`.
- A one-service change avoids building and pushing unrelated workspace images.
- A one-service change avoids waiting for the whole stack when a selective deploy is safe.
- `ALL` still works for broad changes.
- Rollback to previous local image IDs remains available after failed deploy.
- GitHub Actions logs clearly show scope, timings, and whether a full or selective path ran.

## Risks And Mitigations

- Risk: Buildx cache configuration becomes brittle across services.
  Mitigation: start with one test workflow and one or two representative services before broad rollout.

- Risk: Selective deploy misses a dependent service.
  Mitigation: keep initial dependency expansion conservative; use `ALL` for uncertain dependency changes.

- Risk: `NONE` skips too much.
  Mitigation: keep env/checkout validation minimal but present, and test docs/tooling-only scenarios.

- Risk: cache grows too large in registry.
  Mitigation: use per-service cache refs and define a cleanup policy after observing cache size.

- Risk: main/production immutability is weakened.
  Mitigation: apply production changes only where they do not rebuild promoted artifacts or alter release semantics.
