import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const requireFromInfra = createRequire(new URL("../../../package.json", import.meta.url));
const requireFromPrisma = createRequire(requireFromInfra.resolve("prisma/package.json"));
const requireFromPrismaDev = createRequire(requireFromPrisma.resolve("@prisma/dev"));
const { PGlite } = requireFromPrismaDev("@electric-sql/pglite");
const migrationUrl = new URL(
  "../../migrations/20260923130000_add_platform_user_impersonation_permission/migration.sql",
  import.meta.url,
);

async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE public.platform_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL
    );
  `);
  return db;
}

async function migrate(db) {
  await db.exec(readFileSync(migrationUrl, "utf8"));
}

test("grants permission to existing initial admin and defaults other admins to false", async (t) => {
  const db = await database(t);
  await db.exec(`
    INSERT INTO public.platform_users (id, email) VALUES
      ('initial-admin', 'eed.jrr@gmail.com'),
      ('other-admin', 'other@example.com');
  `);

  await migrate(db);

  const { rows } = await db.query(
    "SELECT email, can_impersonate FROM public.platform_users ORDER BY email",
  );
  assert.deepEqual(rows, [
    { email: "eed.jrr@gmail.com", can_impersonate: true },
    { email: "other@example.com", can_impersonate: false },
  ]);
});

test("runs without the designated initial admin", async (t) => {
  const db = await database(t);
  await db.exec("INSERT INTO public.platform_users (id, email) VALUES ('other-admin', 'other@example.com')");

  await migrate(db);

  const { rows } = await db.query("SELECT can_impersonate FROM public.platform_users");
  assert.deepEqual(rows, [{ can_impersonate: false }]);
});
