import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import { TiRequestService } from "../services/tiRequestService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const categoryId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";
const technologyDepartmentId = "40000000-0000-4000-8000-000000000001";
const financeDepartmentId = "40000000-0000-4000-8000-000000000002";
const tiUserId = "00000000-0000-4000-8000-000000000003";
const financeUserId = "00000000-0000-4000-8000-000000000004";
const inactiveTiUserId = "00000000-0000-4000-8000-000000000005";
const TI_ADMIN_PERMISSION = 3;

const context = {
  organizationId,
  userId,
  permission: TI_ADMIN_PERMISSION,
  isOrganizationOwner: false,
};

function createAssignPrismaMock(destination: {
  id: string;
  department_id: string;
  status: string;
}) {
  return {
    department: {
      findFirst: vi.fn(async () => ({ id: technologyDepartmentId })),
    },
    user: {
      findFirst: vi.fn(async () => ({
        ...destination,
        organization_id: organizationId,
      })),
    },
    tIRequest: {
      findFirst: vi.fn(async () => ({
        id: requestId,
        requester_id: otherUserId,
        assigned_to_id: userId,
        organization_id: organizationId,
      })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  };
}

describe("TiRequestService", () => {
  it("documents admin TI permission as level 3", () => {
    expect(TiPermissionLevel.Admin).toBe(TI_ADMIN_PERMISSION);
  });

  it("list applies bounded offset pagination", async () => {
    const prisma = {
      tIRequest: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiRequestService(prisma as never);

    await service.list(context, { page: 3, page_size: 20 });

    expect(prisma.tIRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40,
        take: 20,
      }),
    );
  });

  it("list includes safe requester and assignee fields", async () => {
    const prisma = {
      tIRequest: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiRequestService(prisma as never);

    await service.list(context, {});

    expect(prisma.tIRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          category: true,
          requester: {
            select: expect.not.objectContaining({
              password: true,
              cpf: true,
              rg: true,
            }),
          },
          assigned_to: {
            select: expect.not.objectContaining({
              password: true,
              cpf: true,
              rg: true,
            }),
          },
        }),
      }),
    );
  });

  it("forces requester filter for viewer permission", async () => {
    const prisma = {
      tIRequest: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiRequestService(prisma as never);

    await service.list(
      { ...context, permission: TiPermissionLevel.Viewer },
      {
        requester_id: otherUserId,
      },
    );

    expect(prisma.tIRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requester_id: userId,
        }),
      }),
    );
  });

  it("creates request for authenticated user when requester_id is omitted", async () => {
    const prisma = {
      tICategoryRequest: { findFirst: vi.fn(async () => ({ id: categoryId, active: true })) },
      user: { findFirst: vi.fn(async () => ({ id: userId, organization_id: organizationId })) },
      tIRequest: {
        create: vi.fn(async ({ data }) => ({ id: "req-1", ...data })),
      },
    };
    const service = new TiRequestService(prisma as never);

    const result = await service.create(context, {
      title: "Notebook nao liga",
      description: "Equipamento nao inicia apos queda de energia.",
      category_id: categoryId,
      urgency: "High",
    });

    expect(result).toMatchObject({
      id: "req-1",
      requester_id: userId,
      status: "New",
      organization_id: organizationId,
    });
  });

  it("rejects creating request for another user without technician permission", async () => {
    const service = new TiRequestService({} as never);

    await expect(
      service.create(
        { ...context, permission: 1 },
        {
          title: "Acesso",
          description: "Criar acesso.",
          category_id: categoryId,
          requester_id: otherUserId,
          urgency: "Low",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Permissao insuficiente para criar chamado para outro usuario.",
    });
  });

  it("allows technician to create request for another user", async () => {
    const prisma = {
      tICategoryRequest: { findFirst: vi.fn(async () => ({ id: categoryId, active: true })) },
      user: {
        findFirst: vi.fn(async () => ({ id: otherUserId, organization_id: organizationId })),
      },
      tIRequest: {
        create: vi.fn(async ({ data }) => ({ id: "req-1", ...data })),
      },
    };
    const service = new TiRequestService(prisma as never);

    const result = await service.create(
      { ...context, permission: 2 },
      {
        title: "Acesso",
        description: "Criar acesso.",
        category_id: categoryId,
        requester_id: otherUserId,
        urgency: "Low",
      },
    );

    expect(result).toMatchObject({
      id: "req-1",
      requester_id: otherUserId,
      organization_id: organizationId,
    });
  });

  it("getById selects only safe user fields", async () => {
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({ id: "req-1", status: "New" })),
      },
    };
    const service = new TiRequestService(prisma as never);

    await service.getById(context, "30000000-0000-4000-8000-000000000001");

    expect(prisma.tIRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          requester: {
            select: expect.not.objectContaining({
              password: true,
              cpf: true,
              rg: true,
            }),
          },
          assigned_to: {
            select: expect.not.objectContaining({
              password: true,
              cpf: true,
              rg: true,
            }),
          },
        }),
      }),
    );
  });

  it("hides another user's request from viewer permission", async () => {
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({
          id: "req-1",
          status: "New",
          requester_id: otherUserId,
        })),
      },
    };
    const service = new TiRequestService(prisma as never);

    await expect(
      service.getById(
        { ...context, permission: TiPermissionLevel.Viewer },
        "30000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Chamado de TI nao encontrado.",
    });
  });

  it("rejects transition from Closed without admin permission", async () => {
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({ id: "req-1", status: "Closed", requester_id: userId })),
      },
    };
    const service = new TiRequestService(prisma as never);

    await expect(
      service.updateStatus({ ...context, permission: TiPermissionLevel.Requester }, "req-1", {
        status: "In_Progress",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Permissao insuficiente para esta transicao.",
    });
  });

  it("rejects reopening resolved request without admin permission", async () => {
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({ id: "req-1", status: "Resolved", requester_id: userId })),
      },
    };
    const service = new TiRequestService(prisma as never);

    await expect(
      service.updateStatus({ ...context, permission: TiPermissionLevel.Requester }, "req-1", {
        status: "In_Progress",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Permissao insuficiente para esta transicao.",
    });
  });

  it("allows admin level 3 to reopen resolved request", async () => {
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({ id: "req-1", status: "Resolved" })),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
    };
    const service = new TiRequestService(prisma as never);

    const result = await service.updateStatus(context, "req-1", { status: "In_Progress" });

    expect(result).toMatchObject({ id: "req-1", status: "In_Progress" });
  });

  it("allows the current assignee to transfer a request to an active TI user", async () => {
    const prisma = createAssignPrismaMock({
      id: tiUserId,
      department_id: technologyDepartmentId,
      status: "active",
    });
    const service = new TiRequestService(prisma as never);

    await expect(
      service.assign({ ...context, permission: TiPermissionLevel.Technician }, requestId, {
        assigned_to_id: tiUserId,
      }),
    ).resolves.toEqual({ id: requestId, assigned_to_id: tiUserId });
  });

  it("rejects a TI technician who is not the current assignee", async () => {
    const prisma = createAssignPrismaMock({
      id: tiUserId,
      department_id: technologyDepartmentId,
      status: "active",
    });
    const service = new TiRequestService(prisma as never);

    await expect(
      service.assign(
        {
          ...context,
          userId: otherUserId,
          permission: TiPermissionLevel.Technician,
        },
        requestId,
        { assigned_to_id: tiUserId },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Permissao insuficiente para transferir chamado.",
    });
  });

  it("allows an organization owner to transfer a request", async () => {
    const prisma = createAssignPrismaMock({
      id: tiUserId,
      department_id: technologyDepartmentId,
      status: "active",
    });
    const service = new TiRequestService(prisma as never);

    await expect(
      service.assign(
        {
          ...context,
          userId: otherUserId,
          permission: TiPermissionLevel.Viewer,
          isOrganizationOwner: true,
        },
        requestId,
        { assigned_to_id: tiUserId },
      ),
    ).resolves.toEqual({ id: requestId, assigned_to_id: tiUserId });
  });

  it("rejects an assignee outside the resolved Technology department", async () => {
    const prisma = createAssignPrismaMock({
      id: financeUserId,
      department_id: financeDepartmentId,
      status: "active",
    });
    const service = new TiRequestService(prisma as never);

    await expect(
      service.assign(context, requestId, { assigned_to_id: financeUserId }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Responsavel deve pertencer ao departamento Tecnologia.",
    });
  });

  it("rejects an inactive assignee in the resolved Technology department", async () => {
    const prisma = createAssignPrismaMock({
      id: inactiveTiUserId,
      department_id: technologyDepartmentId,
      status: "inactive",
    });
    const service = new TiRequestService(prisma as never);

    await expect(
      service.assign(context, requestId, { assigned_to_id: inactiveTiUserId }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Responsavel deve pertencer ao departamento Tecnologia.",
    });
  });
});
