import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const requireFromInfra = createRequire(new URL("../../../package.json", import.meta.url));
const requireFromPrisma = createRequire(requireFromInfra.resolve("prisma/package.json"));
const requireFromPrismaDev = createRequire(requireFromPrisma.resolve("@prisma/dev"));
const { PGlite } = requireFromPrismaDev("@electric-sql/pglite");
const migrationUrl = new URL(
  "../../migrations/20261014002000_score_formula_version/migration.sql",
  import.meta.url,
);

test("versions historical scores without changing results and defaults new scores to legacy", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  await db.exec(`
    CREATE TABLE "rh.score" (
      id TEXT PRIMARY KEY,
      final_score DOUBLE PRECISION NOT NULL
    );
    INSERT INTO "rh.score" (id, final_score) VALUES
      ('calculated', 7.25),
      ('pending', 0);
  `);
  await db.exec(readFileSync(migrationUrl, "utf8"));

  const historical = await db.query(
    'SELECT id, final_score, formula_version FROM "rh.score" ORDER BY id',
  );
  assert.deepEqual(historical.rows, [
    { id: "calculated", final_score: 7.25, formula_version: "OfficeV1" },
    { id: "pending", final_score: 0, formula_version: "OfficeV1" },
  ]);

  await db.exec('INSERT INTO "rh.score" (id, final_score) VALUES (\'new\', 0)');
  const created = await db.query(
    'SELECT formula_version FROM "rh.score" WHERE id = \'new\'',
  );
  assert.deepEqual(created.rows, [{ formula_version: "LegacyV1" }]);
});
