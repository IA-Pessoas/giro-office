import { readFile } from "node:fs/promises";
import { availableParallelism, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPreflight } from "./dev-preflight.mjs";
import { createProcessManager } from "./dev-process-manager.mjs";
import { createHealthMonitor, waitForHttpHealth, waitForTcp } from "./dev-readiness.mjs";
import { createDevTargets, selectDevProfile } from "./dev-workspace.config.mjs";
import { serviceRegistry } from "./service-registry.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = dirname(dirname(scriptPath));
const defaultSleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export async function restartTargetsInBatches({
  targets,
  profile,
  restartTarget,
  sleep = defaultSleep,
}) {
  for (let index = 0; index < targets.length; index += profile.batchSize) {
    const batch = targets.slice(index, index + profile.batchSize);
    await Promise.all(batch.map(restartTarget));
    if (index + profile.batchSize < targets.length) await sleep(profile.batchDelayMs);
  }
}

export function createSharedRebuildWatcher(handle, { onSuccessfulRebuild }) {
  let compiling = false;
  return handle.onOutput((line) => {
    if (/File change detected\. Starting incremental compilation/.test(line)) {
      compiling = true;
      return;
    }
    if (compiling && /Found [1-9]\d* errors?\. Watching for file changes\./.test(line)) {
      compiling = false;
      return;
    }
    if (compiling && /Found 0 errors?\. Watching for file changes\./.test(line)) {
      compiling = false;
      onSuccessfulRebuild();
    }
  });
}

function waitForNetworkReadiness(target, handle, waitForReady, readinessOptions) {
  return Promise.race([
    waitForReady(target, readinessOptions),
    handle.exitPromise.then(({ code, signal, error }) => {
      throw new Error(
        `${target.name} exited before readiness (code ${code ?? "none"}, signal ${signal ?? "none"}).`,
        { cause: error },
      );
    }),
  ]);
}

async function waitForTarget(target, handle, options) {
  if (target.readiness.type === "output") {
    return handle.waitForOutput({
      successPattern: target.readiness.successPattern,
      failurePattern: target.readiness.failurePattern,
      timeoutMs: options.readinessTimeoutMs,
    });
  }
  if (target.readiness.type === "http") {
    return waitForNetworkReadiness(
      target,
      handle,
      options.waitForHttpHealthImpl,
      options.readinessOptions,
    );
  }
  if (target.readiness.type === "tcp") {
    return waitForNetworkReadiness(
      target,
      handle,
      options.waitForTcpImpl,
      options.readinessOptions,
    );
  }
  throw new Error(`${target.name} has an unsupported readiness type.`);
}

export async function runWorkspaceDev(options = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const env = options.env ?? process.env;
  const registry = options.registry ?? serviceRegistry;
  const cpuCount = options.cpuCount ?? availableParallelism();
  const totalMemoryBytes = options.totalMemoryBytes ?? totalmem();
  const profile = options.profile ?? selectDevProfile({ env, cpuCount, totalMemoryBytes });
  const targets =
    options.targets ?? createDevTargets({ rootDir, registry, resolveBin: options.resolveBin });
  const dryRun = options.dryRun ?? false;

  if (dryRun) return { profile, targets };

  const logger = options.logger ?? console;
  const workspaceText =
    options.workspaceText ?? (await readFile(join(rootDir, "pnpm-workspace.yaml"), "utf8"));
  const runPreflightImpl = options.runPreflightImpl ?? runPreflight;
  const manager = options.manager ?? createProcessManager();
  const waitForHttpHealthImpl = options.waitForHttpHealthImpl ?? waitForHttpHealth;
  const waitForTcpImpl = options.waitForTcpImpl ?? waitForTcp;
  const createHealthMonitorImpl = options.createHealthMonitorImpl ?? createHealthMonitor;
  const sleep = options.sleep ?? defaultSleep;
  const signalSource = options.signalSource ?? process;
  const readinessTimeoutMs = options.readinessTimeoutMs ?? 60_000;
  const readinessOptions = {
    timeoutMs: readinessTimeoutMs,
    intervalMs: options.readinessIntervalMs ?? 250,
  };
  const startedAt = Date.now();
  const handles = new Map();
  let monitor;
  let stopSharedRebuildWatcher = () => {};
  let rollingRestartQueue = Promise.resolve();
  let healthFailureHandled = false;

  const stopFromSignal = () => {
    logger.log("[dev] stopping all local development processes...");
    monitor?.stop();
    void manager.stopAll(0);
  };
  for (const signal of ["SIGINT", "SIGTERM", "disconnect"]) {
    signalSource.on(signal, stopFromSignal);
  }

  const cleanupListeners = () => {
    for (const signal of ["SIGINT", "SIGTERM", "disconnect"]) {
      signalSource.off(signal, stopFromSignal);
    }
  };

  const startTarget = (target) => {
    logger.log(`[dev] starting ${target.name}`);
    const handle = manager.start({ ...target, env });
    handles.set(target.name, handle);
    return handle;
  };

  const waitUntilReady = async (target, handle) => {
    await waitForTarget(target, handle, {
      readinessTimeoutMs,
      readinessOptions,
      waitForHttpHealthImpl,
      waitForTcpImpl,
    });
    logger.log(`[dev] healthy ${target.name}`);
  };

  try {
    const preflight = await runPreflightImpl({
      rootDir,
      workspaceText,
      registry,
      targets,
      totalMemoryBytes,
    });
    for (const warning of preflight.warnings) logger.warn(`[dev] warning: ${warning}`);
    logger.log(
      `[dev] profile=${profile.name} batchSize=${profile.batchSize} delayMs=${profile.batchDelayMs}`,
    );

    const shared = targets.find((target) => target.kind === "shared");
    const domainServices = targets.filter((target) => target.kind === "service");
    const gateway = targets.find((target) => target.kind === "gateway");
    const app = targets.find((target) => target.kind === "app");
    if (!shared || !gateway || !app) throw new Error("Development target stages are incomplete.");

    await waitUntilReady(shared, startTarget(shared));
    for (let index = 0; index < domainServices.length; index += profile.batchSize) {
      const batch = domainServices.slice(index, index + profile.batchSize);
      const batchHandles = batch.map((target) => startTarget(target));
      await Promise.all(
        batch.map((target, batchIndex) => waitUntilReady(target, batchHandles[batchIndex])),
      );
      if (index + profile.batchSize < domainServices.length) await sleep(profile.batchDelayMs);
    }
    await waitUntilReady(gateway, startTarget(gateway));
    await waitUntilReady(app, startTarget(app));

    monitor = createHealthMonitorImpl(targets, {
      intervalMs: 2000,
      failureThreshold: 5,
      onFailure(target, error) {
        if (healthFailureHandled) return;
        healthFailureHandled = true;
        logger.error(`[dev] ${target.name} became unhealthy: ${error.message}`);
        void manager.stopAll(1);
      },
    });
    monitor.start();
    stopSharedRebuildWatcher = createSharedRebuildWatcher(handles.get(shared.name), {
      onSuccessfulRebuild() {
        rollingRestartQueue = rollingRestartQueue
          .then(async () => {
            logger.log("[dev] shared rebuilt; restarting services in controlled batches...");
            monitor.stop();
            await restartTargetsInBatches({
              targets: [...domainServices, gateway],
              profile,
              sleep,
              restartTarget: async (target) => {
                logger.log(`[dev] restarting ${target.name}`);
                const handle = await manager.restart({ ...target, env });
                handles.set(target.name, handle);
                await waitUntilReady(target, handle);
              },
            });
            healthFailureHandled = false;
            monitor.start();
            logger.log("[dev] rolling service restart complete.");
          })
          .catch((error) => {
            logger.error(`[dev] rolling restart failed: ${error.message}`);
            void manager.stopAll(1);
          });
      },
    });
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    logger.log(
      `[dev] ready: ${targets.length}/${targets.length} targets healthy in ${elapsedSeconds}s; press Ctrl+C to stop.`,
    );

    return await manager.waitForShutdown();
  } catch (error) {
    monitor?.stop();
    logger.error(`[dev] startup failed: ${error.message}`);
    await manager.stopAll(1);
    return 1;
  } finally {
    stopSharedRebuildWatcher();
    monitor?.stop();
    cleanupListeners();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const dryRun = process.argv.includes("--dry-run");
  const result = await runWorkspaceDev({ dryRun });
  if (dryRun) {
    console.log(
      `[dev] profile=${result.profile.name} targets=${result.targets.length} batchSize=${result.profile.batchSize} delayMs=${result.profile.batchDelayMs}`,
    );
    for (const target of result.targets) {
      console.log(`[dev] ${target.name}: ${target.command} ${target.args.join(" ")}`);
    }
  } else {
    process.exitCode = result;
  }
}
