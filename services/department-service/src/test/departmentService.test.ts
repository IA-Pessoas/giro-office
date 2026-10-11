import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import {
  type DepartmentAuditDeps,
  type DepartmentPrismaDeps,
  DepartmentService,
} from "../services/departmentService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const DEPARTMENT_ID = "d0000000-0000-4000-8000-000000000001";

function createMockPrisma(): DepartmentPrismaDeps {
  return {
    department: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  } as unknown as DepartmentPrismaDeps;
}

function createAuditMock(): DepartmentAuditDeps {
  return {
    createLog: vi.fn(async () => {}),
    logUpdateIfChanged: vi.fn(async () => {}),
  };
}

describe("DepartmentService", () => {
  it("create lança 409 quando ja existe departamento com o mesmo nome", async () => {
    const prisma = createMockPrisma();
    prisma.department.findFirst = vi.fn(async () => ({ id: DEPARTMENT_ID }));
    const audit = createAuditMock();
    const service = new DepartmentService(prisma, audit);

    await expect(
      service.create({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        name: "Tecnologia",
        color: "#0F766E",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.department.create).not.toHaveBeenCalled();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("detail lança 404 quando nao encontra o departamento", async () => {
    const prisma = createMockPrisma();
    prisma.department.findFirst = vi.fn(async () => null);
    const service = new DepartmentService(prisma, createAuditMock());

    await expect(service.detail(DEPARTMENT_ID, ORGANIZATION_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("update não altera departamento que não pertence à organização", async () => {
    const prisma = createMockPrisma();
    const findFirst = vi.fn(async () => null);
    prisma.department.findFirst = findFirst;
    const service = new DepartmentService(prisma, createAuditMock());

    await expect(
      service.update({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        dep_id: DEPARTMENT_ID,
        color: "#0F766E",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEPARTMENT_ID, organization_id: ORGANIZATION_ID },
      }),
    );
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("update lança 409 quando o novo nome conflita com outro departamento", async () => {
    const prisma = createMockPrisma();
    prisma.department.findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: DEPARTMENT_ID,
        name: "Tecnologia",
        color: "#0F766E",
        status: "Ativo",
        solution: false,
      })
      .mockResolvedValueOnce({ id: "dep-duplicado" });
    const audit = createAuditMock();
    const service = new DepartmentService(prisma, audit);

    await expect(
      service.update({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        dep_id: DEPARTMENT_ID,
        name: "Produto",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.department.update).not.toHaveBeenCalled();
    expect(audit.logUpdateIfChanged).not.toHaveBeenCalled();
  });

  it("list aplica filtro por status e ordenacao por nome", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = {
      department: {
        findFirst: vi.fn(),
        findMany,
        create: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as DepartmentPrismaDeps;
    const service = new DepartmentService(prisma, createAuditMock());

    await service.list("Ativo", ORGANIZATION_ID);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organization_id: ORGANIZATION_ID,
        status: "Ativo",
      },
      select: {
        id: true,
        name: true,
        color: true,
        status: true,
        solution: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  });
});
