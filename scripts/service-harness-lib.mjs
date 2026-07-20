function normalizeServiceName(service) {
  const name = String(service ?? "").trim();
  if (!name) {
    throw new Error("--service is required.");
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
    throw new Error(`Invalid service name "${name}". Use lowercase kebab-case.`);
  }
  return name;
}

function normalizeRelativePath(value, fallback) {
  const path = String(value ?? fallback ?? "").trim();
  return path.replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function toUpperSnake(value) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function toPascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => {
      const normalized = part.toLowerCase();
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function normalizeAuthModes(value) {
  const modes = Array.isArray(value)
    ? value
    : String(value ?? "public,bearer")
        .split(",")
        .map((mode) => mode.trim())
        .filter(Boolean);

  return [...new Set(modes)];
}

export function deriveServiceHarnessConfig(options) {
  const name = normalizeServiceName(options.service);
  const packagePath = normalizeRelativePath(options.packagePath, `services/${name}`);
  const port = String(options.port ?? "").trim();
  const defaultUrl = String(options.defaultUrl ?? (port ? `http://localhost:${port}` : "")).trim();

  if (!defaultUrl) {
    throw new Error("--port or --default-url is required.");
  }

  const usesPrisma = options.usesPrisma === true || options.usesPrisma === "true";
  const internalTokenEnvKey = String(options.internalTokenEnvKey ?? "").trim() || null;
  const prismaOutputPath =
    String(options.prismaOutputPath ?? "").trim() ||
    (usesPrisma ? `${packagePath}/src/generated/prisma` : "");

  return {
    name,
    packagePath,
    defaultUrl,
    urlEnvKey: String(options.urlEnvKey ?? `${toUpperSnake(name)}_URL`).trim(),
    openapiSpecPath: normalizeRelativePath(
      options.openapiSpecPath,
      `${packagePath}/src/openapi/spec.ts`,
    ),
    authModes: normalizeAuthModes(options.authModes),
    internalTokenEnvKey,
    prismaOutputPath: prismaOutputPath ? normalizeRelativePath(prismaOutputPath) : null,
  };
}

export function mergeServiceRegistryEntry(existingEntries, nextEntry) {
  const nextName = normalizeServiceName(nextEntry.name);
  const merged = existingEntries.filter((entry) => entry.name !== nextName);
  const gateway = merged.find((entry) => entry.name === "gateway");
  const rest = merged
    .filter((entry) => entry.name !== "gateway")
    .concat(nextEntry)
    .sort((left, right) => left.name.localeCompare(right.name));

  return gateway ? [gateway, ...rest] : rest;
}

export function extractOpenApiOperationsFromSource(source) {
  const operations = [];
  let currentPath = null;

  for (const line of String(source).split(/\r?\n/)) {
    const pathMatch = line.match(/^\s*"([^"]+)":\s*{/);
    if (pathMatch?.[1].startsWith("/")) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^\s*"?(get|post|put|patch|delete)"?:\s*(?:\{|[A-Za-z_$])/i);
    if (methodMatch && currentPath) {
      operations.push({
        method: methodMatch[1].toUpperCase(),
        path: currentPath,
      });
    }
  }

  return operations;
}

function uniqueOperations(operations) {
  const seen = new Set();
  const result = [];

  for (const operation of operations) {
    const key = `${operation.method}|${operation.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(operation);
  }

  return result;
}

function actionNameForOperation(service, operation) {
  const pathParts = operation.path.replace(/[{}]/g, "").split("/").filter(Boolean).join("-");
  return toCamelCase(
    `${service}-${operation.method.toLowerCase()}${pathParts ? `-${pathParts}` : ""}`,
  );
}

export function buildGeneratedSmokeOperations(config, discoveredOperations) {
  const operations = [];
  const routePlaceholders = [];

  for (const operation of uniqueOperations(discoveredOperations)) {
    if (operation.method === "GET" && operation.path === "/health") {
      operations.push({
        service: config.name,
        method: "GET",
        path: "/health",
        action: "serviceHealth",
        target: "direct",
        auth: "public",
      });
      continue;
    }

    if (operation.method === "GET" && operation.path === "/ready") {
      operations.push({
        service: config.name,
        method: "GET",
        path: "/ready",
        action: "serviceReady",
        target: "direct",
        auth: "public",
      });
      continue;
    }

    routePlaceholders.push({
      service: config.name,
      method: operation.method,
      path: operation.path,
      target: "gateway",
      auth: config.authModes.includes("bearer") ? "bearer" : (config.authModes[0] ?? "public"),
      suggestedAction: actionNameForOperation(config.name, operation),
    });
  }

  return { operations, routePlaceholders };
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

export function formatGeneratedSmokeModule({ service, operations, routePlaceholders }) {
  return `// Generated by scripts/generate-service-harness.mjs.
// Commit the generated probes, then replace routePlaceholders with explicit
// fixture-backed smoke operations as each endpoint becomes testable.

export const service = ${JSON.stringify(service)};

export const operations = ${stableStringify(operations)};

export const routePlaceholders = ${stableStringify(routePlaceholders)};
`;
}

export function formatServiceRegistryModule(entries) {
  return `// Central service metadata for smoke, security audit, and codegen harnesses.
// Keep this file deterministic; use scripts/generate-service-harness.mjs for new services.

export const serviceRegistry = ${stableStringify(entries)};

export function getServiceRegistryEntry(serviceName, registry = serviceRegistry) {
  return registry.find((service) => service.name === serviceName) ?? null;
}

export function getServiceUrlEnvKeys(registry = serviceRegistry) {
  return Object.fromEntries(
    registry
      .filter((service) => service.urlEnvKey)
      .map((service) => [service.name, service.urlEnvKey]),
  );
}

export function getServiceUrlDefaults(registry = serviceRegistry) {
  return Object.fromEntries(
    registry
      .filter((service) => service.defaultUrl)
      .map((service) => [service.name, service.defaultUrl]),
  );
}

export function getInternalServiceTokenEnvKeys(registry = serviceRegistry) {
  return Object.fromEntries(
    registry
      .filter((service) => service.internalTokenEnvKey)
      .map((service) => [service.name, service.internalTokenEnvKey]),
  );
}

export function getSmokeSpecFiles(registry = serviceRegistry) {
  return Object.fromEntries(
    registry
      .filter((service) => service.openapiSpecPath)
      .map((service) => [service.name, service.openapiSpecPath]),
  );
}

export function getPrismaOutputPaths(registry = serviceRegistry) {
  return registry
    .map((service) => service.prismaOutputPath)
    .filter((outputPath) => typeof outputPath === "string" && outputPath.length > 0);
}
`;
}
