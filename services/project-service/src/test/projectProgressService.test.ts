import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import type { ProjectProgressPrisma } from "../services/projectProgressService.js";
import { ProjectProgressService } from "../services/projectProgressService.js";

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
  project: { update: ReturnType<typeof vi.fn> };
  client: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

function createMockPrisma(): {
  prisma: ProjectProgressPrisma;
  tx: TransactionClient;
} {
  const projectFindFirst = vi.fn(async () => null);
  const projectUpdate = vi.fn(async () => progressRow);
  const taskGroupBy = vi.fn(async () => [] as { status: string; _count: { status: number } }[]);
  const clientFindFirst = vi.fn(async () => null);
  const clientUpdate = vi.fn(async () => ({}));

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
    $transaction: vi.fn(defaultTransaction),
  } as unknown as ProjectProgressPrisma;

  return { prisma, tx };
}

describe("ProjectProgressService", () => {
  it("recalculateFromTasks lança 404 quando projeto não existe na organização", async () => {
    const { prisma } = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => null);
    const service = new ProjectProgressService(prisma);

    await expect(service.recalculateFromTasks(PROJECT_ID, ORG_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("recalculateFromTasks com nenhuma tarefa relevante zera porcentagem e retorna projeto", async () => {
    const { prisma } = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => ({
      id: PROJECT_ID,
      client_id: CLIENT_ID,
    }));
    prisma.task.groupBy = vi.fn(async () => []);
    const updated = { ...progressRow, porcentage: 0, status: "Em andamento" };
    prisma.project.update = vi.fn(async () => updated);
    const service = new ProjectProgressService(prisma);

    const result = await service.recalculateFromTasks(PROJECT_ID, ORG_ID);

    expect(result).toEqual({ project: updated });
    const updateMock = prisma.project.update as ReturnType<typeof vi.fn>;
    expect(updateMock.mock.calls.length).toBe(1);
    const updateArg = updateMock.mock.calls[0]?.[0] as { data: { porcentage: number } };
    expect(updateArg.data.porcentage).toBe(0);
  });

  it("recalculateFromTasks calcula porcentagem parcial e atualiza status Em andamento", async () => {
    const { prisma } = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => ({
      id: PROJECT_ID,
      client_id: CLIENT_ID,
    }));
    prisma.task.groupBy = vi.fn(
      async () =>
        [
          { status: "Concluída", _count: { status: 1 } },
          { status: "A Realizar", _count: { status: 3 } },
        ] as { status: string; _count: { status: number } }[],
    );
    const updated = { ...progressRow, porcentage: 25, status: "Em andamento" };
    prisma.project.update = vi.fn(async () => updated);
    const service = new ProjectProgressService(prisma);

    const result = await service.recalculateFromTasks(PROJECT_ID, ORG_ID);

    expect(result).toEqual({ project: updated });
    expect((prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("recalculateFromTasks aceita Em andamento e Em Andamento no cálculo", async () => {
    const { prisma } = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => ({
      id: PROJECT_ID,
      client_id: CLIENT_ID,
    }));
    prisma.task.groupBy = vi.fn(
      async () =>
        [
          { status: "Concluída", _count: { status: 1 } },
          { status: "Em andamento", _count: { status: 1 } },
          { status: "Em Andamento", _count: { status: 1 } },
        ] as { status: string; _count: { status: number } }[],
    );
    const updated = { ...progressRow, porcentage: 33.33, status: "Em andamento" };
    prisma.project.update = vi.fn(async () => updated);
    const service = new ProjectProgressService(prisma);

    const result = await service.recalculateFromTasks(PROJECT_ID, ORG_ID);

    expect(result).toEqual({ project: updated });
    const groupByArg = (prisma.task.groupBy as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      where: { status: { in: string[] } };
    };
    expect(groupByArg.where.status.in).toContain("Em andamento");
    expect(groupByArg.where.status.in).toContain("Em Andamento");
  });

  it("recalculateFromTasks em 100% usa transação e inativa cliente service_unique", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => ({
      id: PROJECT_ID,
      client_id: CLIENT_ID,
    }));
    prisma.task.groupBy = vi.fn(
      async () =>
        [{ status: "Concluída", _count: { status: 2 } }] as {
          status: string;
          _count: { status: number };
        }[],
    );
    const updated = { ...progressRow, porcentage: 100, status: "Concluído" };
    tx.project.update = vi.fn(async () => updated);
    tx.client.findFirst = vi.fn(async () => ({
      id: CLIENT_ID,
      service_unique: true,
    }));
    tx.client.update = vi.fn(async () => ({}));
    const service = new ProjectProgressService(prisma);

    const result = await service.recalculateFromTasks(PROJECT_ID, ORG_ID);

    expect(result).toEqual({ project: updated });
    expect((prisma.$transaction as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((tx.client.update as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("recalculateFromTasks em 100% lança 404 se cliente não existe", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => ({
      id: PROJECT_ID,
      client_id: CLIENT_ID,
    }));
    prisma.task.groupBy = vi.fn(
      async () =>
        [{ status: "Concluída", _count: { status: 1 } }] as {
          status: string;
          _count: { status: number };
        }[],
    );
    tx.project.update = vi.fn(async () => ({
      ...progressRow,
      porcentage: 100,
      status: "Concluído",
    }));
    tx.client.findFirst = vi.fn(async () => null);
    const service = new ProjectProgressService(prisma);

    await expect(service.recalculateFromTasks(PROJECT_ID, ORG_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("recalculateFromTasks envolve erro inesperado em ServiceError 500", async () => {
    const { prisma } = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => {
      throw new Error("db down");
    });
    const service = new ProjectProgressService(prisma);

    await expect(service.recalculateFromTasks(PROJECT_ID, ORG_ID)).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
