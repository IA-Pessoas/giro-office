import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../../../infra/prisma/migrations/20260824150000_add_audit_requests_path_trigram_index/migration.sql",
  import.meta.url,
);

describe("audit path search migration", () => {
  it("installs a trigram GIN index compatible with case-insensitive substring search", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toMatch(/CREATE EXTENSION IF NOT EXISTS "?pg_trgm"?/i);
    expect(migration).toMatch(
      /CREATE INDEX "idx_audit_requests_path_trgm"[\s\S]*USING GIN \("path" gin_trgm_ops\)/i,
    );
  });
});
