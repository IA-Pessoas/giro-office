# Optimized Local Development Startup Design

## Objective

Provide one `pnpm dev` command that starts the complete local application—web app, shared
package watcher, gateway, and every active microservice—without starting or depending on
Docker. The command must avoid freezing modest developer machines during startup and must not
leave orphaned processes or silently unhealthy services during continuous development.

Database credentials and other secrets remain local to each engineer's machine. The launcher
must never print secret values or create development credentials.

## Scope

The local runtime contains:

- `app` (Next.js web application);
- `shared` (TypeScript watch build);
- every service in `scripts/service-registry.mjs`, including `gateway`;
- Prisma client generation required by the registered services.

The following are explicitly outside the local startup scope:

- Docker, Docker Compose, Swarm, or any container lifecycle command;
- VPS deployment configuration;
- `services/src`, which is the legacy API outside `pnpm-workspace.yaml`;
- `infra` and `packages/api` as persistent servers, because they do not expose development
  server scripts.

## Chosen Approach

Use a purpose-built Node.js supervisor. Turbo remains available for build, typecheck, test, and
other repository tasks, but it will not orchestrate persistent local development processes.
Turbo concurrency limits slots held by persistent tasks and therefore cannot express the desired
startup-rate control.

The supervisor will start package binaries directly through Node rather than keeping one
`pnpm run` process and shell alive per package. It will resolve the installed package `bin`
entries for Next.js, TypeScript, and tsx and spawn them with `process.execPath`. This preserves
cross-platform execution while removing persistent package-manager wrappers.

Individual package development remains unchanged: running a service's normal `dev` script still
executes its `predev` Prisma preparation. The root supervisor prepares Prisma once and invokes the
underlying watchers directly, so no duplicated `dev:workspace` scripts are needed.

## Components

### `scripts/dev-workspace.config.mjs`

Defines local development targets and profiles without embedding process management:

- `shared`: TypeScript watcher and compilation-readiness strategy;
- domain services: derived from `serviceRegistry`, excluding `gateway`;
- `gateway`: starts after domain services are healthy;
- `app`: starts last on constrained profiles;
- profiles `low`, `normal`, and `fast`.

Profile defaults:

| Profile | Batch size | Batch delay | Intended host |
| --- | ---: | ---: | --- |
| `low` | 1 | 2500 ms | up to 4 logical CPUs or up to 12 GiB RAM |
| `normal` | 2 | 1500 ms | up to 8 logical CPUs or up to 24 GiB RAM |
| `fast` | 4 | 500 ms | larger machines |

If `DEV_PROFILE` is not set, the launcher selects a profile conservatively from
`os.availableParallelism()` and `os.totalmem()`. Explicit `DEV_START_BATCH_SIZE` and
`DEV_START_DELAY_MS` override the selected profile. Invalid values fail with a clear message;
they do not silently fall back.

### `scripts/dev-process-manager.mjs`

Owns cross-platform child lifecycle behavior:

- spawn direct Node package binaries without `shell: true`;
- create a distinct process group for each target on POSIX;
- handle child `error`, unexpected `exit`, `SIGINT`, `SIGTERM`, and parent disconnect;
- terminate the complete POSIX process group with `SIGTERM`, followed by `SIGKILL` after the
  grace period;
- terminate the complete Windows tree with `taskkill /PID <pid> /T`, followed by `/F` after the
  grace period;
- await child termination before the supervisor exits;
- make shutdown idempotent and preserve a meaningful non-zero exit code for failures.

No port cleanup command may kill arbitrary listeners. Occupied ports are reported as preflight
errors instead.

### `scripts/dev-readiness.mjs`

Provides bounded readiness and continuous health monitoring:

- poll HTTP `/health` for services and gateway;
- poll TCP readiness for the Next.js app;
- recognize successful initial TypeScript watch compilation for `shared`;
- apply per-target startup timeouts with the target name in errors;
- capture and prefix stdout/stderr by target without buffering unbounded output;
- after initial readiness, tolerate short watcher restarts but fail the workspace after five
  consecutive health failures at two-second intervals;
- stop monitoring during intentional shutdown.

The supervisor must never print “ready” based solely on a watcher process remaining alive.

### `scripts/dev-preflight.mjs`

Performs safe checks before spawning persistent processes:

- required package directories and package binaries exist;
- the service registry contains exactly the active service workspace entries;
- configured ports are available;
- local env files are discoverable;
- profile settings are valid;
- available memory is reported, with a warning below 12 GiB and a stronger warning below 8 GiB.

Service code remains the source of truth for service-specific environment validation. Startup
stderr and readiness failures must surface those validation errors clearly, avoiding a duplicate
environment schema in the launcher.

### `scripts/prisma-generate.mjs`

Retain hash/stamp-based generation and direct pnpm/Corepack execution, with these changes:

- only reuse `npm_execpath` when it identifies pnpm;
- otherwise use `corepack pnpm`;
- store lock metadata containing PID and acquisition time;
- recover a lock whose owner no longer exists or whose age exceeds the bounded stale threshold;
- never expose environment values in logs;
- keep individual service `predev`, `prebuild`, and `typecheck` behavior intact.

## Startup Flow

1. Root `pnpm dev` runs the Prisma preparation and the supervisor. Docker is never invoked.
2. Preflight validates targets, binaries, profile configuration, and ports.
3. `shared` starts and must finish its first compilation successfully.
4. Domain services start in profile-sized batches.
5. Each batch must become healthy before the next batch starts.
6. Gateway starts after every domain service is healthy.
7. The web app starts after the gateway is healthy.
8. A summary reports selected profile, startup duration, and healthy target count.
9. Continuous health monitoring begins.

If a target fails, times out, or becomes persistently unhealthy, the supervisor reports the
specific target, shuts down every process tree, and exits non-zero.

## Shared-Code Restart Behavior

The implementation must first verify whether rebuilding `shared` causes all service watchers to
restart simultaneously. If it does, the service watchers will ignore `shared/dist` changes and
the supervisor will perform rolling service restarts in the selected profile's batches after a
successful shared compilation. If no restart storm is reproducible, no extra rolling-restart
mechanism will be added.

This evidence gate avoids adding a second restart system without a demonstrated need.

## Package and Root Script Changes

- `pnpm dev` becomes Prisma preparation followed by the supervisor.
- `dev:full` is removed because it duplicates `dev`.
- package-level `dev` and Prisma lifecycle scripts remain unchanged.
- duplicated `dev:workspace` scripts are removed.
- unused `dev:workspace` configuration is removed from `turbo.json`.
- the launcher uses `serviceRegistry`; adding a registered service automatically includes it in
  local development, while preflight rejects missing package metadata or health configuration.

## Logging and Secret Safety

- Prefix every child output line with its target name.
- Log state transitions: queued, starting, healthy, unhealthy, stopping, stopped.
- Do not log full child environments, database URLs, tokens, or encryption keys.
- On failure, retain a short bounded tail of target output for diagnosis.

## Testing Strategy

Tests use Node's built-in test runner and temporary fixture processes. They do not start Docker or
connect to the real database.

Required automated coverage:

- profile selection and explicit overrides;
- registry/workspace parity and launch ordering;
- direct package binary resolution without a global pnpm;
- npm `npm_execpath` is not mistaken for pnpm;
- Prisma fresh lock, contended lock, and abandoned lock recovery;
- readiness success, timeout, and watcher-alive/server-dead behavior;
- POSIX process-group termination and no surviving descendants;
- Windows `taskkill` argument construction through injected process operations;
- unexpected child spawn/exit causes full shutdown and non-zero exit;
- signal handling is idempotent;
- no Docker executable or Docker script is invoked;
- root and package script invariants.

The real validation run must start the complete local stack with valid local environment values,
confirm all 17 network targets are reachable, exercise Ctrl+C and targeted supervisor termination,
and confirm no descendants remain.

## Performance Acceptance

On the current validation host with warm Prisma state:

- all 17 network targets must become reachable;
- default startup must not exceed the measured batch-2 memory ramp;
- startup RSS at 10 seconds should remain at or below 2.0 GiB under comparable conditions;
- peak RSS should not regress above 5.7 GiB under comparable conditions;
- persistent process count must be lower than the current 74-process implementation;
- no process tree may survive supervisor shutdown.

These measurements are reference bounds, not universal hardware guarantees. After the engineer's
machine specifications are known, profile thresholds can be tuned without changing the process
supervision architecture.

## Delivery

Implementation is developed on `codex/optimize-local-dev-startup`. After automated and real-stack
verification, changes will be committed, pushed, and opened as a draft pull request for personal
machine testing.
