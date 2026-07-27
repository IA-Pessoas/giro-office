import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../../../", import.meta.url);
const schemaUrl = new URL("infra/prisma/schema.prisma", repositoryRoot);
const migrationsUrl = new URL("infra/prisma/migrations/", repositoryRoot);

describe("restricao de exclusao de sindicato", () => {
  it("declara a relacao Payroll para sindicato com onDelete Restrict", async () => {
    const schema = await readFile(schemaUrl, "utf8");

    expect(schema).toMatch(
      /union\s+UnionPessoal\?\s+@relation\(fields: \[union_id\], references: \[id\], onDelete: Restrict\)/,
    );
  });

  it("migra a FK de folha para ON DELETE RESTRICT", async () => {
    const entries = await readdir(migrationsUrl, { withFileTypes: true });
    const migrationSql = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          readFile(new URL(`${entry.name}/migration.sql`, migrationsUrl), "utf8").catch(() => ""),
        ),
    );
    const combinedSql = migrationSql.join("\n");

    expect(combinedSql).toMatch(
      /DROP CONSTRAINT "pessoal\.payroll_union_id_fkey"[\s\S]*ADD CONSTRAINT "pessoal\.payroll_union_id_fkey"[\s\S]*ON DELETE RESTRICT ON UPDATE CASCADE/,
    );
  });
});
