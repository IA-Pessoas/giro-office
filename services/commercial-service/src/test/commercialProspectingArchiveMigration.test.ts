import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migrationUrl = new URL(
  "../../../../infra/prisma/migrations/20260915120000_commercial_prospecting_archive/migration.sql",
  import.meta.url,
);

describe("commercial prospecting archive migration", () => {
  it("persiste o estado arquivado sem alterar a unicidade por organização e cliente", () => {
    const model = schema.slice(
      schema.indexOf("model CommercialProspecting"),
      schema.indexOf("model CommercialTaskBilling"),
    );

    expect(model).toMatch(/archived_at\s+DateTime\?/);
    expect(model).toContain(
      '@@unique([organization_id, client_id], map: "uq_commercial_prospecting_org_client")',
    );
  });

  it("adiciona a coluna e o índice para listagens ativas", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    const migration = readFileSync(migrationUrl, "utf8");

    expect(migration).toContain('ADD COLUMN "archived_at" TIMESTAMP(3)');
    expect(migration).toContain('CREATE INDEX "idx_commercial_prospecting_org_archived_updated"');
    expect(migration).not.toMatch(
      /DROP TABLE|DELETE FROM|DROP INDEX.*uq_commercial_prospecting_org_client/s,
    );
  });
});
