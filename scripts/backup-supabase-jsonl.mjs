#!/usr/bin/env node
import { closeSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_ENV_FILE = ".env";
const DEFAULT_OUTPUT_ROOT = "/tmp/giro-office-supabase-backups";
const MIGRATION_V2_TABLES = new Set([
  "organizations",
  "departments",
  "users",
  "clients",
  "integracao.projects",
  "integracao.tasksModel",
  "integracao.projectPlan",
  "integracao.projectPlanTasks",
  "integracao.tasks",
  "regularize.license",
  "regularize.process",
  "regularize.proceduralGuidances",
  "regularize.partners",
  "regularize.municipalTaxes",
  "regularize.passwordsRegularize",
]);

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    migrationV2Only: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      args.envFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output-root") {
      args.outputRoot = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--migration-v2-only") {
      args.migrationV2Only = true;
      continue;
    }

    throw new Error(`Argumento desconhecido: ${arg}`);
  }

  return args;
}

function parseEnvFile(file) {
  const env = {};
  const content = readFileSync(file, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll("\"", "\"\"")}"`;
}

function runPsql({ url, user, password, database, args, maxBuffer = 1024 * 1024 * 200 }) {
  const result = spawnSync(
    "psql",
    [
      "-h",
      url.hostname,
      "-p",
      url.port || "5432",
      "-U",
      user,
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      ...args,
    ],
    {
      encoding: "utf8",
      maxBuffer,
      env: {
        ...process.env,
        PGPASSWORD: password,
        PGSSLMODE: "require",
      },
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  return result.stdout;
}

function runPsqlToFile({ url, user, password, database, args, file }) {
  const output = openSync(file, "w");
  try {
    const result = spawnSync(
      "psql",
      [
        "-h",
        url.hostname,
        "-p",
        url.port || "5432",
        "-U",
        user,
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        ...args,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", output, "pipe"],
        env: {
          ...process.env,
          PGPASSWORD: password,
          PGSSLMODE: "require",
        },
      },
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || `psql falhou com status ${result.status}`);
    }
  } finally {
    closeSync(output);
  }
}

function safeFileName(value) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = parseEnvFile(args.envFile);

  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL nao encontrado em ${args.envFile}.`);
  }

  const url = new URL(env.DATABASE_URL);
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = url.pathname.slice(1) || "postgres";
  const backupDir = path.join(args.outputRoot, `supabase-before-real-migration-${timestamp()}`);
  const tablesDir = path.join(backupDir, "tables");
  mkdirSync(tablesDir, { recursive: true });

  const tableListSql = [
    "select table_schema || chr(9) || table_name",
    "from information_schema.tables",
    "where table_schema = $$public$$ and table_type = $$BASE TABLE$$",
    "order by table_name",
  ].join(" ");

  const tableLines = runPsql({
    url,
    user,
    password,
    database,
    args: ["-At", "-c", tableListSql],
  })
    .trim()
    .split(/\n/)
    .filter(Boolean);

  const selectedTableLines = args.migrationV2Only
    ? tableLines.filter((line) => {
        const [, table] = line.split("\t");
        return MIGRATION_V2_TABLES.has(table);
      })
    : tableLines;

  const tableBackups = [];

  for (const line of selectedTableLines) {
    const [schema, table] = line.split("\t");
    const relation = `${quoteIdent(schema)}.${quoteIdent(table)}`;
    const count = Number(
      runPsql({
        url,
        user,
        password,
        database,
        args: ["-At", "-c", `select count(*) from ${relation}`],
      }).trim() || "0",
    );
    const file = path.join(tablesDir, `${safeFileName(`${schema}.${table}`)}.jsonl`);
    if (count > 0) {
      runPsqlToFile({
        url,
        user,
        password,
        database,
        args: ["-At", "-c", `copy (select row_to_json(t) from (select * from ${relation}) t) to stdout`],
        file,
      });
    } else {
      writeFileSync(file, "", "utf8");
    }
    tableBackups.push({
      schema,
      table,
      rows: count,
      file,
      bytes: statSync(file).size,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: "jsonl-readonly-fallback",
    reason: "pg_dump local incompativel com servidor Postgres 17; backup feito por COPY read-only.",
    scope: args.migrationV2Only ? "migration-v2-target-tables" : "all-public-base-tables",
    tables: tableBackups,
  };
  writeFileSync(path.join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        backupDir,
        tables: tableBackups.length,
        nonEmptyTables: tableBackups.filter((table) => table.rows > 0).length,
        totalRows: tableBackups.reduce((sum, table) => sum + table.rows, 0),
      },
      null,
      2,
    ),
  );
}

main();
