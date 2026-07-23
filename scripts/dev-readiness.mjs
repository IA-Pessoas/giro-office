import { connect } from "node:net";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function timeoutError(target) {
  return new Error(`${target.name} readiness timeout.`);
}

async function retryUntilReady(target, options, probe) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      await probe(target, options);
      return;
    } catch (error) {
      lastError = error;
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }

  const error = timeoutError(target);
  if (lastError) error.cause = lastError;
  throw error;
}

export async function probeHttpHealth(target, { requestTimeoutMs = 1000, fetchImpl = fetch } = {}) {
  const url = target.healthUrl ?? target.readiness?.url;
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: { accept: "application/json" },
  });
  await response.body?.cancel();
  if (!response.ok) {
    throw new Error(`${target.name} health check returned HTTP ${response.status}.`);
  }
}

export function probeTcp(target, { connectionTimeoutMs = 1000 } = {}) {
  const host = target.readiness?.host ?? target.host ?? "127.0.0.1";
  const port = target.readiness?.port ?? target.port;

  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${target.name} TCP probe timed out.`));
    }, connectionTimeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    });
  });
}

export function waitForHttpHealth(target, options = {}) {
  return retryUntilReady(target, options, (currentTarget) =>
    probeHttpHealth(currentTarget, options),
  );
}

export function waitForTcp(target, options = {}) {
  return retryUntilReady(target, options, (currentTarget) => probeTcp(currentTarget, options));
}

export function probeReadiness(target, options = {}) {
  if (target.readiness?.type === "http") return probeHttpHealth(target, options);
  if (target.readiness?.type === "tcp") return probeTcp(target, options);
  return Promise.resolve();
}

export function createHealthMonitor(targets, options = {}) {
  const intervalMs = options.intervalMs ?? 2000;
  const failureThreshold = options.failureThreshold ?? 5;
  const probe = options.probe ?? probeReadiness;
  const onFailure = options.onFailure ?? (() => {});
  const monitoredTargets = targets.filter((target) =>
    ["http", "tcp"].includes(target.readiness?.type),
  );
  const failures = new Map(monitoredTargets.map((target) => [target.name, 0]));
  const reported = new Set();
  let timer;
  let stopped = true;

  async function checkAll() {
    if (stopped) return;

    await Promise.all(
      monitoredTargets.map(async (target) => {
        try {
          await probe(target, options);
          failures.set(target.name, 0);
          reported.delete(target.name);
        } catch (cause) {
          const count = (failures.get(target.name) ?? 0) + 1;
          failures.set(target.name, count);
          if (count >= failureThreshold && !reported.has(target.name)) {
            reported.add(target.name);
            const error = new Error(`${target.name} failed ${count} consecutive health checks.`, {
              cause,
            });
            onFailure(target, error);
          }
        }
      }),
    );

    if (!stopped) timer = setTimeout(checkAll, intervalMs);
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      void checkAll();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
