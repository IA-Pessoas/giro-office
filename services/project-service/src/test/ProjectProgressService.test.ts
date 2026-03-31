import "./env-bootstrap.js";

import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { ServiceError } from "@workspace/shared";

import type { ProjectProgressPrisma } from "../services/ProjectProgressService.js";
import { ProjectProgressService } from "../services/ProjectProgressService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const PROJECT_ID = "d0000000-0000-4000-8000-000000000001";

const progressRow = {
  id: PROJECT_ID,
  status: "Em andamento",
  porcentage: 0,
  client_id: CLIENT_ID,
};

type TransactionClient = {
  project: { update: ReturnType<typeof mock.fn> };
  client: { findFirst: ReturnType<typeof mock.fn>; update: ReturnType<typeof mock.fn> };
};

function createMockPrisma(): {
  prisma: ProjectProgressPrisma;
  tx: TransactionClient;
} {
  const projectFindFirst = mock.fn(async () => null);
  const projectUpdate = mock.fn(async () => progressRow);
  const taskGroupBy = mock.fn(async () => [] as { status: string; _count: { status: number } }[]);
  const clientFindFirst = mock.fn(async () => null);
  const clientUpdate = mock.fn(async () => ({}));

  const tx: TransactionClient = {
    project: { update: projectUpdate },
    client: { findFirst: clientFindFirst, update: clientUpdate },
  };

  const defaultTransaction = async (fn: (inner: TransactionClient) => Promise<unknown>) => {
    return fn(tx);
  };

  const prisma = {
    project: {
      findFirst: projectFindFirst,
      update: projectUpdate,
    },
    task: {
      groupBy: taskGroupBy,
    },
    client: {
      findFirst: clientFindFirst,
      update: clientUpdate,
    },
    $transaction: mock.fn(defaultTransaction),
  } as unknown as ProjectProgressPrisma;

  return { prisma, tx };
}

test("recalculateFromTasks lança 404 quando projeto não existe na organização", async () => {
  const { prisma } = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => null);
  const service = new ProjectProgressService(prisma);

  await assert.rejects(
    async () => await service.recalculateFromTasks(PROJECT_ID, ORG_ID),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal((err as ServiceError).statusCode, 404);
      return true;
    },
  );
});

test("recalculateFromTasks com nenhuma tarefa relevante zera porcentagem e retorna projeto", async () => {
  const { prisma } = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => ({
    id: PROJECT_ID,
    client_id: CLIENT_ID,
  }));
  prisma.task.groupBy = mock.fn(async () => []);
  const updated = { ...progressRow, porcentage: 0, status: "Em andamento" };
  prisma.project.update = mock.fn(async () => updated);
  const service = new ProjectProgressService(prisma);

  const result = await service.recalculateFromTasks(PROJECT_ID, ORG_ID);

  assert.deepEqual(result, { project: updated });
  const updateMock = prisma.project.update as ReturnType<typeof mock.fn>;
  assert.equal(updateMock.mock.calls.length, 1);
  const updateArg = updateMock.mock.calls[0]?.arguments[0] as { data: { porcentage: number } };
  assert.equal(updateArg.data.porcentage, 0);
});

test("recalculateFromTasks calcula porcentagem parcial e atualiza status Em andamento", async () => {
  const { prisma } = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => ({
    id: PROJECT_ID,
    client_id: CLIENT_ID,
  }));
  prisma.task.groupBy = mock.fn(
    async () =>
      [
        { status: "Concluída", _count: { status: 1 } },
        { status: "A Realizar", _count: { status: 3 } },
      ] as { status: string; _count: { status: number } }[],
  );
  const updated = { ...progressRow, porcentage: 25, status: "Em andamento" };
  prisma.project.update = mock.fn(async () => updated);
  const service = new ProjectProgressService(prisma);

  const result = await service.recalculateFromTasks(PROJECT_ID, ORG_ID);

  assert.deepEqual(result, { project: updated });
  assert.equal((prisma.$transaction as ReturnType<typeof mock.fn>).mock.calls.length, 0);
});

test("recalculateFromTasks em 100% usa transação e inativa cliente service_unique", async () => {
  const { prisma, tx } = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => ({
    id: PROJECT_ID,
    client_id: CLIENT_ID,
  }));
  prisma.task.groupBy = mock.fn(
    async () =>
      [{ status: "Concluída", _count: { status: 2 } }] as {
        status: string;
        _count: { status: number };
      }[],
  );
  const updated = { ...progressRow, porcentage: 100, status: "Concluído" };
  tx.project.update = mock.fn(async () => updated);
  tx.client.findFirst = mock.fn(async () => ({
    id: CLIENT_ID,
    service_unique: true,
  }));
  tx.client.update = mock.fn(async () => ({}));
  const service = new ProjectProgressService(prisma);

  const result = await service.recalculateFromTasks(PROJECT_ID, ORG_ID);

  assert.deepEqual(result, { project: updated });
  assert.equal((prisma.$transaction as ReturnType<typeof mock.fn>).mock.calls.length, 1);
  assert.equal((tx.client.update as ReturnType<typeof mock.fn>).mock.calls.length, 1);
});

test("recalculateFromTasks em 100% lança 404 se cliente não existe", async () => {
  const { prisma, tx } = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => ({
    id: PROJECT_ID,
    client_id: CLIENT_ID,
  }));
  prisma.task.groupBy = mock.fn(
    async () =>
      [{ status: "Concluída", _count: { status: 1 } }] as {
        status: string;
        _count: { status: number };
      }[],
  );
  tx.project.update = mock.fn(async () => ({
    ...progressRow,
    porcentage: 100,
    status: "Concluído",
  }));
  tx.client.findFirst = mock.fn(async () => null);
  const service = new ProjectProgressService(prisma);

  await assert.rejects(
    async () => await service.recalculateFromTasks(PROJECT_ID, ORG_ID),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal((err as ServiceError).statusCode, 404);
      return true;
    },
  );
});

test("recalculateFromTasks envolve erro inesperado em ServiceError 500", async () => {
  const { prisma } = createMockPrisma();
  prisma.project.findFirst = mock.fn(async () => {
    throw new Error("db down");
  });
  const service = new ProjectProgressService(prisma);

  await assert.rejects(
    async () => await service.recalculateFromTasks(PROJECT_ID, ORG_ID),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal((err as ServiceError).statusCode, 500);
      return true;
    },
  );
});
