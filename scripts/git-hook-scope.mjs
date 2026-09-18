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

/** Modo explicito (--full): o desenvolvedor pede todos os gates, suites incluidas. */
const GLOBAL_COMMANDS = [
  ["pnpm", ["audit:ci"]],
  ["pnpm", ["check"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["test"]],
];

/** Sem base para comparar: roda o gate rapido inteiro, sem as suites dos pacotes. */
const BASELESS_COMMANDS = [
  ["pnpm", ["audit:ci"]],
  ["pnpm", ["check"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["test:scripts"]],
];

const DEPENDENCY_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  ".npmrc",
  ".pnpmfile.cjs",
]);

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

export function buildHookPlan(
  classification,
  bases = [],
  { changedFiles = [], full = false } = {},
) {
  if (full) {
    return cloneCommands(GLOBAL_COMMANDS);
  }

  if (classification.mode === "skip") {
    return [];
  }

  if (bases.length === 0) {
    return cloneCommands(BASELESS_COMMANDS);
  }

  const global = classification.mode === "global";
  const filters = global ? [] : bases.map((base) => `--filter=...[${base}]`);
  const commands = [];

  if (
    changedFiles.some((file) => DEPENDENCY_FILES.has(path.posix.basename(normalizeGitPath(file))))
  ) {
    commands.push(["pnpm", ["audit:ci"]]);
  }

  if (global) {
    commands.push(buildBiomeCheckCommand(changedFiles), ["pnpm", ["typecheck"]]);
  } else {
    commands.push([
      "pnpm",
      ["exec", "turbo", "run", "check", "typecheck", ...filters, "--output-logs=new-only"],
    ]);
  }

  // As politicas de seguranca sao rapidas e deterministicas; entre elas esta a
  // varredura de payload em configs executaveis, que detectou o comprometimento
  // de 2026-09-17. As suites dos pacotes ficam de fora: falhavam de forma
  // intermitente na maquina de quem empurra e um gate que as vezes mente vira
  // motivo para --no-verify. Elas seguem em pnpm test e devem voltar ao CI.
  commands.push(["pnpm", ["test:scripts"]]);

  return commands;
}

/**
 * Branches onde reescrever historico nunca e aceitavel, nem com a valvula de escape.
 */
const PROTECTED_BRANCHES = new Set(["main", "develop", "staging"]);

/** Valvula de escape consciente, para rebase de branch propria. */
const FORCE_ESCAPE_ENV = "ALLOW_FORCE_PUSH";

/**
 * Um push que reescreve historico aparece no pre-push como um remoto que nao e
 * ancestral do local: os commits ja publicados deixariam de existir. Recusamos por
 * padrao — foi assim que o repositorio foi comprometido em 2026-09-17, com as branches
 * reescritas por push forcado — e so liberamos fora das branches protegidas quando
 * quem empurra declara a intencao em ALLOW_FORCE_PUSH.
 */
export function findHistoryRewrites(records, git = createGitRunner()) {
  const rewrites = [];

  for (const record of records) {
    if (ZERO_OID.test(record.localOid) || ZERO_OID.test(record.remoteOid)) {
      continue;
    }

    if (git.isAncestor(record.remoteOid, record.localOid) === false) {
      rewrites.push({
        ref: record.remoteRef,
        branch: record.remoteRef.replace(/^refs\/heads\//, ""),
        remoteOid: record.remoteOid,
        localOid: record.localOid,
      });
    }
  }

  return rewrites;
}

export function describeForcePushBlock(rewrites, env = process.env) {
  if (rewrites.length === 0) {
    return null;
  }

  const protectedRewrites = rewrites.filter(({ branch }) => PROTECTED_BRANCHES.has(branch));

  if (env[FORCE_ESCAPE_ENV] === "1" && protectedRewrites.length === 0) {
    return null;
  }

  const alvos = rewrites.map(
    ({ branch, remoteOid }) => `  ${branch} (remoto ${remoteOid.slice(0, 8)} deixaria de existir)`,
  );
  const motivo =
    protectedRewrites.length > 0
      ? `Reescrever historico de ${protectedRewrites.map(({ branch }) => branch).join(", ")} nao e permitido.`
      : `Para reescrever historico de uma branch propria, declare a intencao definindo ${FORCE_ESCAPE_ENV}=1 no push.`;

  return [
    "git-hook-scope: push recusado — reescrita de historico detectada.",
    ...alvos,
    motivo,
  ].join("\n");
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
    isAncestor(ancestorOid, descendantOid) {
      const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestorOid, descendantOid], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (result.status === 0) return true;
      if (result.status === 1) return false;
      // Objeto ausente ou erro do git: nao da para afirmar que houve reescrita.
      return null;
    },
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
  } catch (error) {
    // Sem stdin legivel nao da para saber o que esta sendo empurrado: avise, nao engula.
    console.error(`git-hook-scope: nao foi possivel ler a entrada do hook: ${error.message}`);
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

/** Ver comentario em runCommands: evita que a carga da maquina reprove codigo correto. */
const HOOK_TURBO_CONCURRENCY = "50%";

export function runCommands(
  commands,
  spawn = spawnSync,
  env = process.env,
  platform = process.platform,
) {
  // O hook roda na maquina de quem empurra, com editor e containers no ar; sem teto,
  // o turbo abre uma tarefa por nucleo e a disputa por CPU vira falha intermitente.
  const hookEnv = { TURBO_CONCURRENCY: HOOK_TURBO_CONCURRENCY, ...env };

  for (const [command, args] of commands) {
    console.log(`$ ${formatCommand([command, args])}`);
    const startedAt = performance.now();

    let result = spawn(command, args, {
      stdio: "inherit",
      env: hookEnv,
    });

    if (shouldFallbackToCorepack(command, result)) {
      const [fallbackCommand, fallbackArgs] = buildPnpmFallback(args, platform);
      const fallbackEnv = createPnpmShimEnv(hookEnv, platform);

      try {
        result = spawn(fallbackCommand, fallbackArgs, {
          stdio: "inherit",
          env: fallbackEnv.env,
        });
      } finally {
        fallbackEnv.cleanup();
      }
    }

    console.log(
      `git-hook-scope: command finished in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`,
    );

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

function parseCliArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const full = argv.includes("--full");
  const hook = argv.find((arg) => !arg.startsWith("-")) ?? "pre-push";

  return { dryRun, full, hook };
}

function main() {
  const { dryRun, full, hook } = parseCliArgs(process.argv.slice(2));

  if (hook !== "pre-push") {
    console.error(`Unsupported hook: ${hook}`);
    process.exit(2);
  }

  const hookInput = readHookInput();
  const bloqueio = describeForcePushBlock(findHistoryRewrites(parsePrePushInput(hookInput)));

  if (bloqueio) {
    console.error(bloqueio);
    process.exit(1);
  }

  const resolution = resolvePrePushChangedFiles(hookInput);
  const classification = full
    ? { mode: "global", reason: "explicit-full" }
    : resolution.forceGlobal
      ? { mode: "global", reason: resolution.reason }
      : classifyChangedFiles(resolution.files);
  const commands = buildHookPlan(classification, resolution.bases ?? [], {
    changedFiles: resolution.files,
    full,
  });

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
