import "./env-bootstrap.js";

import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { ServiceError } from "@workspace/shared";

import type { ProjectCrudPrisma } from "../services/ProjectCrudService.js";
import { ProjectCrudService } from "../services/ProjectCrudService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const PROJECT_ID = "d0000000-0000-4000-8000-000000000001";

const baseCreateInput = {
  userId: USER_ID,
  organizationId: ORG_ID,
  name: "Projeto Alpha",
  client_id: CLIENT_ID,
  start_date: new Date("2025-01-15"),
  objective: "Objetivo",
};

function createMockPrisma(): ProjectCrudPrisma {
  return {
    client: { findFirst: mock.fn(async () => null) },
    project: {
      findFirst: mock.fn(async () => null),
      findMany: mock.fn(async () => []),
      create: mock.fn(async () => ({})),
      update: mock.fn(async () => ({})),
      delete: mock.fn(async () => ({})),
    },
  } as unknown as ProjectCrudPrisma;
}

test("create lança 404 quando cliente não existe na organização", async () => {
  const prisma = createMockPrisma();
  prisma.client.findFirst = mock.fn(async () => null);
  const audit = { createLog: mock.fn(async () => {}), logUpdateIfChanged: mock.fn(async () => {}) };
  const service = new ProjectCrudService(prisma, audit);

  await assert.rejects(
    async () => await service.create(baseCreateInput),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal((err as ServiceError).statusCode, 404);
      return true;
    },
  );
  assert.equal(audit.createLog.mock.calls.length, 0);
});

test("create lança 409 quando já existe projeto com mesmo nome no cliente", async () => {
  const prisma = createMockPrisma();
  prisma.client.findFirst = mock.fn(async () => ({ id: CLIENT_ID }));
  prisma.project.findFirst = mock.fn(async () => ({ id: PROJECT_ID }));
  const audit = { createLog: mock.fn(async () => {}), logUpdateIfChanged: mock.fn(async () => {}) };
  const service = new ProjectCrudService(prisma, audit);

  await assert.rejects(
    async () => await service.create(baseCreateInput),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal((err as ServiceError).statusCode, 409);
      return true;
    },
  );
  assert.equal(prisma.project.create.mock.calls.length, 0);
});

test("create persiste projeto e registra auditoria", async () => {
  const prisma = createMockPrisma();
  prisma.client.findFirst = mock.fn(async () => ({ id: CLIENT_ID }));
  prisma.project.findFirst = mock.fn(async () => null);
  const created = {
    id: PROJECT_ID,
    name: baseCreateInput.name,
    client_id: CLIENT_ID,
    status: "Em andamento",
    start_date: baseCreateInput.start_date,
    objective: baseCreateInput.objective,
    sponsor_id: null,
  };
  prisma.project.create = mock.fn(async () => created);
  const audit = { createLog: mock.fn(async () => {}), logUpdateIfChanged: mock.fn(async () => {}) };
  const service = new ProjectCrudService(prisma, audit);

  const result = await service.create(baseCreateInput);

  assert.deepEqual(result, { create: created });
  assert.equal(audit.createLog.mock.calls.length, 1);
});

test("detail lança 404 quando projeto não existe", async () => {
  const prisma = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => null);
  const service = new ProjectCrudService(prisma, {
    createLog: mock.fn(async () => {}),
    logUpdateIfChanged: mock.fn(async () => {}),
  });

  await assert.rejects(
    async () => await service.detail(PROJECT_ID, ORG_ID),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal((err as ServiceError).statusCode, 404);
      return true;
    },
  );
});

test("detail retorna registro quando existe", async () => {
  const row = { id: PROJECT_ID, name: "X" };
  const prisma = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => row);
  const service = new ProjectCrudService(prisma, {
    createLog: mock.fn(async () => {}),
    logUpdateIfChanged: mock.fn(async () => {}),
  });

  const result = await service.detail(PROJECT_ID, ORG_ID);
  assert.deepEqual(result, { detail: row });
});

test("update lança 404 quando projeto não existe", async () => {
  const prisma = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => null);
  const service = new ProjectCrudService(prisma, {
    createLog: mock.fn(async () => {}),
    logUpdateIfChanged: mock.fn(async () => {}),
  });

  await assert.rejects(
    async () =>
      await service.update({
        userId: USER_ID,
        organizationId: ORG_ID,
        project_id: PROJECT_ID,
        name: "N",
        start_date: new Date(),
        end_date: new Date(),
        objective: "O",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal((err as ServiceError).statusCode, 404);
      return true;
    },
  );
});

test("list por client usa filtro client_id e ordenação desc", async () => {
  const findMany = mock.fn(async () => []);
  const prisma = {
    client: { findFirst: mock.fn() },
    project: {
      findFirst: mock.fn(),
      findMany,
      create: mock.fn(),
      update: mock.fn(),
      delete: mock.fn(),
    },
  } as unknown as ProjectCrudPrisma;
  const service = new ProjectCrudService(prisma, {
    createLog: mock.fn(async () => {}),
    logUpdateIfChanged: mock.fn(async () => {}),
  });

  await service.list("client", CLIENT_ID, ORG_ID);

  assert.equal(findMany.mock.calls.length, 1);
  const first = findMany.mock.calls[0];
  assert.ok(first);
  const arg = first.arguments[0] as {
    where: { client_id: string; organization_id: string };
    orderBy: { start_date: string };
  };
  assert.deepEqual(arg.where, { client_id: CLIENT_ID, organization_id: ORG_ID });
  assert.deepEqual(arg.orderBy, { start_date: "desc" });
});

test("delete lança 403 quando permissão não é 2", async () => {
  const prisma = createMockPrisma();
  const service = new ProjectCrudService(prisma, {
    createLog: mock.fn(async () => {}),
    logUpdateIfChanged: mock.fn(async () => {}),
  });

  await assert.rejects(
    async () =>
      await service.delete({
        userId: USER_ID,
        organizationId: ORG_ID,
        permission: 1,
        project_id: PROJECT_ID,
      }),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal((err as ServiceError).statusCode, 403);
      return true;
    },
  );
});

test("delete remove quando permissão é 2 e projeto existe", async () => {
  const prisma = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => ({ id: PROJECT_ID }));
  prisma.project.delete = mock.fn(async () => ({ id: PROJECT_ID }));
  const service = new ProjectCrudService(prisma, {
    createLog: mock.fn(async () => {}),
    logUpdateIfChanged: mock.fn(async () => {}),
  });

  const result = await service.delete({
    userId: USER_ID,
    organizationId: ORG_ID,
    permission: 2,
    project_id: PROJECT_ID,
  });

  assert.deepEqual(result, { response: { id: PROJECT_ID } });
});
