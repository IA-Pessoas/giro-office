// Ambiente local descartável do smoke: Postgres em container, migrations e `wrangler dev`.
// Só roda contra loopback; nada aqui toca banco compartilhado.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cpSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = dirname(dirname(here));

/** Workers do escopo deste smoke, na ordem de inicialização (dependências primeiro). */
export const WORKERS = [
  { key: "audit", dir: "workers/audit-service", service: "giro-audit-service" },
  { key: "user", dir: "workers/user-service", service: "giro-user-service" },
  { key: "contabil", dir: "workers/contabil-service", service: "giro-contabil-service" },
  { key: "fiscal", dir: "workers/fiscal-service", service: "giro-fiscal-service" },
  { key: "triagem", dir: "workers/triagem-service", service: "giro-triagem-service" },
  {
    key: "parcelamento",
    dir: "workers/parcelamento-service",
    service: "giro-parcelamento-service",
  },
  { key: "task", dir: "workers/task-service", service: "giro-task-service" },
  { key: "gateway", dir: "workers/gateway", service: "giro-gateway" },
];

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

export function runOrThrow(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} falhou (${result.status}):\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result;
}

export function randomSecret() {
  return randomBytes(32).toString("hex");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function requireDocker() {
  const result = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (result.status !== 0) {
    throw new Error("Docker não está disponível; use SMOKE_MODE=external ou --self-check.");
  }
  return result.stdout.trim();
}

/** Sobe um Postgres descartável, rotulado, com porta efêmera em loopback. */
export async function startPostgres({ runId, image }) {
  const container = `giro-cf-smoke-${runId}`;
  const password = randomSecret();
  runOrThrow("docker", [
    "run",
    "-d",
    "--name",
    container,
    "--label",
    "giro.cf-smoke=1",
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-e",
    "POSTGRES_DB=postgres",
    "-p",
    "127.0.0.1::5432",
    image,
  ]);
  const port = runOrThrow("docker", ["port", container, "5432"]).stdout.trim().split(":").pop();
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const ready = run("docker", ["exec", container, "pg_isready", "-U", "postgres", "-q"]);
    if (ready.status === 0) {
      return { container, databaseUrl, port };
    }
    await sleep(1000);
  }
  throw new Error(`Postgres do container ${container} não ficou pronto.`);
}

export function removePostgres(container) {
  run("docker", ["rm", "-f", container]);
}

/**
 * Workarounds locais para migrations que não são replayáveis do zero.
 * Cada uso é registrado e reportado; com SMOKE_STRICT_MIGRATIONS=1 vira falha.
 */
const MIGRATION_WORKAROUNDS = {
  "20260821200000_add_platform_auth_sessions": {
    reason:
      "recria PlatformRole/platform_users já criados em 20260713100000; aplica o reparo oficial infra/prisma/repairs/reconcile-platform-auth-sessions.sql",
    apply(env) {
      prismaCli(
        ["db", "execute", "--file", "prisma/repairs/reconcile-platform-auth-sessions.sql"],
        env,
      );
      prismaCli(
        ["migrate", "resolve", "--applied", "20260821200000_add_platform_auth_sessions"],
        env,
      );
    },
  },
  "20260916170000_rh_request_workflow": {
    reason:
      'usa o schema "rh" (inexistente num banco novo) enquanto o modelo Prisma mapeia tabelas public."rh.*"; as tabelas de RH ficam ausentes no banco local (fora do escopo deste smoke)',
    apply(env) {
      run(
        "pnpm",
        [
          "exec",
          "prisma",
          "migrate",
          "resolve",
          "--rolled-back",
          "20260916170000_rh_request_workflow",
        ],
        {
          cwd: join(repoRoot, "infra"),
          env,
          encoding: "utf8",
        },
      );
      prismaCli(["migrate", "resolve", "--applied", "20260916170000_rh_request_workflow"], env);
    },
  },
};

function prismaCli(args, env) {
  return runOrThrow("pnpm", ["exec", "prisma", ...args], { cwd: join(repoRoot, "infra"), env });
}

export function applyMigrations(databaseUrl, { strict = false } = {}) {
  // DIRECT_URL explícito impede que um .env local redirecione o destino.
  const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl };
  const workarounds = [];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const deploy = run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: join(repoRoot, "infra"),
      env,
      encoding: "utf8",
    });
    const output = `${deploy.stdout ?? ""}${deploy.stderr ?? ""}`;
    if (deploy.status === 0) {
      prismaCli(["migrate", "status"], env);
      return { workarounds };
    }
    const failed = output.match(/Migration name:\s*(\S+)/u)?.[1];
    const workaround = failed ? MIGRATION_WORKAROUNDS[failed] : undefined;
    if (!workaround) throw new Error(`prisma migrate deploy falhou:\n${output}`);
    if (strict) {
      throw new Error(
        `Migration ${failed} não é replayável do zero (${workaround.reason}) e SMOKE_STRICT_MIGRATIONS=1.`,
      );
    }
    workaround.apply(env);
    workarounds.push({ migration: failed, reason: workaround.reason });
  }
  throw new Error("prisma migrate deploy não convergiu após os workarounds conhecidos.");
}

/**
 * Regenera o Prisma Client de cada Worker a partir do schema do próprio Worker.
 * O `runtime = "workerd"` agora vem declarado no schema; injetá-lo aqui duplicaria
 * a chave (P1012). Só o `output` é reescrito, para caminho absoluto fora do cwd.
 * O diretório de saída é ignorado pelo git; nenhum arquivo versionado é alterado.
 */
export function generateWorkerPrismaClients(tmpDir) {
  const generated = [];
  for (const worker of WORKERS) {
    const workerDir = join(repoRoot, worker.dir);
    const schemaPath = join(workerDir, "prisma", "schema.prisma");
    let schema;
    try {
      schema = readFileSync(schemaPath, "utf8");
    } catch {
      continue;
    }
    const outputDir = join(workerDir, "src", "generated", "prisma");
    const patched = schema.replace(
      /output\s*=\s*"[^"]*"/u,
      `output = ${JSON.stringify(outputDir)}`,
    );
    const patchedPath = join(tmpDir, `${worker.key}.prisma`);
    writeFileSync(patchedPath, patched);
    runOrThrow("pnpm", ["exec", "prisma", "generate", "--schema", patchedPath], { cwd: workerDir });
    generated.push(worker.key);
  }
  return generated;
}

/** Services que os Workers deste smoke importam e cujo client precisa rodar em workerd. */
const SERVICE_CLIENT_DIRS = [
  "services/user-service/src/generated/prisma",
  "services/contabil-service/src/generated/prisma",
  "services/fiscal-service/src/generated/prisma",
  "services/triagem-service/src/generated/prisma",
  "services/parcelamento-service/src/generated/prisma",
  "services/task-service/src/generated/prisma",
];

/**
 * Os Workers reusam os services Node, que importam o client gerado do schema canônico.
 * Esse client também precisa de `runtime = "workerd"`, senão o Worker não inicia.
 * A saída é gitignored; `restoreServicePrismaClients` devolve o client Node no fim.
 */
export function generateServicePrismaClients(tmpDir, databaseUrl) {
  const schemaPath = join(repoRoot, "infra", "prisma", "schema.prisma");
  const schema = readFileSync(schemaPath, "utf8");
  const clientDir = join(tmpDir, "service-client");
  const patched = schema.replace(
    /generator userServiceClient \{[^}]*\}/u,
    `generator userServiceClient {\n  provider = "prisma-client"\n  runtime = "workerd"\n  output = ${JSON.stringify(clientDir)}\n  previewFeatures = ["fullTextSearchPostgres"]\n}`,
  );
  const patchedPath = join(tmpDir, "infra-schema.prisma");
  writeFileSync(patchedPath, patched);
  runOrThrow(
    "pnpm",
    ["exec", "prisma", "generate", "--schema", patchedPath, "--generator", "userServiceClient"],
    {
      cwd: join(repoRoot, "infra"),
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    },
  );
  for (const target of SERVICE_CLIENT_DIRS) {
    const destination = join(repoRoot, target);
    rmSync(destination, { recursive: true, force: true });
    cpSync(clientDir, destination, { recursive: true });
  }
  return SERVICE_CLIENT_DIRS.length;
}

/** Regenera os clients Node (o smoke sobrescreveu com a variante workerd). */
export function restoreServicePrismaClients(databaseUrl) {
  rmSync(join(repoRoot, ".turbo", "prisma", "generate.stamp"), { force: true });
  runOrThrow("node", [join(repoRoot, "scripts", "prisma-generate.mjs")], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
  });
}

function stripJsonComments(text) {
  return text
    .split("\n")
    .filter((line) => !/^\s*\/\//u.test(line))
    .join("\n");
}

/** Config temporária = config versionada do Worker + binding Hyperdrive local. */
function writeWorkerConfig(worker, { tmpDir, databaseUrl, vars }) {
  const workerDir = join(repoRoot, worker.dir);
  const original = JSON.parse(
    stripJsonComments(readFileSync(join(workerDir, "wrangler.jsonc"), "utf8")),
  );
  const configDir = join(tmpDir, worker.key);
  mkdirSync(configDir, { recursive: true });
  const config = {
    name: original.name,
    main: join(workerDir, original.main),
    compatibility_date: original.compatibility_date,
    compatibility_flags: original.compatibility_flags ?? [],
    ...(original.services ? { services: original.services } : {}),
    ...(original.vars ? { vars: original.vars } : {}),
    // O task Worker roda o app Node trocando módulos por alias; caminhos relativos à config.
    ...(original.alias
      ? {
          alias: Object.fromEntries(
            Object.entries(original.alias).map(([from, to]) => [
              from,
              to.startsWith(".") ? join(workerDir, to) : to,
            ]),
          ),
        }
      : {}),
    hyperdrive: [
      {
        binding: "HYPERDRIVE",
        id: randomUUID().replace(/-/gu, ""),
        localConnectionString: databaseUrl,
      },
    ],
  };
  writeFileSync(join(configDir, "wrangler.json"), JSON.stringify(config, null, 2));
  writeFileSync(
    join(configDir, ".dev.vars"),
    `${Object.entries(vars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
  );
  return { configPath: join(configDir, "wrangler.json"), workerDir };
}

async function waitForHealth(baseUrl, logPath) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch {
      // ainda subindo
    }
    await sleep(1000);
  }
  throw new Error(`Worker em ${baseUrl} não respondeu /health. Log: ${logPath}`);
}

/** Sobe um `wrangler dev` por Worker; os Service Bindings se ligam pelo dev registry local. */
export async function startWorkers({ tmpDir, databaseUrl, secrets, portBase }) {
  const processes = [];
  const baseUrls = {};

  const varsFor = (key) => {
    const common = { JWT_SECRET: secrets.jwtSecret };
    if (key === "audit") {
      // O audit-service valida com o mesmo segredo que os chamadores usam em AUDIT_SERVICE_TOKEN.
      return { ...common, INTERNAL_SERVICE_TOKEN: secrets.auditToken };
    }
    const base = {
      ...common,
      INTERNAL_SERVICE_TOKEN: secrets.internalToken,
      AUDIT_SERVICE_TOKEN: secrets.auditToken,
    };
    if (key === "gateway") return base;
    if (key === "user") return { ...base, REPORTS_INTERNAL_TOKEN: secrets.reportsToken };
    const service = {
      ...base,
      AUDIT_ENABLED: "true",
      USER_SERVICE_INTERNAL_TOKEN: secrets.internalToken,
      TRIAGEM_INTERNAL_TOKEN: secrets.internalToken,
      REPORTS_INTERNAL_TOKEN: secrets.reportsToken,
      REPORTS_GRANT_SECRET: secrets.grantSecret,
    };
    if (key !== "task") return service;
    // Valores descartáveis: o smoke não exercita anexos (Supabase) nem extração por IA,
    // mas o task-service recusa subir em produção sem eles, como no Node.
    return {
      ...service,
      COMMERCIAL_SERVICE_TOKEN: secrets.internalToken,
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_SERVICE_ROLE_KEY: "smoke-local-only",
      TASK_ATTACHMENT_STORAGE_BUCKET: "smoke-local-only",
      OPENAI_API_KEY: "smoke-local-only",
    };
  };

  for (const [index, worker] of WORKERS.entries()) {
    const port = portBase + index;
    const { configPath, workerDir } = writeWorkerConfig(worker, {
      tmpDir,
      databaseUrl,
      vars: varsFor(worker.key),
    });
    const logPath = join(tmpDir, `${worker.key}.log`);
    const logFd = openSync(logPath, "a");
    const child = spawn(
      "pnpm",
      [
        "exec",
        "wrangler",
        "dev",
        "-c",
        configPath,
        "--ip",
        "127.0.0.1",
        "--port",
        String(port),
        // Cada processo precisa do seu inspector; o default (9229) colide entre Workers.
        "--inspector-port",
        String(port + 100),
      ],
      { cwd: workerDir, stdio: ["ignore", logFd, logFd], detached: true },
    );
    processes.push({ key: worker.key, child, logPath });
    baseUrls[worker.key] = `http://127.0.0.1:${port}`;
  }

  try {
    for (const worker of WORKERS) {
      await waitForHealth(baseUrls[worker.key], join(tmpDir, `${worker.key}.log`));
    }
  } catch (error) {
    stopWorkers(processes);
    throw error;
  }
  return { processes, baseUrls };
}

export function stopWorkers(processes) {
  for (const { child } of processes) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // já encerrado
      }
    }
  }
}
