#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getGraphifyScope, isDirectScriptExecution, resolveScopePath } from "./graphify-scopes.mjs";

const GRAPHIFY_LLM_ENV_KEYS = new Set([
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "MOONSHOT_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
]);

function parseDotEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const key = match[1];
    if (!GRAPHIFY_LLM_ENV_KEYS.has(key)) {
      continue;
    }
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[key] = value;
  }
  return values;
}

export function loadGraphifyDotEnv({ cwd = process.cwd(), baseEnv = process.env } = {}) {
  const env = { ...baseEnv };
  const envPath = resolve(cwd, ".env");
  if (!existsSync(envPath)) {
    return env;
  }

  for (const [key, value] of Object.entries(parseDotEnv(readFileSync(envPath, "utf8")))) {
    if (!env[key]) {
      env[key] = value;
    }
  }
  return env;
}

export function buildGraphifyCommand(scopeName, action) {
  const scope = getGraphifyScope(scopeName);

  if (action === "extract") {
    return {
      command: "graphify",
      args: ["extract", scope.path, "--out", scope.path],
      env: {},
    };
  }

  if (action === "update") {
    return {
      command: "graphify",
      args: ["update", scope.path],
      env: { GRAPHIFY_OUT: resolveScopePath(scope, "out") },
    };
  }

  throw new Error(`Acao invalida: ${action}. Use extract ou update.`);
}

export function buildGraphifyVisualizationCommand(scopeName) {
  const scope = getGraphifyScope(scopeName);
  return {
    command: "graphify",
    args: ["cluster-only", scope.path, "--graph", scope.graphPath],
    env: {},
  };
}

function runPostprocess(scopeName) {
  const result = spawnSync(process.execPath, ["scripts/graphify-postprocess.mjs", scopeName], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function runGraphifyCommand({ command, args, env }, baseEnv) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...baseEnv, ...env },
  });
  if (result.error) {
    console.error(
      "Graphify nao encontrado no PATH. Use o fallback manual documentado em AGENTS.md.",
    );
    return 127;
  }
  return result.status ?? 1;
}

function main() {
  const scopeName = process.argv[2];
  const action = process.argv[3];

  try {
    const graphifyEnv = loadGraphifyDotEnv();
    const status = runGraphifyCommand(buildGraphifyCommand(scopeName, action), graphifyEnv);
    if (status !== 0) {
      process.exit(status);
    }
    const visualizationStatus = runGraphifyCommand(
      buildGraphifyVisualizationCommand(scopeName),
      graphifyEnv,
    );
    if (visualizationStatus !== 0) {
      process.exit(visualizationStatus);
    }
    process.exit(runPostprocess(scopeName));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

if (isDirectScriptExecution(import.meta.url)) {
  main();
}
