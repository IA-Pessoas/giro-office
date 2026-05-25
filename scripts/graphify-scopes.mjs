import { resolve } from "node:path";

export const GRAPHIFY_SCOPES = {
  ui: {
    name: "ui",
    label: "Frontend",
    path: "app",
    out: "app/graphify-out",
    graphPath: "app/graphify-out/graph.json",
    labelsPath: "app/graphify-out/.graphify_labels.json",
    analysisPath: "app/graphify-out/.graphify_analysis.json",
    briefPath: "app/graphify-out/AGENT_BRIEF.md",
    fileMapPath: "app/graphify-out/FILE_MAP.md",
    contextScript: "pnpm graphify:context:ui",
    extractScript: "pnpm graphify:ui",
    updateScript: "pnpm graphify:update:ui",
    validationCommands: [
      "pnpm --filter @workspace/app test",
      "pnpm --filter @workspace/app typecheck",
    ],
  },
  services: {
    name: "services",
    label: "Services",
    path: "services",
    out: "services/graphify-out",
    graphPath: "services/graphify-out/graph.json",
    labelsPath: "services/graphify-out/.graphify_labels.json",
    analysisPath: "services/graphify-out/.graphify_analysis.json",
    briefPath: "services/graphify-out/AGENT_BRIEF.md",
    fileMapPath: "services/graphify-out/FILE_MAP.md",
    contextScript: "pnpm graphify:context:services",
    extractScript: "pnpm graphify:services",
    updateScript: "pnpm graphify:update:services",
    validationCommands: [
      "pnpm --filter @workspace/<service> test",
      "pnpm --filter @workspace/<service> typecheck",
      "pnpm smoke:coverage quando OpenAPI/smoke mudar",
    ],
  },
};

const SCOPE_ALIASES = {
  app: "ui",
  frontend: "ui",
  ui: "ui",
  backend: "services",
  service: "services",
  services: "services",
};

export function normalizeGraphifyScopeName(scopeName) {
  return SCOPE_ALIASES[
    String(scopeName ?? "")
      .trim()
      .toLowerCase()
  ];
}

export function getGraphifyScope(scopeName) {
  const normalized = normalizeGraphifyScopeName(scopeName);
  const scope = normalized ? GRAPHIFY_SCOPES[normalized] : undefined;
  if (!scope) {
    throw new Error(`Escopo invalido: ${scopeName}. Use ui ou services.`);
  }
  return scope;
}

export function listGraphifyScopes() {
  return Object.values(GRAPHIFY_SCOPES);
}

export function resolveScopePath(scope, key, cwd = process.cwd()) {
  return resolve(cwd, scope[key]);
}

export function pathScopeName(filePath) {
  const normalized = String(filePath ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
  if (normalized === "app" || normalized.startsWith("app/")) {
    return "ui";
  }
  if (normalized === "services" || normalized.startsWith("services/")) {
    return "services";
  }
  return undefined;
}

export function displayGraphFilePath(scope, sourceFile) {
  const normalized = String(sourceFile ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
  if (!normalized) {
    return scope.path;
  }
  if (normalized === scope.path || normalized.startsWith(`${scope.path}/`)) {
    return normalized;
  }
  return `${scope.path}/${normalized}`;
}
