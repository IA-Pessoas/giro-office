import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrations = [
  "20260916120000_triage_closings",
  "20260916130000_contabil_monthly_operations",
] as const;

describe("migrations contábeis", () => {
  it("usa os nomes de tabela mapeados pelo Prisma", () => {
    for (const migration of migrations) {
      const source = readFileSync(
        new URL(`../../../../infra/prisma/migrations/${migration}/migration.sql`, import.meta.url),
        "utf8",
      );

      expect(source).not.toMatch(/"(?:contabil|triagem)"\."/);
    }
  });
});
