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
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

function createTransferCandidatesPrismaMock(assignedToId = userId) {
  return {
    department: {
      findFirst: vi.fn(async () => ({ id: technologyDepartmentId })),
    },
    user: {
      findMany: vi.fn(async () => [
        {
          id: tiUserId,
          name: "Tecnica responsavel",
          full_name: "Tecnica responsavel da Silva",
          department_id: technologyDepartmentId,
        },
      ]),
    },
    tIRequest: {
      findFirst: vi.fn(async () => ({
        id: requestId,
        assigned_to_id: assignedToId,
        organization_id: organizationId,
      })),
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
      anydesk_code: "123 456 789",
      urgency: "High",
    });

    expect(result).toMatchObject({
      id: "req-1",
      anydesk_code: "123 456 789",
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
          anydesk_code: "123456789",
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
        anydesk_code: "123456789",
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

  it("lists only active users from the resolved Technology department for the current assignee", async () => {
    const prisma = createTransferCandidatesPrismaMock();
    const service = new TiRequestService(prisma as never);

    await expect(
      service.listTransferCandidates(
        { ...context, permission: TiPermissionLevel.Technician },
        requestId,
      ),
    ).resolves.toEqual([
      {
        id: tiUserId,
        name: "Tecnica responsavel",
        full_name: "Tecnica responsavel da Silva",
        department_id: technologyDepartmentId,
      },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        department_id: technologyDepartmentId,
        status: "active",
        permissions: {
          some: {
            organization_id: organizationId,
            ti: { gte: TiPermissionLevel.Requester },
          },
        },
      },
      select: {
        id: true,
        name: true,
        full_name: true,
        department_id: true,
      },
      orderBy: { full_name: "asc" },
    });
  });

  it("rejects a transfer when the current assignee changed after authorization", async () => {
    const prisma = {
      department: {
        findFirst: vi.fn(async () => ({ id: technologyDepartmentId })),
      },
      user: {
        findFirst: vi.fn(async () => ({
          id: tiUserId,
          department_id: technologyDepartmentId,
          status: "active",
          organization_id: organizationId,
        })),
      },
      tIRequest: {
        findFirst: vi.fn(async () => ({
          id: requestId,
          assigned_to_id: userId,
          organization_id: organizationId,
        })),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const service = new TiRequestService(prisma as never);

    await expect(
      service.assign({ ...context, permission: TiPermissionLevel.Requester }, requestId, {
        assigned_to_id: tiUserId,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Chamado de TI foi transferido por outro usuario.",
    });

    expect(prisma.tIRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: requestId,
        organization_id: organizationId,
        assigned_to_id: userId,
      },
      data: { assigned_to_id: tiUserId },
    });
  });

  it("rejects a TI technician who is not the current assignee from listing transfer candidates", async () => {
    const prisma = createTransferCandidatesPrismaMock(userId);
    const service = new TiRequestService(prisma as never);

    await expect(
      service.listTransferCandidates(
        { ...context, userId: otherUserId, permission: TiPermissionLevel.Technician },
        requestId,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Permissao insuficiente para transferir chamado.",
    });
  });

  it.each([
    ["admin", { ...context, userId: otherUserId, permission: TiPermissionLevel.Admin }],
    [
      "organization owner",
      {
        ...context,
        userId: otherUserId,
        permission: TiPermissionLevel.Technician,
        isOrganizationOwner: true,
      },
    ],
  ])("allows %s to list transfer candidates", async (_actor, actorContext) => {
    const prisma = createTransferCandidatesPrismaMock(userId);
    const service = new TiRequestService(prisma as never);

    await expect(service.listTransferCandidates(actorContext, requestId)).resolves.toHaveLength(1);
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
