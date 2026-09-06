import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "../generated/prisma/client.js";
import type { ProjectCrudPrisma } from "../services/projectCrudService.js";
import { ProjectCrudService } from "../services/projectCrudService.js";

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
  integracaoLevel: 2,
};

function createMockPrisma(): ProjectCrudPrisma {
  const prisma = {
    client: { findFirst: vi.fn(async () => null) },
    project: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
  } as unknown as ProjectCrudPrisma;
  prisma.$transaction = vi.fn(async (callback) => callback(prisma));
  return prisma;
}

describe("ProjectCrudService", () => {
  it.each([
    {
      label: "nível 1",
      level: 1,
      client: true,
      duplicate: false,
      endDate: "2025-02-15",
      status: 403,
    },
    {
      label: "cliente fora da organização",
      level: 2,
      client: false,
      duplicate: false,
      endDate: "2025-02-15",
      status: 404,
    },
    {
      label: "duplicidade",
      level: 2,
      client: true,
      duplicate: true,
      endDate: "2025-02-15",
      status: 409,
    },
    {
      label: "período inválido",
      level: 2,
      client: true,
      duplicate: false,
      endDate: "2025-01-14",
      status: 400,
    },
  ])("createInTransaction preserva rejeição de $label sem gravar", async ({
    level,
    client,
    duplicate,
    endDate,
    status,
  }) => {
    const prisma = createMockPrisma();
    const tx = createMockPrisma();
    tx.client.findFirst = vi.fn(async () => (client ? { id: CLIENT_ID } : null));
    tx.project.findFirst = vi.fn(async () => (duplicate ? { id: PROJECT_ID } : null));
    const audit = { createLog: vi.fn(async () => {}), logUpdateIfChanged: vi.fn(async () => {}) };
    const service = new ProjectCrudService(prisma, audit);

    await expect(
      service.createInTransaction(
        { ...baseCreateInput, integracaoLevel: level, end_date: new Date(endDate) },
        tx as Prisma.TransactionClient,
      ),
    ).rejects.toMatchObject({ statusCode: status });
    expect(tx.project.create).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("create retorna projeto confirmado mesmo quando auditoria falha", async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst = vi.fn(async () => ({ id: CLIENT_ID }));
    prisma.project.create = vi.fn(async () => ({ id: PROJECT_ID }));
    let committed = false;
    let auditedAfterCommit = false;
    prisma.$transaction = vi.fn(async (callback) => {
      const result = await callback(prisma);
      committed = true;
      return result;
    });
    const audit = {
      createLog: vi.fn(async () => {
        auditedAfterCommit = committed;
        throw new Error("audit unavailable");
      }),
      logUpdateIfChanged: vi.fn(async () => {}),
    };
    const service = new ProjectCrudService(prisma, audit);

    await expect(service.create(baseCreateInput)).resolves.toEqual({ create: { id: PROJECT_ID } });
    expect(audit.createLog).toHaveBeenCalledOnce();
    expect(auditedAfterCommit).toBe(true);
  });

  it("createInTransaction usa apenas a transação do chamador e não audita", async () => {
    const prisma = createMockPrisma();
    const tx = createMockPrisma();
    tx.client.findFirst = vi.fn(async () => ({ id: CLIENT_ID }));
    tx.project.create = vi.fn(async () => ({ id: PROJECT_ID }));
    const audit = { createLog: vi.fn(async () => {}), logUpdateIfChanged: vi.fn(async () => {}) };
    const service = new ProjectCrudService(prisma, audit);

    const result = await service.createInTransaction(
      { ...baseCreateInput, end_date: new Date("2025-02-15"), sponsor_id: USER_ID },
      tx as Prisma.TransactionClient,
    );

    expect(result.create.id).toBe(PROJECT_ID);
    expect(tx.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORG_ID },
    });
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { name: "Projeto Alpha", client_id: CLIENT_ID, organization_id: ORG_ID },
    });
    expect(tx.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: ORG_ID,
        end_date: new Date("2025-02-15"),
        sponsor_id: USER_ID,
      }),
      select: expect.objectContaining({ end_date: true }),
    });
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$transaction).not.toHaveBeenCalled();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("create aguarda commit antes de auditar e não audita se commit falhar", async () => {
    const prisma = createMockPrisma();
    const tx = createMockPrisma();
    tx.client.findFirst = vi.fn(async () => ({ id: CLIENT_ID }));
    tx.project.create = vi.fn(async () => ({ id: PROJECT_ID }));
    const audit = { createLog: vi.fn(async () => {}), logUpdateIfChanged: vi.fn(async () => {}) };
    prisma.$transaction = vi.fn(async (callback) => {
      await callback(tx);
      expect(audit.createLog).not.toHaveBeenCalled();
      throw new Error("commit failed");
    });
    const service = new ProjectCrudService(prisma, audit);

    await expect(service.create(baseCreateInput)).rejects.toThrow("commit failed");
    expect(tx.project.create).toHaveBeenCalledOnce();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("create lança 404 quando cliente não existe na organização", async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst = vi.fn(async () => null);
    const audit = { createLog: vi.fn(async () => {}), logUpdateIfChanged: vi.fn(async () => {}) };
    const service = new ProjectCrudService(prisma, audit);

    await expect(service.create(baseCreateInput)).rejects.toMatchObject({ statusCode: 404 });
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("create lança 409 quando já existe projeto com mesmo nome no cliente", async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst = vi.fn(async () => ({ id: CLIENT_ID }));
    prisma.project.findFirst = vi.fn(async () => ({ id: PROJECT_ID }));
    const audit = { createLog: vi.fn(async () => {}), logUpdateIfChanged: vi.fn(async () => {}) };
    const service = new ProjectCrudService(prisma, audit);

    await expect(service.create(baseCreateInput)).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it("create persiste projeto e registra auditoria", async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst = vi.fn(async () => ({ id: CLIENT_ID }));
    prisma.project.findFirst = vi.fn(async () => null);
    const created = {
      id: PROJECT_ID,
      name: baseCreateInput.name,
      client_id: CLIENT_ID,
      status: "Em andamento",
      start_date: baseCreateInput.start_date,
      objective: baseCreateInput.objective,
      sponsor_id: null,
    };
    prisma.project.create = vi.fn(async () => created);
    const audit = { createLog: vi.fn(async () => {}), logUpdateIfChanged: vi.fn(async () => {}) };
    const service = new ProjectCrudService(prisma, audit);

    const result = await service.create(baseCreateInput);

    expect(result).toEqual({ create: created });
    expect(audit.createLog).toHaveBeenCalledTimes(1);
  });

  it("detail lança 404 quando projeto não existe", async () => {
    const prisma = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => null);
    const service = new ProjectCrudService(prisma, {
      createLog: vi.fn(async () => {}),
      logUpdateIfChanged: vi.fn(async () => {}),
    });

    await expect(
      service.detail(PROJECT_ID, ORG_ID, {
        userId: USER_ID,
        organizationId: ORG_ID,
        integracaoLevel: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("detail retorna registro quando existe", async () => {
    const row = { id: PROJECT_ID, name: "X" };
    const prisma = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => row);
    const service = new ProjectCrudService(prisma, {
      createLog: vi.fn(async () => {}),
      logUpdateIfChanged: vi.fn(async () => {}),
    });

    const result = await service.detail(PROJECT_ID, ORG_ID, {
      userId: USER_ID,
      organizationId: ORG_ID,
      integracaoLevel: 1,
    });
    expect(result).toEqual({ detail: row });
  });

  it("update lança 404 quando projeto não existe", async () => {
    const prisma = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => null);
    const service = new ProjectCrudService(prisma, {
      createLog: vi.fn(async () => {}),
      logUpdateIfChanged: vi.fn(async () => {}),
    });

    await expect(
      service.update({
        userId: USER_ID,
        organizationId: ORG_ID,
        project_id: PROJECT_ID,
        name: "N",
        start_date: new Date(),
        end_date: new Date(),
        objective: "O",
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("list por client usa filtro client_id e ordenação desc", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = {
      client: { findFirst: vi.fn() },
      project: {
        findFirst: vi.fn(),
        findMany,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as ProjectCrudPrisma;
    const service = new ProjectCrudService(prisma, {
      createLog: vi.fn(async () => {}),
      logUpdateIfChanged: vi.fn(async () => {}),
    });

    await service.list("client", CLIENT_ID, ORG_ID, {
      userId: USER_ID,
      organizationId: ORG_ID,
      integracaoLevel: 1,
    });

    expect(findMany.mock.calls.length).toBe(1);
    const firstCall = findMany.mock.calls[0];
    expect(firstCall).toBeDefined();
    const arg = firstCall?.[0] as {
      where: { client_id: string; organization_id: string };
      orderBy: { start_date: string };
    };
    expect(arg.where).toEqual({ client_id: CLIENT_ID, organization_id: ORG_ID });
    expect(arg.orderBy).toEqual({ start_date: "desc" });
  });

  it("delete lança 403 quando permissão não é 2", async () => {
    const prisma = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => ({ id: PROJECT_ID }));
    const service = new ProjectCrudService(prisma, {
      createLog: vi.fn(async () => {}),
      logUpdateIfChanged: vi.fn(async () => {}),
    });

    await expect(
      service.delete({
        userId: USER_ID,
        organizationId: ORG_ID,
        permission: 1,
        integracaoLevel: 1,
        project_id: PROJECT_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("delete remove quando permissão é 2 e projeto existe", async () => {
    const prisma = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => ({ id: PROJECT_ID }));
    prisma.project.delete = vi.fn(async () => ({ id: PROJECT_ID }));
    const service = new ProjectCrudService(prisma, {
      createLog: vi.fn(async () => {}),
      logUpdateIfChanged: vi.fn(async () => {}),
    });

    const result = await service.delete({
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 2,
      integracaoLevel: 3,
      project_id: PROJECT_ID,
    });

    expect(result).toEqual({ response: { id: PROJECT_ID } });
  });

  it("delete devolve 409 quando o projeto possui dependências", async () => {
    const prisma = createMockPrisma();
    prisma.project.findFirst = vi.fn(async () => ({ id: PROJECT_ID }));
    prisma.project.delete = vi.fn(async () => {
      throw { code: "P2003" };
    });
    const audit = {
      createLog: vi.fn(async () => {}),
      logUpdateIfChanged: vi.fn(async () => {}),
    };
    const service = new ProjectCrudService(prisma, audit);

    await expect(
      service.delete({
        userId: USER_ID,
        organizationId: ORG_ID,
        permission: 3,
        integracaoLevel: 3,
        project_id: PROJECT_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Não é possível excluir projeto com dependências.",
    });
    expect(prisma.project.delete).toHaveBeenCalledTimes(1);
    expect(audit.createLog).not.toHaveBeenCalled();
  });
});
