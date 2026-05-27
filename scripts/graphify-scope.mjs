#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { buildGraphifyEnv, renderGraphifyApiKeyHint } from "./graphify-env.mjs";
import { getGraphifyScope, isDirectScriptExecution, resolveScopePath } from "./graphify-scopes.mjs";

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

function main() {
  const scopeName = process.argv[2];
  const action = process.argv[3];

  try {
    const { command, args, env } = buildGraphifyCommand(scopeName, action);
    const graphifyEnv = buildGraphifyEnv(scopeName, {
      baseEnv: { ...process.env, ...env },
    });
    if (action === "extract") {
      console.log(renderGraphifyApiKeyHint(graphifyEnv));
    }
    console.log(`$ ${[command, ...args].join(" ")}`);
    const result = spawnSync(command, args, {
      stdio: "inherit",
      env: graphifyEnv.env,
    });
    if (result.error) {
      console.error(
        "Graphify nao encontrado no PATH. Use o fallback manual documentado em AGENTS.md.",
      );
      process.exit(127);
    }
    const status = result.status ?? 1;
    if (status !== 0) {
      process.exit(status);
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
