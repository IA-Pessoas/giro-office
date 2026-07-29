import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

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
  return {
    client: { findFirst: vi.fn(async () => null) },
    project: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
  } as unknown as ProjectCrudPrisma;
}

describe("ProjectCrudService", () => {
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
