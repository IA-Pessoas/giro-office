import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../../../infra/prisma/migrations/20260731120000_add_ti_term_signed_at/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("TI term signature migration", () => {
  it("models signed_at as the lifecycle field and indexes it", () => {
    const model = schema.slice(
      schema.indexOf("model TermTecnologia"),
      schema.indexOf("model TIRequest"),
    );

    expect(model).toMatch(/signed_at\s+DateTime\?/);
    expect(model).toContain(
      '@@index([organization_id, signed_at], map: "idx_tecnologia_terms_org_signed_at")',
    );
    expect(model).not.toMatch(/@@index\(\[organization_id, reason\]/);
  });

  it("backfills legacy non-empty reasons without making reason the status source", () => {
    expect(migration).toContain('ADD COLUMN "signed_at" TIMESTAMP(3)');
    expect(migration).toContain('SET "signed_at" = "date"');
    expect(migration).toContain('"reason" IS NOT NULL');
    expect(migration).toContain("btrim(\"reason\") <> ''");
    expect(migration).toContain('CREATE INDEX "idx_tecnologia_terms_org_signed_at"');
    expect(migration).toContain('DROP INDEX IF EXISTS "idx_tecnologia_terms_org_reason"');
  });
});
