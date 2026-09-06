import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unicidade atômica de tarefas ativas", () => {
  it("a migration protege organização, projeto e modelo apenas nos status ativos", () => {
    const migration = readFileSync(
      new URL(
        "../../../../infra/prisma/migrations/20260906194000_enforce_active_task_model_uniqueness/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "uq_tasks_active_org_project_model"/,
    );
    expect(migration).toMatch(
      /ON "integracao\.tasks" \("organization_id", "project_id", "model_id"\)/,
    );
    expect(
      migration.match(
        /WHERE "status" IN \('Em Andamento', 'Em andamento', 'A Realizar', 'Em Espera'\)/g,
      ),
    ).toHaveLength(2);
    expect(migration).toMatch(/GROUP BY "organization_id", "project_id", "model_id"/);
    expect(migration).toMatch(/HAVING COUNT\(\*\) > 1/);
  });
});
