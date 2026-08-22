import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimePoolFiles = [
  "services/audit-service/src/integrations/prisma/prismaClient.ts",
  "services/certificate-service/src/prisma.ts",
  "services/client-service/src/integrations/prisma.ts",
  "services/contabil-service/src/integrations/prisma.ts",
  "services/department-service/src/integrations/prisma.ts",
  "services/fiscal-service/src/integrations/prisma.ts",
  "services/gateway/src/services/dashboardStatsService.ts",
  "services/organization-service/src/integrations/prisma.ts",
  "services/parcelamento-service/src/prisma/index.ts",
  "services/pessoal-service/src/prisma/index.ts",
  "services/project-service/src/integrations/prisma.ts",
  "services/regularize-service/src/integrations/prisma.ts",
  "services/reports-service/src/prisma/index.ts",
  "services/rh-service/src/integrations/prisma.ts",
  "services/task-service/src/prisma/index.ts",
  "services/ti-service/src/server.ts",
  "services/user-service/src/prisma/index.ts",
];

test("todos os pools de runtime possuem teto explicito e configuravel", () => {
  for (const relativePath of runtimePoolFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(source, /max:/u, `${relativePath} precisa definir max`);
    assert.match(
      source,
      /DATABASE_POOL_MAX|databasePoolMax/u,
      `${relativePath} precisa consumir DATABASE_POOL_MAX`,
    );
  }
});

test("migrations preferem DIRECT_URL e preservam fallback local", () => {
  const source = fs.readFileSync(path.join(root, "infra/prisma.config.ts"), "utf8");
  assert.match(source, /process\.env\.DIRECT_URL\s*\?\?/u);
  assert.match(source, /env\("DATABASE_URL"\)/u);
});
