import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const requireFromInfra = createRequire(new URL("../../../package.json", import.meta.url));
const requireFromPrisma = createRequire(requireFromInfra.resolve("prisma/package.json"));
const requireFromPrismaDev = createRequire(requireFromPrisma.resolve("@prisma/dev"));
const { PGlite } = requireFromPrismaDev("@electric-sql/pglite");
const migrationUrl = new URL(
  "../../migrations/20260923140000_add_auth_session_impersonator_platform_user_id/migration.sql",
  import.meta.url,
);

test("adds a nullable operator reference with a foreign key to auth sessions", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE public.platform_users (id TEXT PRIMARY KEY);
    CREATE TABLE public.users (id TEXT PRIMARY KEY);
    CREATE TABLE public.auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES public.users(id),
      csrf_hash TEXT NOT NULL,
      expires_at TIMESTAMP(3) NOT NULL,
      revoked_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL
    );
    INSERT INTO public.users (id) VALUES ('target-user');
    INSERT INTO public.platform_users (id) VALUES ('operator');
  `);

  await db.exec(readFileSync(migrationUrl, "utf8"));
  await db.exec(`
    INSERT INTO public.auth_sessions (id, user_id, csrf_hash, expires_at, updated_at)
    VALUES ('ordinary-session', 'target-user', 'hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    INSERT INTO public.auth_sessions (
      id, user_id, impersonator_platform_user_id, csrf_hash, expires_at, updated_at
    ) VALUES (
      'impersonation-session', 'target-user', 'operator', 'hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  `);

  const { rows } = await db.query(
    "SELECT id, impersonator_platform_user_id FROM public.auth_sessions ORDER BY id",
  );
  assert.deepEqual(rows, [
    { id: "impersonation-session", impersonator_platform_user_id: "operator" },
    { id: "ordinary-session", impersonator_platform_user_id: null },
  ]);
  await assert.rejects(
    db.exec(`
      INSERT INTO public.auth_sessions (
        id, user_id, impersonator_platform_user_id, csrf_hash, expires_at, updated_at
      ) VALUES (
        'orphan-session', 'target-user', 'missing-operator', 'hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
    `),
  );
});
