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

const GLOBAL_PREFIXES = [
  ".codex/",
  ".cursor/",
  ".github/",
  ".husky/",
  "docker/",
  "infra/",
  "packages/",
  "scripts/",
  "shared/",
  "supabase/",
];

const GLOBAL_COMMANDS = [
  ["pnpm", ["audit:ci"]],
  ["pnpm", ["check"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["test"]],
];

const SCOPE_COMMANDS = {
  ui: [["pnpm", ["exec", "turbo", "run", "typecheck", "test", "--filter=@workspace/app"]]],
  services: [
    ["pnpm", ["exec", "turbo", "run", "check", "typecheck", "test", "--filter=./services/*"]],
  ],
};

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

export function classifyChangedFiles(changedFiles) {
  const filePaths = [...new Set(changedFiles.map(normalizeGitPath).filter(Boolean))];

  if (filePaths.length === 0) {
    return {
      mode: "skip",
      scopes: [],
      reason: "no-changed-files",
    };
  }

  let hasUi = false;
  let hasServices = false;
  let hasGlobal = false;
  let hasNonDocs = false;

  for (const filePath of filePaths) {
    if (isDocsOnlyPath(filePath)) {
      continue;
    }

    hasNonDocs = true;

    if (filePath.startsWith("app/")) {
      hasUi = true;
      continue;
    }

    if (filePath.startsWith("services/")) {
      hasServices = true;
      continue;
    }

    if (isGlobalImpactPath(filePath)) {
      hasGlobal = true;
      continue;
    }

    hasGlobal = true;
  }

  if (!hasNonDocs) {
    return {
      mode: "skip",
      scopes: [],
      reason: "docs-only",
    };
  }

  if (hasGlobal) {
    return {
      mode: "global",
      scopes: ["global"],
      reason: "global-impact",
    };
  }

  const scopes = [];

  if (hasUi) {
    scopes.push("ui");
  }

  if (hasServices) {
    scopes.push("services");
  }

  return {
    mode: "scoped",
    scopes,
    reason: scopes.join("+"),
  };
}

export function buildHookPlan(classification) {
  if (classification.mode === "skip") {
    return [];
  }

  if (classification.mode === "global") {
    return cloneCommands(GLOBAL_COMMANDS);
  }

  return classification.scopes.flatMap((scope) => cloneCommands(SCOPE_COMMANDS[scope] ?? []));
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
        forceGlobal: false,
        reason: "manual-origin-develop",
      };
    }
  }

  return {
    files: [],
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

  for (const record of records) {
    if (ZERO_OID.test(record.localOid)) {
      continue;
    }

    if (ZERO_OID.test(record.remoteOid)) {
      const mergeBase = git.run(["merge-base", record.localOid, "origin/develop"]);

      if (!mergeBase) {
        return {
          files: [],
          forceGlobal: true,
          reason: "new-branch-without-origin-develop",
        };
      }

      const changedFiles = diffFiles(mergeBase, record.localOid, git);

      if (changedFiles === null) {
        return {
          files: [],
          forceGlobal: true,
          reason: "new-branch-diff-unavailable",
        };
      }

      for (const filePath of changedFiles) {
        files.add(filePath);
      }

      continue;
    }

    const changedFiles = diffFiles(record.remoteOid, record.localOid, git);

    if (changedFiles === null) {
      return {
        files: [],
        forceGlobal: true,
        reason: "pre-push-diff-unavailable",
      };
    }

    for (const filePath of changedFiles) {
      files.add(filePath);
    }
  }

  return {
    files: [...files],
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
    ? {
        mode: "global",
        scopes: ["global"],
        reason: resolution.reason,
      }
    : classifyChangedFiles(resolution.files);
  const commands = buildHookPlan(classification);

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
