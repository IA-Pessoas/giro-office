import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../../../../infra/prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../../../infra/prisma/migrations/20260727103000_add_ti_password_deactivation/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("TI password deactivation migration", () => {
  it("models lifecycle fields and the approved index", () => {
    const model = schema.slice(
      schema.indexOf("model PasswordTecnologia"),
      schema.indexOf("model ExtensionsTecnologia"),
    );

    expect(model).toMatch(/active\s+Boolean\s+@default\(true\)/);
    expect(model).toMatch(/deactivated_at\s+DateTime\?/);
    expect(model).toMatch(/deactivated_by_user_id\s+String\?/);
    expect(model).toMatch(/deactivation_reason\s+String\?/);
    expect(model).toContain(
      '@@index([organization_id, active, local], map: "idx_tecnologia_passwords_org_active_local")',
    );
    expect(model).not.toMatch(/deactivated_by_user\s+User/);
  });

  it("adds an additive default, complete invariant, and physical index", () => {
    expect(migration).toContain('"active" BOOLEAN NOT NULL DEFAULT true');
    expect(migration).toContain('"deactivated_at" TIMESTAMP(3)');
    expect(migration).toContain('"deactivated_by_user_id" TEXT');
    expect(migration).toContain('"deactivation_reason" TEXT');
    expect(migration).toContain('CONSTRAINT "ck_tecnologia_passwords_deactivation"');
    expect(migration).toContain('"deactivation_reason" = btrim("deactivation_reason")');
    expect(migration).toContain('length("deactivation_reason") BETWEEN 1 AND 500');
    expect(migration).toContain('CREATE INDEX "idx_tecnologia_passwords_org_active_local"');
    expect(migration).toContain(
      'ON "tecnologia.passwords_users"("organization_id", "active", "local")',
    );
    expect(migration).not.toMatch(/FOREIGN KEY \("deactivated_by_user_id"\)/);
  });
});
