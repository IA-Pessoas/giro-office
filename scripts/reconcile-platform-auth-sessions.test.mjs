import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

// Reuse the in-memory Postgres shipped with the pinned Prisma CLI. No .env or network.
const requireFromInfra = createRequire(new URL("../infra/package.json", import.meta.url));
const requireFromPrisma = createRequire(requireFromInfra.resolve("prisma/package.json"));
const requireFromPrismaDev = createRequire(requireFromPrisma.resolve("@prisma/dev"));
const { PGlite } = requireFromPrismaDev("@electric-sql/pglite");
const originalSql = readFileSync(
  new URL(
    "../infra/prisma/migrations/20260821200000_add_platform_auth_sessions/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
// Override only for the RED/mutation check: the supplied SQL still runs exclusively in memory.
const repairSql = readFileSync(
  process.env.SUPER_ADMIN_REPAIR_SQL ??
    new URL("../infra/prisma/repairs/reconcile-platform-auth-sessions.sql", import.meta.url),
  "utf8",
);

const legacySql = `
  CREATE TYPE public."PlatformRole" AS ENUM ('super_admin');
  CREATE TYPE public."SupportSessionStatus" AS ENUM ('active', 'closed', 'expired');
  CREATE TABLE public.platform_users (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    platform_role public."PlatformRole" NOT NULL DEFAULT 'super_admin',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL
  );
  CREATE UNIQUE INDEX platform_users_email_key ON public.platform_users(email);
  CREATE TABLE public.organizations (id TEXT PRIMARY KEY);
  CREATE TABLE public.platform_support_sessions (
    id TEXT NOT NULL PRIMARY KEY,
    platform_user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status public."SupportSessionStatus" NOT NULL DEFAULT 'active',
    started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP(3) NOT NULL,
    ended_at TIMESTAMP(3),
    CONSTRAINT platform_support_sessions_platform_user_id_fkey
      FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id)
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT platform_support_sessions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
  );
  INSERT INTO public.platform_users (id, name, email, password, updated_at)
    VALUES ('admin-fixture', 'Fixture', 'fixture@example.test', 'fixture-only', '2026-08-20');
  INSERT INTO public.organizations VALUES ('org-fixture');
  INSERT INTO public.platform_support_sessions
    (id, platform_user_id, organization_id, reason, expires_at)
    VALUES ('support-fixture', 'admin-fixture', 'org-fixture', 'fixture', '2026-08-27');
`;

async function database(t, sql = legacySql) {
  const db = new PGlite();
  t.after(() => db.close());
  if (sql) await db.exec(sql);
  return db;
}

async function schema(db) {
  return (
    await db.query(`
      SELECT c.relname AS table_name, a.attname AS column_name,
        format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
        pg_get_expr(d.adbin, d.adrelid) AS default_expression
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relname IN ('platform_users', 'platform_auth_sessions')
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attname
    `)
  ).rows;
}

async function indexes(db) {
  return (
    await db.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('platform_users', 'platform_auth_sessions')
      ORDER BY indexname
    `)
  ).rows;
}

test("reconciles the legacy schema without replacing users or support dependencies", async (t) => {
  const db = await database(t);
  const clean = await database(t, originalSql);
  const beforeUsers = (await db.query("SELECT to_jsonb(u) AS row FROM platform_users u")).rows;
  const beforeSupport = (await db.query("SELECT * FROM platform_support_sessions")).rows;
  const beforeOid = (await db.query("SELECT 'public.platform_users'::regclass::oid AS oid")).rows;
  await db.exec(repairSql);

  assert.deepEqual(await schema(db), await schema(clean));
  assert.deepEqual(await indexes(db), await indexes(clean));
  assert.deepEqual(
    (await db.query("SELECT to_jsonb(u) - 'session_version' AS row FROM platform_users u")).rows,
    beforeUsers,
  );
  assert.deepEqual((await db.query("SELECT * FROM platform_support_sessions")).rows, beforeSupport);
  assert.deepEqual(
    (await db.query("SELECT 'public.platform_users'::regclass::oid AS oid")).rows,
    beforeOid,
  );
  assert.deepEqual((await db.query("SELECT session_version FROM platform_users")).rows, [
    { session_version: 0 },
  ]);
  await db.exec(`INSERT INTO platform_auth_sessions (id, platform_user_id, csrf_hash, expires_at)
    VALUES ('session-fixture', 'admin-fixture', 'fixture-only', '2026-08-27')`);
  assert.equal(
    (await db.query("SELECT revoked_at FROM platform_auth_sessions")).rows[0].revoked_at,
    null,
  );
  await assert.rejects(db.exec("DELETE FROM platform_users WHERE id = 'admin-fixture'"), {
    code: "23503",
  });
  await assert.rejects(
    db.exec(`INSERT INTO platform_auth_sessions (id, platform_user_id, csrf_hash, expires_at)
      VALUES ('orphan', 'missing-admin', 'fixture-only', '2026-08-27')`),
    { code: "23503" },
  );
  // Exercise the new FK's cascade only in the synthetic database, after checking legacy RESTRICT.
  await db.exec("DELETE FROM platform_support_sessions; DELETE FROM platform_users");
  assert.equal(
    (await db.query("SELECT count(*)::int AS count FROM platform_auth_sessions")).rows[0].count,
    0,
  );
});

test("rejects reapplication without resetting session versions or existing sessions", async (t) => {
  const db = await database(t);
  await db.exec(repairSql);
  await db.exec(`UPDATE platform_users SET session_version = 7;
    INSERT INTO platform_auth_sessions (id, platform_user_id, csrf_hash, expires_at)
    VALUES ('session-fixture', 'admin-fixture', 'fixture-only', '2026-08-27')`);
  const before = await schema(db);
  await assert.rejects(db.exec(repairSql), /already|already reconciled|legacy/i);
  await db.exec("ROLLBACK");
  assert.deepEqual(await schema(db), before);
  assert.equal(
    (await db.query("SELECT session_version FROM platform_users")).rows[0].session_version,
    7,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS count FROM platform_auth_sessions")).rows[0].count,
    1,
  );
});

for (const [name, drift] of [
  ["an unexpected enum value", "ALTER TYPE public.\"PlatformRole\" ADD VALUE 'other'"],
  ["a nullable password", "ALTER TABLE platform_users ALTER COLUMN password DROP NOT NULL"],
  ["a missing email uniqueness constraint", "DROP INDEX platform_users_email_key"],
]) {
  test(`rejects ${name} before changing the legacy schema`, async (t) => {
    const db = await database(t);
    await db.exec(drift);
    const before = await schema(db);
    await assert.rejects(db.exec(repairSql), /legacy|incompatible/i);
    await db.exec("ROLLBACK");
    assert.deepEqual(await schema(db), before);
  });
}

test("rolls back the added column and table if a later index creation fails", async (t) => {
  const db = await database(t);
  await db.exec("CREATE TABLE public.idx_platform_auth_sessions_expiry (id integer)");
  const before = await schema(db);
  await assert.rejects(db.exec(repairSql), { code: "42P07" });
  await db.exec("ROLLBACK");
  assert.deepEqual(await schema(db), before);
});

test("keeps new auth sessions private even when default grants expose public tables", async (t) => {
  const db = await database(t);
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, PUBLIC`);
  await db.exec(repairSql);
  assert.equal(
    (
      await db.query(
        "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.platform_auth_sessions'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(db.query("SELECT * FROM public.platform_auth_sessions"), {
        code: "42501",
      });
    } finally {
      await db.exec("RESET ROLE");
    }
  }
});
