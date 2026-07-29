import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const databaseUrl = process.env.QA_INTEGRACAO_DATABASE_URL;

test("o seed QA persiste as três posições de ownership da tarefa", async () => {
  assert.ok(
    databaseUrl,
    "defina QA_INTEGRACAO_DATABASE_URL para validar o banco real; este gate não é opcional",
  );
  const requireFromInfra = createRequire(new URL("../infra/package.json", import.meta.url));
  const { PrismaPg } = requireFromInfra("@prisma/adapter-pg");
  const { PrismaClient } = await import("../infra/generated/prisma/client.ts");
  const { INTEGRACAO_QA_FIXTURES: fixtures } = await import("./qa/integracao-fixtures.mjs");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    for (const fixture of fixtures) {
      const task = await prisma.task.findUnique({
        where: { id: fixture.task.id },
        select: {
          organization_id: true,
          responsible_id: true,
          responsible2_id: true,
          responsible3_id: true,
        },
      });

      assert.deepEqual(task, {
        organization_id: fixture.organization.id,
        responsible_id: fixture.task.responsibleId,
        responsible2_id: fixture.task.responsible2Id,
        responsible3_id: fixture.task.responsible3Id,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});
