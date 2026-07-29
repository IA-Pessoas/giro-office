import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seedSource = await readFile(new URL("../infra/prisma/seed.ts", import.meta.url), "utf8");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("o seed de Integração usa UUIDs válidos para clientes e projetos", () => {
  assert.doesNotMatch(seedSource, /id:\s*"client-\d+"/);
  assert.doesNotMatch(seedSource, /id:\s*"proj-\d+"/);

  const resourceIds = [
    ...seedSource.matchAll(/id:\s*"((?:100|200)00000-0000-4000-8000-00000000000\d)"/g),
  ].map(([, id]) => id);

  assert.equal(resourceIds.length, 12);
  for (const resourceId of resourceIds) {
    assert.match(resourceId, UUID_PATTERN);
  }
});

test("o seed de projetos é determinístico para QA repetível", () => {
  assert.doesNotMatch(seedSource, /Math\.random\(\)/);
});

test("as fixtures QA cobrem duas organizações isoladas e a matriz 0–3/owner", async () => {
  const { INTEGRACAO_QA_FIXTURES: fixtures } = await import("./qa/integracao-fixtures.mjs");

  assert.equal(fixtures.length, 2);
  assert.equal(new Set(fixtures.map(({ organization }) => organization.id)).size, 2);

  const [first, second] = fixtures;
  assert.notEqual(first.client.id, second.client.id);
  assert.notEqual(first.project.id, second.project.id);

  for (const fixture of fixtures) {
    const userLevels = fixture.users
      .filter(({ type }) => type === "user")
      .map(({ level }) => level)
      .sort((left, right) => left - right);

    assert.deepEqual(userLevels, [0, 1, 2, 3]);
    assert.equal(fixture.users.filter(({ type }) => type === "owner").length, 1);

    for (const resource of [
      fixture.organization,
      fixture.department,
      fixture.client,
      fixture.project,
      fixture.taskModel,
      fixture.task,
      ...fixture.users,
    ]) {
      assert.match(resource.id, UUID_PATTERN);
    }

    assert.equal(fixture.project.clientId, fixture.client.id);
    assert.equal(fixture.task.projectId, fixture.project.id);
    assert.equal(fixture.task.clientId, fixture.client.id);
    assert.equal(fixture.task.organizationId, fixture.organization.id);
    assert.equal(fixture.project.organizationId, fixture.organization.id);
    assert.equal(fixture.client.organizationId, fixture.organization.id);
  }
});

test("o seed QA e o roteiro usam as fixtures declarativas", async () => {
  const seedQaSource = await readFile(
    new URL("../infra/prisma/seed-qa.ts", import.meta.url),
    "utf8",
  );
  const qaGuide = await readFile(
    new URL("../docs/qa/integracao-permissions-qa.md", import.meta.url),
    "utf8",
  );

  assert.match(seedQaSource, /INTEGRACAO_QA_FIXTURES/);
  assert.match(seedQaSource, /moduleName === "integracao" \? level : 0/);
  assert.match(seedQaSource, /permission: 0/);
  assert.match(qaGuide, /prisma:seed:qa/);
  assert.match(qaGuide, /PROJECT_SERVICE_INTEGRATION=1/);
  assert.match(qaGuide, /403/);
  assert.match(qaGuide, /404/);
  assert.match(qaGuide, /409/);
});
