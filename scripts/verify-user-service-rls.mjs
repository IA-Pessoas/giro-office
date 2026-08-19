#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const RUNTIME_ROLE = "giro_user_runtime";

export async function runCli({ argv = process.argv.slice(2), dependencies = {} } = {}) {
  const options = parseOptions(argv);
  const runtime = { createClient, randomBytes, randomUUID, ...dependencies };
  const adminClient = await runtime.createClient(options.adminDatabaseUrl);
  let runtimeClient;
  let temporaryRole;
  let seedTransactionOpen = false;

  try {
    await verifyRuntimeRole(adminClient);
    await verifyCryptFunction(adminClient);
    temporaryRole = createTemporaryRole(runtime.randomBytes);
    await createTemporaryLoginRole(adminClient, temporaryRole);
    await adminClient.query(`GRANT ${quoteIdentifier(temporaryRole.name)} TO CURRENT_USER`);

    runtimeClient = await runtime.createClient(
      createRuntimeDatabaseUrl(options.adminDatabaseUrl, temporaryRole),
    );
    await verifyTemporaryLoginConnection(runtimeClient, temporaryRole.name);
    await verifyConnectionReuse(runtimeClient);

    await adminClient.query("BEGIN");
    seedTransactionOpen = true;
    const seed = await seedTenants(adminClient, runtime.randomUUID);
    await adminClient.query(`SET LOCAL ROLE ${quoteIdentifier(temporaryRole.name)}`);
    await verifyTemporaryRole(adminClient, temporaryRole.name);
    await verifyMissingContext(adminClient);
    await verifyOwnTenantAccess(adminClient, seed.tenantA);
    await verifyCrossTenantIsolation(adminClient, seed.tenantB);
    await verifyLogin(adminClient, seed);
    await verifyLogInsert(adminClient, seed);
  } finally {
    try {
      if (seedTransactionOpen) await adminClient.query("ROLLBACK");
    } finally {
      try {
        if (runtimeClient) await runtimeClient.end();
      } finally {
        try {
          if (temporaryRole) {
            await adminClient.query(
              `REVOKE ${quoteIdentifier(temporaryRole.name)} FROM CURRENT_USER`,
            );
            await adminClient.query(`DROP ROLE ${quoteIdentifier(temporaryRole.name)}`);
          }
        } finally {
          await adminClient.end();
        }
      }
    }
  }
}

export function parseOptions(argv) {
  if (argv.length !== 2 || argv[0] !== "--admin-database-url") {
    throw new Error("Use somente --admin-database-url <url-postgresql>.");
  }

  return { adminDatabaseUrl: parseDatabaseUrl(argv[1], "--admin-database-url") };
}

export function createRuntimeDatabaseUrl(adminDatabaseUrl, temporaryRole) {
  const url = new URL(adminDatabaseUrl);
  const projectRef =
    url.hostname.endsWith(".pooler.supabase.com") && url.username.includes(".")
      ? url.username.slice(url.username.indexOf(".") + 1)
      : undefined;
  url.username = projectRef ? `${temporaryRole.name}.${projectRef}` : temporaryRole.name;
  url.password = temporaryRole.password;
  return url.toString();
}

function createTemporaryRole(randomBytesFactory) {
  return {
    name: `giro_user_verify_${randomBytesFactory(10).toString("hex")}`,
    password: randomBytesFactory(32).toString("base64url"),
  };
}

async function verifyRuntimeRole(client) {
  const result = await client.query(
    "SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = $1",
    [RUNTIME_ROLE],
  );
  const role = result.rows[0];
  if (!role || role.rolcanlogin || role.rolbypassrls) {
    throw new Error("A role runtime deve existir, ser NOLOGIN e não ter BYPASSRLS.");
  }
}

async function createTemporaryLoginRole(client, role) {
  await client.query(
    `CREATE ROLE ${quoteIdentifier(role.name)} LOGIN INHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${quoteLiteral(role.password)} IN ROLE ${RUNTIME_ROLE}`,
  );
}

async function verifyCryptFunction(client) {
  const result = await client.query(
    "SELECT to_regprocedure('extensions.crypt(text,text)') AS crypt_function",
  );
  if (!result.rows[0]?.crypt_function) {
    throw new Error(
      "A função extensions.crypt(text,text) é obrigatória antes da verificação de RLS.",
    );
  }
}

async function verifyConnectionReuse(client) {
  await inTransaction(client, async () => {
    await client.query("SELECT set_config('app.organization_id', $1, true)", ["verification-only"]);
  });

  const result = await inTransaction(client, async () => {
    return await client.query("SELECT current_setting('app.organization_id', true) AS value");
  });
  if (result.rows[0]?.value === "verification-only") {
    throw new Error("O contexto tenant vazou após o commit em uma conexão reutilizada.");
  }
}

async function verifyTemporaryLoginConnection(client, roleName) {
  const identity = await client.query(
    "SELECT current_user AS role_name, pg_has_role(current_user, $1, 'member') AS is_runtime_member",
    [RUNTIME_ROLE],
  );
  if (identity.rows[0]?.role_name !== roleName || identity.rows[0]?.is_runtime_member !== true) {
    throw new Error(
      "A conexão não autenticou como a role LOGIN temporária membro da role runtime.",
    );
  }

  const denied = await client.query("SELECT count(*)::int AS count FROM public.users");
  if (denied.rows[0]?.count !== 0) {
    throw new Error("A conexão LOGIN temporária acessou users sem contexto tenant.");
  }
}

async function seedTenants(client, randomUuid) {
  const suffix = randomUuid().replaceAll("-", "");
  const tenantA = `rls-tenant-a-${suffix}`;
  const tenantB = `rls-tenant-b-${suffix}`;
  const departmentA = `rls-department-a-${suffix}`;
  const departmentB = `rls-department-b-${suffix}`;
  const userA = `rls-user-a-${suffix}`;
  const userB = `rls-user-b-${suffix}`;
  const login = `rls-${suffix}@invalid.local`;
  const password = `verify-${suffix}`;

  for (const [id, name, slug, cnpj, email] of [
    [
      tenantA,
      "RLS verification tenant A",
      `rls-a-${suffix}`,
      `9${suffix.slice(0, 13)}`,
      `a-${suffix}@invalid.local`,
    ],
    [
      tenantB,
      "RLS verification tenant B",
      `rls-b-${suffix}`,
      `8${suffix.slice(0, 13)}`,
      `b-${suffix}@invalid.local`,
    ],
  ]) {
    await client.query(
      "INSERT INTO public.organizations (id, name, slug, cnpj, email_created_by, updated_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)",
      [id, name, slug, cnpj, email],
    );
  }

  for (const [id, name, organizationId] of [
    [departmentA, "RLS verification department A", tenantA],
    [departmentB, "RLS verification department B", tenantB],
  ]) {
    await client.query(
      "INSERT INTO public.departments (id, name, color, status, organization_id) VALUES ($1, $2, '#000000', 'active', $3)",
      [id, name, organizationId],
    );
  }

  await client.query(
    "INSERT INTO public.users (id, name, login, password, permission, status, department_id, organization_id) VALUES ($1, $2, $3, extensions.crypt($4, extensions.gen_salt('bf', 8)), 3, 'active', $5, $6)",
    [userA, "RLS verification user A", login, password, departmentA, tenantA],
  );
  await client.query(
    "INSERT INTO public.users (id, name, login, password, permission, status, department_id, organization_id) VALUES ($1, $2, $3, extensions.crypt($4, extensions.gen_salt('bf', 8)), 3, 'active', $5, $6)",
    [
      userB,
      "RLS verification user B",
      `rls-b-${suffix}@invalid.local`,
      password,
      departmentB,
      tenantB,
    ],
  );
  await client.query(
    "INSERT INTO public.permissions (id, user_id, organization_id) VALUES ($1, $2, $3)",
    [`rls-permission-a-${suffix}`, userA, tenantA],
  );

  return { tenantA, tenantB, userA, login, password, suffix };
}

async function verifyTemporaryRole(client, roleName) {
  const result = await client.query("SELECT current_user AS role_name");
  if (result.rows[0]?.role_name !== roleName) {
    throw new Error("A sessão de verificação não assumiu a role LOGIN temporária.");
  }
}

async function verifyMissingContext(client) {
  const result = await client.query("SELECT count(*)::int AS count FROM public.users");
  if (result.rows[0]?.count !== 0) {
    throw new Error("A role runtime acessou users sem contexto tenant.");
  }
}

async function verifyOwnTenantAccess(client, tenantA) {
  await client.query("SELECT set_config('app.organization_id', $1, true)", [tenantA]);
  const result = await client.query("SELECT count(*)::int AS count FROM public.users");
  if ((result.rows[0]?.count ?? 0) < 1) {
    throw new Error("A role runtime não acessou dados do próprio tenant.");
  }
}

async function verifyCrossTenantIsolation(client, tenantB) {
  const result = await client.query(
    "SELECT count(*)::int AS count FROM public.users WHERE organization_id = $1",
    [tenantB],
  );
  if (result.rows[0]?.count !== 0) {
    throw new Error("A role runtime acessou dados de outro tenant.");
  }
}

async function verifyLogin(client, seed) {
  const valid = await client.query(
    "SELECT organization_id FROM app_private.login_session($1, $2)",
    [seed.login, seed.password],
  );
  if (valid.rowCount !== 1 || valid.rows[0]?.organization_id !== seed.tenantA) {
    throw new Error("A função de login não retornou a sessão do tenant esperado.");
  }

  const invalid = await client.query(
    "SELECT organization_id FROM app_private.login_session($1, $2)",
    [seed.login, "senha-incorreta"],
  );
  if (invalid.rowCount !== 0) {
    throw new Error("A função de login aceitou uma senha inválida.");
  }
}

async function verifyLogInsert(client, seed) {
  const result = await client.query(
    "INSERT INTO public.logs (id, user_id, action, referring, referring_id, changes, organization_id) VALUES ($1, $2, 'rls.verify', 'rls.verify', $3, '{}'::jsonb, $4)",
    [`rls-log-${seed.suffix}`, seed.userA, seed.userA, seed.tenantA],
  );
  if (result.rowCount !== 1)
    throw new Error("A role runtime não conseguiu inserir logs do próprio tenant.");
}

async function inTransaction(client, callback) {
  await client.query("BEGIN");
  try {
    const result = await callback();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function parseDatabaseUrl(value, flag) {
  const url = new URL(value);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol) || !url.hostname) {
    throw new Error(`${flag} deve ser uma URL PostgreSQL válida.`);
  }
  return value;
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Identificador PostgreSQL inválido.");
  return `"${value}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function createClient(databaseUrl) {
  const require = createRequire(new URL("../services/src/package.json", import.meta.url));
  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

if (import.meta.main) {
  runCli()
    .then(() =>
      process.stdout.write("Verificação de RLS do user-service concluída sem persistir dados.\n"),
    )
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
