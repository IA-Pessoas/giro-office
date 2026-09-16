#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ZERO_OID = /^0+$/;

const DOCS_ROOT_FILES = new Set(["README.md"]);
const DOCS_PREFIXES = ["docs/"];

const GLOBAL_ROOT_FILES = new Set([
  ".env.example",
  ".gitattributes",
  "AGENTS.md",
  "biome.json",
  "docker-compose.vps.slot-develop.yml",
  "docker-compose.vps.slot-test-develop.yml",
  "docker-compose.vps.slot-test-staging.yml",
  "docker-compose.vps.yml",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "turbo.json",
]);

// Caminhos fora do grafo de pacotes: o turbo não consegue derivar quem eles afetam.
// `infra/` fica aqui de propósito — é um pacote do workspace, mas ninguém o declara como
// dependência, então uma mudança de schema Prisma não selecionaria nenhum dependente.
const GLOBAL_PREFIXES = [
  ".codex/",
  ".cursor/",
  ".github/",
  ".husky/",
  "docker/",
  "infra/",
  "scripts/",
  "supabase/",
];

const GLOBAL_COMMANDS = [
  ["pnpm", ["audit:ci"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["test"]],
];

const AFFECTED_TASKS = ["check", "typecheck", "test"];

function normalizeGitPath(filePath) {
  return filePath
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

function isDocsOnlyPath(filePath) {
  return (
    DOCS_ROOT_FILES.has(filePath) || DOCS_PREFIXES.some((prefix) => filePath.startsWith(prefix))
  );
}

function isGlobalImpactPath(filePath) {
  return (
    GLOBAL_ROOT_FILES.has(filePath) ||
    GLOBAL_PREFIXES.some((prefix) => filePath.startsWith(prefix)) ||
    !filePath.includes("/")
  );
}

function cloneCommands(commands) {
  return commands.map(([command, args]) => [command, [...args]]);
}

function buildBiomeCheckCommand(changedFiles) {
  if (changedFiles.length === 0) {
    return ["pnpm", ["check"]];
  }

  return ["pnpm", ["exec", "biome", "check", "--files-ignore-unknown=true", ...changedFiles]];
}

export function classifyChangedFiles(changedFiles) {
  const filePaths = [...new Set(changedFiles.map(normalizeGitPath).filter(Boolean))];

  if (filePaths.length === 0) {
    return {
      mode: "skip",
      scopes: [],
      reason: "no-changed-files",
    };
  }

  const codePaths = filePaths.filter((filePath) => !isDocsOnlyPath(filePath));

  if (codePaths.length === 0) {
    return { mode: "skip", reason: "docs-only" };
  }

  if (codePaths.some(isGlobalImpactPath)) {
    return { mode: "global", reason: "global-impact" };
  }

  // Todo o resto vive dentro de um pacote do workspace: o turbo seleciona o que mudou
  // e, pelo grafo, quem depende do que mudou.
  return { mode: "affected", reason: "workspace-packages" };
}

export function buildHookPlan(classification, bases = [], changedFiles = []) {
  if (classification.mode === "skip") {
    return [];
  }

  if (classification.mode === "global" || bases.length === 0) {
    const [[auditCommand, auditArgs], ...remainingCommands] = cloneCommands(GLOBAL_COMMANDS);
    return [[auditCommand, auditArgs], buildBiomeCheckCommand(changedFiles), ...remainingCommands];
  }

  const filters = bases.map((base) => `--filter=...[${base}]`);
  return [["pnpm", ["exec", "turbo", "run", ...AFFECTED_TASKS, ...filters]]];
}

export function parsePrePushInput(input) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localOid, remoteRef, remoteOid] = line.split(/\s+/);
      return { localRef, localOid, remoteRef, remoteOid };
    })
    .filter((record) => record.localRef && record.localOid && record.remoteRef && record.remoteOid);
}

function splitGitOutput(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function diffFiles(baseOid, headOid, git) {
  const output = git.run(["diff", "--name-only", baseOid, headOid]);

  if (output === null) {
    return null;
  }

  return splitGitOutput(output);
}

function resolveManualChangedFiles(git) {
  const upstream = git.run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);

  if (upstream) {
    const mergeBase = git.run(["merge-base", "HEAD", upstream]);

    if (mergeBase) {
      const files = diffFiles(mergeBase, "HEAD", git);

      if (files !== null) {
        return {
          files,
          bases: [mergeBase],
          forceGlobal: false,
          reason: "manual-upstream",
        };
      }
    }
  }

  const originDevelopBase = git.run(["merge-base", "HEAD", "origin/develop"]);

  if (originDevelopBase) {
    const files = diffFiles(originDevelopBase, "HEAD", git);

    if (files !== null) {
      return {
        files,
        bases: [originDevelopBase],
        forceGlobal: false,
        reason: "manual-origin-develop",
      };
    }
  }

  return {
    files: [],
    bases: [],
    forceGlobal: true,
    reason: "manual-base-unavailable",
  };
}

export function resolvePrePushChangedFiles(input, git = createGitRunner()) {
  const records = parsePrePushInput(input);

  if (records.length === 0) {
    return resolveManualChangedFiles(git);
  }

  const files = new Set();
  const bases = new Set();

  for (const record of records) {
    if (ZERO_OID.test(record.localOid)) {
      continue;
    }

    if (ZERO_OID.test(record.remoteOid)) {
      const mergeBase = git.run(["merge-base", record.localOid, "origin/develop"]);

      if (!mergeBase) {
        return {
          files: [],
          bases: [],
          forceGlobal: true,
          reason: "new-branch-without-origin-develop",
        };
      }

      const changedFiles = diffFiles(mergeBase, record.localOid, git);

      if (changedFiles === null) {
        return {
          files: [],
          bases: [],
          forceGlobal: true,
          reason: "new-branch-diff-unavailable",
        };
      }

      bases.add(mergeBase);

      for (const filePath of changedFiles) {
        files.add(filePath);
      }

      continue;
    }

    const changedFiles = diffFiles(record.remoteOid, record.localOid, git);

    if (changedFiles === null) {
      return {
        files: [],
        bases: [],
        forceGlobal: true,
        reason: "pre-push-diff-unavailable",
      };
    }

    bases.add(record.remoteOid);

    for (const filePath of changedFiles) {
      files.add(filePath);
    }
  }

  return {
    files: [...files],
    bases: [...bases],
    forceGlobal: false,
    reason: "pre-push-refs",
  };
}

function createGitRunner() {
  return {
    run(args) {
      const result = spawnSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (result.status !== 0) {
        return null;
      }

      return result.stdout.trim();
    },
  };
}

function readHookInput() {
  if (process.stdin.isTTY) {
    return "";
  }

  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatCommand([command, args]) {
  return [command, ...args].map(shellQuote).join(" ");
}

function buildPnpmFallback(args, platform = process.platform) {
  if (platform === "win32") {
    return ["cmd.exe", ["/d", "/s", "/c", "corepack", "pnpm", ...args]];
  }

  return ["corepack", ["pnpm", ...args]];
}

function createPnpmShimEnv(env, platform = process.platform) {
  const shimDir = mkdtempSync(path.join(tmpdir(), "git-hook-pnpm-"));

  if (platform === "win32") {
    writeFileSync(path.join(shimDir, "pnpm.cmd"), "@echo off\r\ncorepack pnpm %*\r\n");
  } else {
    const shimPath = path.join(shimDir, "pnpm");
    writeFileSync(shimPath, '#!/bin/sh\nexec corepack pnpm "$@"\n');
    chmodSync(shimPath, 0o755);
  }

  return {
    env: {
      ...env,
      PATH: [shimDir, env.PATH ?? ""].filter(Boolean).join(path.delimiter),
    },
    cleanup() {
      rmSync(shimDir, { recursive: true, force: true });
    },
  };
}

function shouldFallbackToCorepack(command, result) {
  return command === "pnpm" && result.error?.code === "ENOENT";
}

export function runCommands(
  commands,
  spawn = spawnSync,
  env = process.env,
  platform = process.platform,
) {
  for (const [command, args] of commands) {
    console.log(`$ ${formatCommand([command, args])}`);

    let result = spawn(command, args, {
      stdio: "inherit",
      env,
    });

    if (shouldFallbackToCorepack(command, result)) {
      const [fallbackCommand, fallbackArgs] = buildPnpmFallback(args, platform);
      const fallbackEnv = createPnpmShimEnv(env, platform);

      try {
        result = spawn(fallbackCommand, fallbackArgs, {
          stdio: "inherit",
          env: fallbackEnv.env,
        });
      } finally {
        fallbackEnv.cleanup();
      }
    }

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

function parseCliArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const hook = argv.find((arg) => !arg.startsWith("-")) ?? "pre-push";

  return { dryRun, hook };
}

function main() {
  const { dryRun, hook } = parseCliArgs(process.argv.slice(2));

  if (hook !== "pre-push") {
    console.error(`Unsupported hook: ${hook}`);
    process.exit(2);
  }

  const resolution = resolvePrePushChangedFiles(readHookInput());
  const classification = resolution.forceGlobal
    ? { mode: "global", reason: resolution.reason }
    : classifyChangedFiles(resolution.files);
  const commands = buildHookPlan(classification, resolution.bases ?? [], resolution.files);

  console.log(
    `git-hook-scope: ${classification.mode} (${classification.reason}); files=${resolution.files.length}`,
  );

  if (commands.length === 0) {
    console.log("git-hook-scope: no code validation needed");
    return;
  }

  if (dryRun) {
    for (const command of commands) {
      console.log(formatCommand(command));
    }

    return;
  }

  process.exit(runCommands(commands));
}

const currentFilePath = fileURLToPath(import.meta.url);
const entrypointPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entrypointPath === currentFilePath) {
  main();
}
