import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import { TiMessageService } from "../services/tiMessageService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const requestId = "30000000-0000-4000-8000-000000000001";

const requesterContext = {
  organizationId,
  userId,
  permission: TiPermissionLevel.Requester,
};

describe("TiMessageService", () => {
  it("hides another user's request messages from requester permission", async () => {
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({
          id: requestId,
          organization_id: organizationId,
          requester_id: otherUserId,
        })),
      },
      tIMessage: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiMessageService(prisma as never);

    await expect(service.list(requesterContext, requestId, {})).rejects.toMatchObject({
      statusCode: 404,
      message: "Chamado de TI nao encontrado.",
    });
    expect(prisma.tIMessage.findMany).not.toHaveBeenCalled();
  });

  it("blocks creating messages on another user's request for requester permission", async () => {
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({
          id: requestId,
          organization_id: organizationId,
          requester_id: otherUserId,
        })),
      },
      tIMessage: {
        create: vi.fn(async ({ data }) => ({ id: "msg-1", ...data })),
      },
    };
    const service = new TiMessageService(prisma as never);

    await expect(
      service.create(requesterContext, requestId, {
        message: "Acompanhando o chamado.",
        type: "Message",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Chamado de TI nao encontrado.",
    });
    expect(prisma.tIMessage.create).not.toHaveBeenCalled();
  });
});
