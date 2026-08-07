import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(cmd) {
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    // Best-effort cleanup; ignore failures (e.g., process already exited)
  }
}

function resetWindowsPorts(ports) {
  for (const port of ports) {
    let output = "";
    try {
      output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
    } catch {
      output = "";
    }

    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.includes("LISTENING"));

    for (const line of lines) {
      const parts = line.split(/\s+/);
      const pid = parts.at(-1);
      if (pid && /^\d+$/.test(pid)) {
        run(`taskkill /PID ${pid} /F`);
      }
    }
  }
}

function resetUnixPorts(ports) {
  for (const port of ports) {
    let output = "";
    try {
      output = execSync(`lsof -ti :${port}`, { encoding: "utf8" });
    } catch {
      output = "";
    }

    const pids = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line));

    for (const pid of pids) {
      run(`kill -9 ${pid}`);
    }
  }
}

function removeNextDevLock() {
  const appDir = path.resolve(process.cwd(), "app");
  const lockFile = path.join(appDir, ".next", "dev", "lock");
  const devDir = path.join(appDir, ".next", "dev");

  try {
    if (fs.existsSync(lockFile)) fs.rmSync(lockFile, { force: true });
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(devDir)) fs.rmSync(devDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const ports = [3000, 3333, 3334];

if (process.platform === "win32") {
  resetWindowsPorts(ports);
} else {
  resetUnixPorts(ports);
}

removeNextDevLock();

console.log("Dev reset concluido: portas e lock limpos.");
