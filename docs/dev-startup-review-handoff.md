# Handoff: Optimized Full-Stack `pnpm dev`

## Outcome

The branch `codex/optimize-local-dev-startup` now provides one local command that starts the
complete UI-and-services stack without invoking Docker:

```bash
pnpm dev
```

The command prepares Prisma clients once, then starts `shared`, every active domain service,
`gateway`, and the Next.js app through a readiness-driven Node.js supervisor.

Local database credentials and service secrets remain on the engineer's machine. The supervisor
does not create, read aloud, or print secret values.

## Runtime Scope

The supervisor starts 18 process targets:

- one `shared` TypeScript watcher;
- all 15 domain services in `scripts/service-registry.mjs`;
- `gateway`;
- the Next.js app.

This results in 17 network targets: 16 HTTP services plus the web app. The legacy `services/src`
tree is intentionally excluded because it is not an active pnpm workspace. Docker, Compose,
Swarm, VPS configuration, `infra`, and `packages/api` are not persistent local runtime targets.

## Final Architecture

### Root command

`package.json` uses:

```bash
node scripts/prisma-generate.mjs && node scripts/dev-workspace.mjs
```

The old eager Turbo command and automatic `dev-reset` were removed from `pnpm dev`. `dev:reset`
remains available as an explicit maintenance command.

### Adaptive startup

`scripts/dev-workspace.config.mjs` selects a conservative profile from logical CPU and system
memory unless `DEV_PROFILE` is set:

| Profile | Batch size | Delay | Automatic host class |
| --- | ---: | ---: | --- |
| `low` | 1 | 2500 ms | up to 4 CPUs or up to 12 GiB RAM |
| `normal` | 2 | 1500 ms | up to 8 CPUs or up to 24 GiB RAM |
| `fast` | 4 | 500 ms | larger hosts |

`DEV_START_BATCH_SIZE` and `DEV_START_DELAY_MS` override the selected profile. Invalid values fail
early instead of silently falling back.

Startup order is dependency-aware:

1. `shared`, after its first successful compilation;
2. domain services in profile-sized batches, after each `/health` is ready;
3. `gateway`, after the domain services;
4. web app, after the gateway, using TCP readiness;
5. continuous health monitoring.

### Lower process overhead

The supervisor resolves package-local Next.js, TypeScript, and tsx binaries and starts them with
`process.execPath`. It does not retain one pnpm process and shell per package. The temporary
`dev:workspace` package scripts and Turbo task were removed.

### Lifecycle safety

`scripts/dev-process-manager.mjs` owns every child tree:

- POSIX targets run in separate process groups and receive group `SIGTERM`, then `SIGKILL` when
  required;
- Windows targets use `taskkill /PID <pid> /T`, with `/F` escalation;
- spawn errors, unexpected exits, `SIGINT`, and `SIGTERM` trigger idempotent full shutdown;
- child output is line-prefixed and limited to a 50-line diagnostic tail.

No cleanup command kills arbitrary port listeners. Occupied ports fail preflight with the target
name and port.

### Prisma preparation

`scripts/prisma-generate.mjs` retains hash/stamp caching and now:

- reuses `npm_execpath` only when it actually identifies pnpm;
- otherwise invokes `corepack pnpm` without `shell: true`;
- writes lock-owner PID and acquisition time;
- recovers malformed, expired, or dead-owner locks;
- remains fast on a warm cache.

### Shared rebuild control

Real-stack testing proved that a `shared/dist` update caused all 15 services and the gateway to
restart simultaneously. That recreated a large resource spike during normal development.

Service watchers now exclude `../../shared/dist/**`. After a successful incremental `shared`
compilation, the supervisor performs health-verified rolling restarts using the active profile's
batch size and delay. Continuous health monitoring pauses during the intentional restart and
resumes afterward.

## Real Validation Evidence

Validation used the `normal` profile and a temporary in-process value for the required pessoal
encryption key. No Docker command was run.

Observed final run:

- 18/18 process targets ready in 28.1 seconds with warm caches;
- ports 3010, 3020, and 3030–3043 returned HTTP 200 from `/health`;
- port 3000 accepted a TCP connection;
- a real `shared` source change triggered rolling batches of two targets;
- all restarted services returned healthy before the next batch;
- steady process tree: 37 processes and approximately 3.45 GiB RSS;
- `Ctrl+C` left no supervisor, watcher, server, or Next.js descendant alive.

Comparison with the reviewed implementation:

| Metric | Previous staggered launcher | Final supervisor |
| --- | ---: | ---: |
| Persistent process count | 74 | 37 |
| Approximate steady RSS | 4.9 GiB | 3.45 GiB |
| Full network readiness | watcher-based claim | health/TCP verified |
| Shared rebuild | 16 simultaneous restarts | profile-sized rolling batches |
| Shutdown | descendants could survive | no descendants survived |

An observed first-route Webpack compilation temporarily raised the final process tree to about
5.54 GiB RSS, with the Next.js server responsible for most of that transient usage. This remains
below the comparable 5.66 GiB batch-2 baseline, but the first UI route compilation is still a
separate frontend cost worth validating on the engineer's personal machine. This change does not
switch the repository away from its explicitly configured Webpack mode.

## Automated Verification

Run:

```bash
pnpm run dev:test
```

The suite currently covers 33 assertions across:

- adaptive profile selection and strict overrides;
- package-local binary resolution;
- workspace/registry parity and port preflight;
- HTTP, TCP, and continuous readiness;
- POSIX descendant termination and Windows taskkill arguments;
- spawn/readiness failure shutdown;
- Prisma warm cache and abandoned-lock recovery;
- dependency-ordered orchestration and Docker-free dry run;
- manifest invariants;
- successful shared-build detection and rolling restart batching.

Also verified:

```bash
pnpm run dev:prepare
pnpm run dev:prepare
pnpm run dev:test
node scripts/dev-workspace.mjs --dry-run
```

Both warm Prisma preparations exited successfully, the dry run listed 18 direct Node targets,
and Biome passed for the changed startup scripts and manifests.

## Reviewer Focus

Primary files:

```text
package.json
scripts/dev-workspace.mjs
scripts/dev-workspace.config.mjs
scripts/dev-preflight.mjs
scripts/dev-readiness.mjs
scripts/dev-process-manager.mjs
scripts/prisma-generate.mjs
scripts/dev-*.test.mjs
scripts/prisma-generate.test.mjs
```

Review in particular:

1. POSIX and Windows tree termination semantics.
2. Readiness timeouts and five-consecutive-failure health policy.
3. Shared watcher exclusion and rolling restart behavior.
4. Prisma stale-lock recovery under concurrent local invocations.
5. Profile thresholds on the engineer's personal machine.
