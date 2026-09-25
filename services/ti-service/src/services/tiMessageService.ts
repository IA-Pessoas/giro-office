import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type { CreateTiMessageBody, ListTiMessagesQuery } from "../schemas/tiRequest.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

type CreateStoredTiMessageInput = CreateTiMessageBody & {
  attachment?: string;
};

export class TiMessageService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    context: TiAuthContext,
    requestId: string,
    query: ListTiMessagesQuery,
  ): Promise<unknown[]> {
    await this.assertRequestAccess(context, requestId);
    const { skip, take } = getPaginationParams(query);

    return this.prisma.tIMessage.findMany({
      where: {
        request_id: requestId,
        organization_id: context.organizationId,
        ...(query.created_from || query.created_to
          ? {
              created_at: {
                ...(query.created_from ? { gte: query.created_from } : {}),
                ...(query.created_to ? { lte: query.created_to } : {}),
              },
            }
          : {}),
      },
      orderBy: { created_at: "asc" },
      skip,
      take,
    });
  }

  async create(
    context: TiAuthContext,
    requestId: string,
    body: CreateStoredTiMessageInput,
  ): Promise<unknown> {
    try {
      await this.assertRequestAccess(context, requestId);

      return this.prisma.tIMessage.create({
        data: {
          request_id: requestId,
          sender_id: context.userId,
          message: body.message,
          attachment: body.attachment,
          type: body.type,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar mensagem de chamado de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar mensagem de chamado de TI.", err);
    }
  }

  async assertRequestAccess(context: TiAuthContext, requestId: string): Promise<void> {
    const request = await this.prisma.tIRequest.findFirst({
      where: { id: requestId, organization_id: context.organizationId },
    });

    if (
      !request ||
      (context.permission < TiPermissionLevel.Technician && request.requester_id !== context.userId)
    ) {
      throw new ServiceError(404, "Chamado de TI não encontrado.");
    }
  }
}
