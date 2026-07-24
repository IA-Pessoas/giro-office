import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { totalmem } from "node:os";

const GIB = 1024 ** 3;

function workspaceServicePaths(workspaceText) {
  return new Set(
    workspaceText
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*-\s*["']?(services\/[^"'#\s]+)["']?\s*$/)?.[1])
      .filter(Boolean),
  );
}

export function validateRegistryParity({ workspaceText, registry }) {
  const workspacePaths = workspaceServicePaths(workspaceText);
  const registryPaths = new Set(registry.map((service) => service.packagePath));
  const missingFromRegistry = [...workspacePaths].filter((path) => !registryPaths.has(path));
  const missingFromWorkspace = [...registryPaths].filter((path) => !workspacePaths.has(path));

  if (missingFromRegistry.length > 0 || missingFromWorkspace.length > 0) {
    const details = [
      missingFromRegistry.length > 0
        ? `not registered: ${missingFromRegistry.join(", ")}`
        : undefined,
      missingFromWorkspace.length > 0
        ? `not in pnpm-workspace.yaml: ${missingFromWorkspace.join(", ")}`
        : undefined,
    ].filter(Boolean);
    throw new Error(`Service registry and workspace differ (${details.join("; ")}).`);
  }
}

export function checkPortAvailable({ host = "127.0.0.1", port, timeoutMs = 500 }) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`Timed out checking port ${port}.`));
    }, timeoutMs);

    server.once("error", (error) => {
      clearTimeout(timer);
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen({ host, port, exclusive: true }, () => {
      clearTimeout(timer);
      server.close((error) => (error ? reject(error) : resolve(true)));
    });
  });
}

export async function runPreflight({
  workspaceText,
  registry,
  targets,
  totalMemoryBytes = totalmem(),
  accessImpl = access,
  checkPortAvailableImpl = checkPortAvailable,
}) {
  validateRegistryParity({ workspaceText, registry });

  const errors = [];
  const warnings = [];
  const seenPorts = new Set();

  for (const target of targets) {
    for (const path of [target.packageDir, target.command, target.args?.[0]].filter(Boolean)) {
      try {
        await accessImpl(path);
      } catch {
        errors.push(`${target.name}: required path is missing: ${path}`);
      }
    }

    if (target.port !== undefined) {
      if (seenPorts.has(target.port)) {
        errors.push(`${target.name}: port ${target.port} is configured more than once.`);
      }
      seenPorts.add(target.port);

      if (!(await checkPortAvailableImpl({ host: "127.0.0.1", port: target.port }))) {
        errors.push(`${target.name}: port ${target.port} is already in use.`);
      }
    }
  }

  if (totalMemoryBytes <= 12 * GIB) {
    warnings.push(
      `Available system memory is constrained (${(totalMemoryBytes / GIB).toFixed(1)} GiB); using the low startup profile is recommended.`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Development preflight failed:\n- ${errors.join("\n- ")}`);
  }

  return { warnings };
}
