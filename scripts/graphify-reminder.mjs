#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { pathScopeName } from "./graphify-scopes.mjs";

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

export function scopesFromChangedPaths(changedPaths = []) {
  return uniqueValues(changedPaths.map((filePath) => pathScopeName(filePath))).sort();
}

export function buildGraphifyReminder({
  hookName = "git hook",
  hasGraphify = false,
  changedPaths = [],
} = {}) {
  const availability = hasGraphify
    ? "Graphify instalado localmente."
    : "Graphify nao encontrado; use o fallback manual do AGENTS.md.";
  const scopes = scopesFromChangedPaths(changedPaths);
  const scopedCommands =
    scopes.length === 1 && scopes[0] === "ui"
      ? ["Frontend: pnpm graphify:update:ui ou pnpm graphify:ui para gerar do zero"]
      : scopes.length === 1 && scopes[0] === "services"
        ? ["Backend: pnpm graphify:update:services ou pnpm graphify:services para gerar do zero"]
        : [
            "Refresh inteligente: pnpm graphify:refresh",
            "Frontend: pnpm graphify:update:ui    ou pnpm graphify:ui para gerar do zero",
            "Backend:  pnpm graphify:update:services ou pnpm graphify:services para gerar do zero",
          ];

  return [
    `graphify: ${hookName} executado; os grafos locais podem estar desatualizados.`,
    availability,
    ...scopedCommands,
  ].join("\n");
}

export function isGraphifyInstalled() {
  const result = spawnSync("graphify", ["--help"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function gitChangedPaths(args) {
  const hookName = args[0] ?? "";
  const hookArgs = args.slice(1);
  const gitArgs =
    hookName === "post-checkout" && hookArgs[0] && hookArgs[1]
      ? ["diff", "--name-only", hookArgs[0], hookArgs[1]]
      : ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"];
  const result = spawnSync("git", gitArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const hookName = process.argv[2] ?? "git hook";
  console.log(
    buildGraphifyReminder({
      hookName,
      hasGraphify: isGraphifyInstalled(),
      changedPaths: gitChangedPaths(process.argv.slice(2)),
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
