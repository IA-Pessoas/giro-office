import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export function buildWindowsTaskkillArgs(pid, force) {
  return ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])];
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

export function createProcessManager(options = {}) {
  const platform = options.platform ?? process.platform;
  const spawnImpl = options.spawnImpl ?? spawn;
  const killImpl = options.killImpl ?? process.kill.bind(process);
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const gracePeriodMs = options.gracePeriodMs ?? 3000;
  const handles = new Map();
  const shutdown = createDeferred();
  let shutdownPromise;

  const delay = (milliseconds) =>
    new Promise((resolve) => {
      setTimeoutImpl(resolve, milliseconds);
    });

  function writeLine(destination, name, line) {
    destination.write(`[${name}] ${line}\n`);
  }

  function bindOutput(handle, source, destination) {
    if (!source) return;
    let pending = "";
    source.setEncoding?.("utf8");
    source.on("data", (chunk) => {
      pending += String(chunk);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        handle.tail.push(line);
        if (handle.tail.length > 50) handle.tail.shift();
        handle.events.emit("output", line);
        writeLine(destination, handle.name, line);
      }
    });
    source.on("end", () => {
      if (pending.length === 0) return;
      handle.tail.push(pending);
      if (handle.tail.length > 50) handle.tail.shift();
      handle.events.emit("output", pending);
      writeLine(destination, handle.name, pending);
    });
  }

  function isProcessGroupAlive(pid) {
    try {
      killImpl(-pid, 0);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      throw error;
    }
  }

  function signalProcessGroup(pid, signal) {
    try {
      killImpl(-pid, signal);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      throw error;
    }
  }

  async function waitForGroupExit(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isProcessGroupAlive(pid)) return true;
      await delay(20);
    }
    return !isProcessGroupAlive(pid);
  }

  function runTaskkill(pid, force) {
    return new Promise((resolve) => {
      const killer = spawnImpl("taskkill", buildWindowsTaskkillArgs(pid, force), {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("error", () => resolve(false));
      killer.once("exit", (code) => resolve(code === 0));
    });
  }

  async function stopHandle(handle) {
    if (handle.stopped || handle.pid === undefined) return;
    handle.stopping = true;

    if (platform === "win32") {
      const stopped = await runTaskkill(handle.pid, false);
      if (!stopped) await runTaskkill(handle.pid, true);
      await Promise.race([handle.exitPromise, delay(gracePeriodMs)]);
    } else {
      signalProcessGroup(handle.pid, "SIGTERM");
      if (!(await waitForGroupExit(handle.pid, gracePeriodMs))) {
        signalProcessGroup(handle.pid, "SIGKILL");
        await waitForGroupExit(handle.pid, gracePeriodMs);
      }
      await Promise.race([handle.exitPromise, delay(gracePeriodMs)]);
    }

    handle.stopped = true;
  }

  function stopAll(exitCode = 0) {
    if (shutdownPromise) return shutdownPromise;
    for (const handle of handles.values()) handle.stopping = true;
    shutdownPromise = Promise.all([...handles.values()].map(stopHandle)).then(() => {
      shutdown.resolve(exitCode);
      return exitCode;
    });
    return shutdownPromise;
  }

  function start(target) {
    if (shutdownPromise) throw new Error("Cannot start a process after shutdown has begun.");
    const existing = handles.get(target.name);
    if (existing && !existing.stopped)
      throw new Error(`Process ${target.name} is already running.`);
    if (existing?.stopped) handles.delete(target.name);

    const child = spawnImpl(target.command, target.args ?? [], {
      cwd: target.packageDir ?? target.cwd,
      env: target.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: platform !== "win32",
      windowsHide: true,
    });
    const exited = createDeferred();
    const handle = {
      name: target.name,
      pid: child.pid,
      child,
      events: new EventEmitter(),
      tail: [],
      stopping: false,
      stopped: false,
      exitPromise: exited.promise,
      onOutput(listener) {
        handle.events.on("output", listener);
        return () => handle.events.off("output", listener);
      },
      waitForOutput({ successPattern, failurePattern, timeoutMs = 60_000 }) {
        return new Promise((resolve, reject) => {
          let timer;
          const cleanup = () => {
            handle.events.off("output", onOutput);
            handle.events.off("exit", onExit);
            clearTimeout(timer);
          };
          const onOutput = (line) => {
            if (failurePattern?.test(line)) {
              cleanup();
              reject(new Error(`${handle.name} readiness failed: ${line}`));
            } else if (successPattern.test(line)) {
              cleanup();
              resolve(line);
            }
          };
          const onExit = ({ code, signal }) => {
            cleanup();
            reject(
              new Error(
                `${handle.name} exited before readiness (code ${code ?? "none"}, signal ${signal ?? "none"}).`,
              ),
            );
          };

          for (const line of handle.tail) {
            if (failurePattern?.test(line))
              return reject(new Error(`${handle.name} readiness failed: ${line}`));
            if (successPattern.test(line)) return resolve(line);
          }

          handle.events.on("output", onOutput);
          handle.events.once("exit", onExit);
          timer = setTimeoutImpl(() => {
            cleanup();
            reject(new Error(`${handle.name} output readiness timeout.`));
          }, timeoutMs);
        });
      },
    };
    handles.set(target.name, handle);
    bindOutput(handle, child.stdout, stdout);
    bindOutput(handle, child.stderr, stderr);

    child.once("error", (error) => {
      writeLine(stderr, target.name, `failed to start: ${error.message}`);
      exited.resolve({ code: 1, signal: null, error });
      handle.events.emit("exit", { code: 1, signal: null, error });
      if (!handle.stopping) void stopAll(1);
    });
    child.once("exit", (code, signal) => {
      exited.resolve({ code, signal });
      handle.events.emit("exit", { code, signal });
      if (!handle.stopping) {
        writeLine(
          stderr,
          target.name,
          `exited unexpectedly (code ${code ?? "none"}, signal ${signal ?? "none"})`,
        );
        void stopAll(1);
      }
    });

    return handle;
  }

  return {
    start,
    stopTarget(name) {
      const handle = handles.get(name);
      return handle ? stopHandle(handle) : Promise.resolve();
    },
    async restart(target) {
      const handle = handles.get(target.name);
      if (handle) await stopHandle(handle);
      handles.delete(target.name);
      return start(target);
    },
    stopAll,
    waitForShutdown() {
      return shutdown.promise;
    },
    get(name) {
      return handles.get(name);
    },
  };
}
