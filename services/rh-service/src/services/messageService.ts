import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

const MESSAGE_SELECT = {
  id: true,
  request_id: true,
  sender_user_id: true,
  message: true,
  attachment: true,
  type: true,
  is_read: true,
  created_at: true,
  organization_id: true,
} as const;

export type RhMessageSnapshot = Prisma.RhMessageGetPayload<{
  select: typeof MESSAGE_SELECT;
}>;

export type RhMessageTypeInput = "Message" | "Solution" | "Rejection" | "Acceptance";

export interface MessageCreateInput {
  organization_id: string;
  sender_user_id: string;
  request_id: string;
  message: string;
  type: RhMessageTypeInput;
  attachment?: string;
}

export interface MessageListByRequestInput {
  organization_id: string;
  user_id: string;
  request_id: string;
}

function assertUserIsParticipant(
  request: { requester_user_id: string; assigned_to_user_id: string },
  userId: string,
): void {
  if (request.requester_user_id !== userId && request.assigned_to_user_id !== userId) {
    throw new ServiceError(403, "Você não tem permissão para acessar este chamado.");
  }
}

function nextRequestStatusForMessageType(
  type: RhMessageTypeInput,
): "Resolved" | "In_Progress" | "Closed" | null {
  if (type === "Solution") return "Resolved";
  if (type === "Rejection") return "In_Progress";
  if (type === "Acceptance") return "Closed";
  return null;
}

class MessageService {
  async create(input: MessageCreateInput): Promise<RhMessageSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const senderUserId = assertNonEmptyString(input.sender_user_id, "sender_user_id");
      const requestId = assertNonEmptyString(input.request_id, "request_id");
      const message = assertNonEmptyString(input.message, "message");
      const type = input.type;
      const attachment = input.attachment?.trim() ? input.attachment : undefined;

      return await prismaClient.$transaction(async (tx: Prisma.TransactionClient) => {
        const request = await tx.rhRequest.findFirst({
          where: { id: requestId, organization_id: organizationId },
          select: {
            id: true,
            title: true,
            requester_user_id: true,
            assigned_to_user_id: true,
          },
        });

        if (!request) {
          throw new ServiceError(404, "Chamado não encontrado.");
        }

        assertUserIsParticipant(request, senderUserId);

        const created = await tx.rhMessage.create({
          data: {
            request_id: requestId,
            sender_user_id: senderUserId,
            message,
            attachment: attachment ?? null,
            type,
            organization_id: organizationId,
          },
          select: MESSAGE_SELECT,
        });

        const nextStatus = nextRequestStatusForMessageType(type);
        if (nextStatus !== null) {
          await tx.rhRequest.update({
            where: { id: requestId },
            data: { status: nextStatus },
          });
        } else {
          await tx.rhRequest.update({
            where: { id: requestId },
            data: { title: request.title },
          });
        }

        return created;
      });
    } catch (err: unknown) {
      logError("Erro ao criar mensagem do chamado RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar mensagem. ${msg}`, err);
    }
  }

  async listByRequest(input: MessageListByRequestInput): Promise<RhMessageSnapshot[]> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const userId = assertNonEmptyString(input.user_id, "user_id");
      const requestId = assertNonEmptyString(input.request_id, "request_id");

      const request = await prismaClient.rhRequest.findFirst({
        where: { id: requestId, organization_id: organizationId },
        select: {
          id: true,
          requester_user_id: true,
          assigned_to_user_id: true,
        },
      });

      if (!request) {
        throw new ServiceError(404, "Chamado não encontrado.");
      }

      assertUserIsParticipant(request, userId);

      return await prismaClient.rhMessage.findMany({
        where: {
          request_id: requestId,
          organization_id: organizationId,
        },
        orderBy: { created_at: "asc" },
        select: MESSAGE_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao listar mensagens do chamado RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar mensagens. ${msg}`, err);
    }
  }
}

export { MessageService };
