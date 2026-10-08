#!/usr/bin/env node
// Banco descartável para o smoke de CRUD dos Workers (workers/*/src/crud.smoke.test.ts).
//
//   node scripts/cloudflare-smoke/crud-db.mjs up     # sobe Postgres, db push do schema canônico, seed
//   node scripts/cloudflare-smoke/crud-db.mjs down   # remove o container
//
// O `up` grava scripts/cloudflare-smoke/.crud-smoke.json (ignorado pelo git) com a URL e os ids
// do seed. Os testes de smoke leem esse arquivo; sem ele, ficam em skip.
//
// Usa `prisma db push` de infra/prisma/schema.prisma, não as migrations: o objetivo é validar
// cada schema de Worker contra o schema canônico, que é o que o banco de produção espelha.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { newRunId } from "./lib.mjs";
import {
  removePostgres,
  repoRoot,
  requireDocker,
  run,
  runOrThrow,
  startPostgres,
} from "./local-env.mjs";

const statePath = join(repoRoot, "scripts", "cloudflare-smoke", ".crud-smoke.json");
const require = createRequire(join(repoRoot, "infra", "package.json"));
const { Client } = require("pg");

// Mesmo token de workers/runtime/src/crudSmoke.ts.
const SMOKE_CSRF_TOKEN = "A".repeat(43);

const MODULE_KEYS = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
];

async function insert(client, table, row) {
  // Preenche as colunas NOT NULL sem default que o seed não informa (@updatedAt é do
  // Prisma, não do banco) com um valor do tipo da coluna.
  const { rows } = await client.query(
    `select c.column_name, c.data_type, c.udt_name,
            (select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
              where t.typname = c.udt_name order by e.enumsortorder limit 1) as first_label
       from information_schema.columns c
      where c.table_name = $1 and c.is_nullable = 'NO' and c.column_default is null`,
    [table],
  );
  const values = { ...row };
  for (const { column_name, data_type, first_label } of rows) {
    if (column_name in values) continue;
    if (data_type.startsWith("timestamp") || data_type === "date") values[column_name] = new Date();
    else if (data_type === "boolean") values[column_name] = false;
    else if (/int|numeric|double|real/u.test(data_type)) values[column_name] = 0;
    else if (data_type === "uuid") values[column_name] = randomUUID();
    else if (data_type === "USER-DEFINED") values[column_name] = first_label;
    else if (data_type === "jsonb" || data_type === "json") values[column_name] = {};
    else values[column_name] = `smoke-${randomUUID().slice(0, 8)}`;
  }
  const columns = Object.keys(values);
  await client.query(
    `insert into "${table}" (${columns.map((column) => `"${column}"`).join(", ")})
     values (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
    Object.values(values),
  );
}

async function seed(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const departmentId = randomUUID();
  const ownerId = randomUUID();
  const userId = randomUUID();
  const suffix = organizationId.slice(0, 8);
  try {
    await insert(client, "organizations", {
      id: organizationId,
      name: "Smoke CRUD",
      slug: `smoke-crud-${suffix}`,
      cnpj: `${Date.now()}`.padStart(14, "0").slice(-14),
      status: "active",
    });
    await insert(client, "departments", {
      id: departmentId,
      name: "Tecnologia",
      organization_id: organizationId,
      status: "Ativo",
    });
    for (const [id, login, type, permission] of [
      [ownerId, `owner-${suffix}@smoke.local`, "owner", 2],
      [userId, `user-${suffix}@smoke.local`, "user", 1],
    ]) {
      await insert(client, "users", {
        id,
        name: `Smoke ${type}`,
        login,
        password: "smoke-not-a-real-hash",
        permission,
        status: "active",
        organization_id: organizationId,
        department_id: departmentId,
        type,
      });
      const permissionId = randomUUID();
      const level = type === "owner" ? 3 : 1;
      await insert(client, "permissions", {
        id: permissionId,
        user_id: id,
        organization_id: organizationId,
        ...Object.fromEntries(MODULE_KEYS.map((key) => [key, level])),
      });
      await client.query(`update users set permission_id = $1 where id = $2`, [permissionId, id]);
      // Sessão que o user-service valida no banco (smokeHeaders usa o mesmo id e CSRF).
      await insert(client, "auth_sessions", {
        id: `crud-smoke-session-${id}`,
        user_id: id,
        csrf_hash: createHash("sha256").update(SMOKE_CSRF_TOKEN).digest("hex"),
        expires_at: new Date(Date.now() + 7 * 24 * 3600_000),
      });
    }
  } finally {
    await client.end();
  }
  return { organizationId, departmentId, ownerId, userId };
}

/**
 * O `db push` não cria o papel `giro_user_runtime` nem os GRANTs das migrations. Os Workers
 * fazem `SET LOCAL ROLE "giro_user_runtime"` (RLS da triagem/contábil), então sem isso o smoke
 * não vê os `permission denied` de produção. Aplica os GRANT ON TABLE na ordem das migrations;
 * os de schema/função (app_private) dependem de objetos que o push não cria.
 */
async function grantRuntimeRole(databaseUrl) {
  const migrationsDir = join(repoRoot, "infra", "prisma", "migrations");
  const grants = readdirSync(migrationsDir)
    .filter((entry) => entry !== "migration_lock.toml")
    .sort()
    .flatMap((entry) => {
      const file = join(migrationsDir, entry, "migration.sql");
      if (!existsSync(file)) return [];
      return [
        ...readFileSync(file, "utf8").matchAll(
          /^\s*(GRANT\s+[A-Z, ]+\s+ON\s+TABLE\s+[^;]+\s+TO\s+giro_user_runtime);/gimu,
        ),
      ].map(([, statement]) => statement);
    });
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'giro_user_runtime') THEN
        CREATE ROLE giro_user_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      END IF;
    END $$`);
    for (const statement of grants) await client.query(statement);
  } finally {
    await client.end();
  }
  console.log(`   giro_user_runtime + ${grants.length} GRANTs das migrations`);
}

async function up() {
  if (existsSync(statePath)) {
    throw new Error(`Já existe ${statePath}; rode "down" antes.`);
  }
  requireDocker();
  const runId = newRunId();
  const { container, databaseUrl } = await startPostgres({ runId, image: "postgres:17-alpine" });
  try {
    // O schema usa gin_trgm_ops (índice de audit_requests.path). O pg_isready responde
    // durante o init do entrypoint, que reinicia o servidor; por isso o retry.
    for (let attempt = 0; ; attempt += 1) {
      const result = run("docker", [
        "exec",
        container,
        "psql",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-c",
        "create extension if not exists pg_trgm",
      ]);
      if (result.status === 0) break;
      if (attempt >= 30) throw new Error(`pg_trgm: ${result.stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    runOrThrow("pnpm", ["exec", "prisma", "db", "push", "--schema", "prisma/schema.prisma"], {
      cwd: join(repoRoot, "infra"),
      env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    });
    await grantRuntimeRole(databaseUrl);
    const ids = await seed(databaseUrl);
    writeFileSync(statePath, JSON.stringify({ container, databaseUrl, ...ids }, null, 2));
    console.log(`ok crud smoke db: ${container}`);
    console.log(`   estado em ${statePath}`);
  } catch (error) {
    removePostgres(container);
    throw error;
  }
}

function down() {
  if (!existsSync(statePath)) {
    console.log("nada a remover");
    return;
  }
  const { container } = JSON.parse(readFileSync(statePath, "utf8"));
  removePostgres(container);
  rmSync(statePath);
  console.log(`removido ${container}`);
}

const command = process.argv[2];
if (command === "up") await up();
else if (command === "down") down();
else {
  console.error("uso: crud-db.mjs up|down");
  process.exit(1);
}
