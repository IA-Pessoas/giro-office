import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiRequestService } from "../services/tiRequestService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const categoryId = "20000000-0000-4000-8000-000000000001";

const context = {
  organizationId,
  userId,
  permission: 3,
};

describe("TiRequestService", () => {
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

  it("rejects creating request for another user without admin permission", async () => {
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

  it("rejects transition from Closed without admin permission", async () => {
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({ id: "req-1", status: "Closed" })),
      },
    };
    const service = new TiRequestService(prisma as never);

    await expect(
      service.updateStatus({ ...context, permission: 2 }, "req-1", { status: "In_Progress" }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Permissao insuficiente para esta transicao.",
    });
  });
});
