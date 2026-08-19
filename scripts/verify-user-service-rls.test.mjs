import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const SCRIPT_URL = new URL("./verify-user-service-rls.mjs", import.meta.url);
const LOGIN_MIGRATION_URL = new URL(
  "../infra/prisma/migrations/20260819150000_user_service_tenant_rls/migration.sql",
  import.meta.url,
);

test("verificador de RLS exige somente a URL administrativa", async () => {
  assert.equal(existsSync(SCRIPT_URL), true, "o verificador de integração deve existir");
  const { parseOptions } = await import("./verify-user-service-rls.mjs");

  assert.deepEqual(
    parseOptions(["--admin-database-url", "postgresql://admin:secret@db.example/test"]),
    {
      adminDatabaseUrl: "postgresql://admin:secret@db.example/test",
    },
  );
  assert.throws(
    () => parseOptions(["--runtime-database-url", "postgresql://runtime:secret@db.example/test"]),
    /somente --admin-database-url/,
  );
});

test("URL da role temporária substitui as credenciais administrativas", async () => {
  const { createRuntimeDatabaseUrl } = await import("./verify-user-service-rls.mjs");
  const url = new URL(
    createRuntimeDatabaseUrl("postgresql://admin:admin-secret@db.example/test", {
      name: "giro_user_verify_abc",
      password: "runtime-secret",
    }),
  );

  assert.equal(url.username, "giro_user_verify_abc");
  assert.equal(url.password, "runtime-secret");
  assert.equal(url.hostname, "db.example");
});

test("URL temporária preserva o project ref no pooler do Supabase", async () => {
  const { createRuntimeDatabaseUrl } = await import("./verify-user-service-rls.mjs");
  const url = new URL(
    createRuntimeDatabaseUrl(
      "postgresql://postgres.projectref:admin-secret@aws-1-us-east-1.pooler.supabase.com:5432/postgres",
      { name: "giro_user_verify_abc", password: "runtime-secret" },
    ),
  );

  assert.equal(url.username, "giro_user_verify_abc.projectref");
  assert.equal(url.password, "runtime-secret");
});

test("login SQL usa bcrypt dummy quando não há candidato", () => {
  const migration = readFileSync(LOGIN_MIGRATION_URL, "utf8");

  assert.match(migration, /WITH candidate AS/);
  assert.match(
    migration,
    /extensions\.crypt\(\s*p_password,\s*COALESCE\(candidate\.password, '\$2b\$08\$C6UzMDM\.H6dfI\/f\/IKcEe\.7V0uJEv1cFYzn2rD6bFSbx2D9x8cT9G'\)/,
  );
  assert.match(
    migration,
    /FROM \(VALUES \(1\)\) AS request\(value\)\s+LEFT JOIN candidate ON true/,
  );
  assert.match(migration, /AND password_check\.valid;/);
});

test("verificador cria role efêmera e reverte todo seed", async () => {
  const { runCli } = await import("./verify-user-service-rls.mjs");
  const roleName = "giro_user_verify_01010101010101010101";
  let tenantA;
  let adminHasContext = false;
  const adminQueries = [];
  const runtimeQueries = [];
  const adminClient = {
    async query(query, parameters = []) {
      adminQueries.push(String(query));
      const sql = String(query);
      if (sql.startsWith("SELECT rolcanlogin")) {
        return { rows: [{ rolcanlogin: false, rolbypassrls: false }] };
      }
      if (sql.startsWith("SELECT to_regprocedure")) {
        return { rows: [{ crypt_function: "extensions.crypt(text,text)" }] };
      }
      if (sql.startsWith("INSERT INTO public.organizations")) {
        tenantA ??= parameters[0];
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("SELECT set_config")) {
        adminHasContext = true;
        return { rows: [] };
      }
      if (sql === "SELECT current_user AS role_name") {
        return { rows: [{ role_name: roleName }] };
      }
      if (sql === "SELECT count(*)::int AS count FROM public.users") {
        return { rows: [{ count: adminHasContext ? 1 : 0 }] };
      }
      if (sql.includes("WHERE organization_id = $1")) return { rows: [{ count: 0 }] };
      if (sql.startsWith("SELECT organization_id FROM app_private.login_session")) {
        return parameters[1] === "senha-incorreta"
          ? { rows: [], rowCount: 0 }
          : { rows: [{ organization_id: tenantA }], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO public.logs")) return { rows: [{ id: "log" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    async end() {},
  };
  const runtimeClient = {
    async query(query) {
      runtimeQueries.push(String(query));
      const sql = String(query);
      if (sql.startsWith("SELECT current_user")) {
        return { rows: [{ role_name: roleName, is_runtime_member: true }] };
      }
      if (sql === "SELECT count(*)::int AS count FROM public.users") {
        return { rows: [{ count: 0 }] };
      }
      if (sql.startsWith("SELECT current_setting")) return { rows: [{ value: null }] };
      return { rows: [], rowCount: 0 };
    },
    async end() {},
  };
  let createdClients = 0;

  await runCli({
    argv: ["--admin-database-url", "postgresql://admin:secret@db.example/test"],
    dependencies: {
      createClient: async () => (createdClients++ === 0 ? adminClient : runtimeClient),
      randomBytes: (size) => Buffer.alloc(size, 1),
      randomUUID: () => "12345678-1234-1234-1234-123456789012",
    },
  });

  assert.equal(createdClients, 2);
  assert.match(
    adminQueries.find((query) => query.startsWith("CREATE ROLE")),
    /LOGIN INHERIT NOBYPASSRLS .* IN ROLE giro_user_runtime/,
  );
  assert.equal(
    adminQueries.some((query) => query.startsWith('GRANT "giro_user_verify_')),
    true,
  );
  assert.equal(
    adminQueries.includes(
      "SELECT to_regprocedure('extensions.crypt(text,text)') AS crypt_function",
    ),
    true,
  );
  assert.equal(adminQueries.includes("ROLLBACK"), true);
  assert.equal(adminQueries.includes("COMMIT"), false);
  assert.equal(
    adminQueries.some((query) => query.startsWith("DROP ROLE")),
    true,
  );
  assert.equal(
    adminQueries.some((query) => query.startsWith('REVOKE "giro_user_verify_')),
    true,
  );
  assert.equal(
    runtimeQueries.includes("SELECT current_setting('app.organization_id', true) AS value"),
    true,
  );
  assert.match(
    adminQueries.find((query) => query.startsWith("INSERT INTO public.organizations")),
    /updated_at/,
  );
});
