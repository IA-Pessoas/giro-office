#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import {
  getGraphifyScope,
  listGraphifyScopes,
  pathScopeName,
  resolveScopePath,
} from "./graphify-scopes.mjs";

export function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

export function selectScopesFromPaths(paths) {
  return uniqueValues(paths.map((filePath) => pathScopeName(filePath))).sort();
}

function readGraphCommit(scope, cwd = process.cwd()) {
  const graphPath = resolveScopePath(scope, "graphPath", cwd);
  if (!existsSync(graphPath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(graphPath, "utf8")).built_at_commit;
  } catch {
    return undefined;
  }
}

export function selectStaleScopes(currentCommit, { cwd = process.cwd() } = {}) {
  if (!currentCommit) {
    return [];
  }
  return listGraphifyScopes()
    .filter((scope) => readGraphCommit(scope, cwd) && readGraphCommit(scope, cwd) !== currentCommit)
    .map((scope) => scope.name);
}

export function determineRefreshScopes({
  explicitScope,
  changedPaths = [],
  currentCommit,
  cwd = process.cwd(),
} = {}) {
  if (explicitScope) {
    return [getGraphifyScope(explicitScope).name];
  }
  const changedScopes = selectScopesFromPaths(changedPaths);
  if (changedScopes.length > 0) {
    return changedScopes;
  }
  return selectStaleScopes(currentCommit, { cwd });
}

function gitOutput(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

export function getChangedPaths() {
  return uniqueValues([
    ...gitOutput(["diff", "--name-only", "HEAD"]).split("\n"),
    ...gitOutput(["diff", "--cached", "--name-only"]).split("\n"),
  ]);
}

function getCurrentCommit() {
  return gitOutput(["rev-parse", "HEAD"]);
}

function runScopeRefresh(scopeName, action) {
  console.log(`graphify: ${scopeName} -> ${action}`);
  const result = spawnSync(process.execPath, ["scripts/graphify-scope.mjs", scopeName, action], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function main() {
  const args = process.argv.slice(2);
  const extract = args.includes("--extract");
  const explicitScope = args.find((arg) => !arg.startsWith("-"));
  const changedPaths = getChangedPaths();
  const scopes = determineRefreshScopes({
    explicitScope,
    changedPaths,
    currentCommit: getCurrentCommit(),
  });

  if (scopes.length === 0) {
    console.log("graphify: nenhum escopo local precisa de refresh.");
    return;
  }

  const action = extract ? "extract" : "update";
  for (const scopeName of scopes) {
    const status = runScopeRefresh(scopeName, action);
    if (status !== 0) {
      process.exit(status);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
