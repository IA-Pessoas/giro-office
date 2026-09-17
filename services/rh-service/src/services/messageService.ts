import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import { rhNotificationService } from "./rhNotificationService.js";
import { isRhRequestMessageObjectPath } from "./rhRequestMessageStorage.js";

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
  sender: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
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
  can_manage_rh?: boolean;
}

export interface MessageListByRequestInput {
  organization_id: string;
  user_id: string;
  request_id: string;
  can_manage_rh?: boolean;
}

function assertUserCanAccessRequest(
  request: { requester_user_id: string; assigned_to_user_id: string },
  userId: string,
  canManageRh = false,
): void {
  if (canManageRh) return;
  if (request.requester_user_id !== userId && request.assigned_to_user_id !== userId) {
    throw new ServiceError(403, "Você não tem permissão para acessar este chamado.");
  }
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

      const transactionResult = await prismaClient.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const request = await tx.rhRequest.findFirst({
            where: { id: requestId, organization_id: organizationId },
            select: {
              id: true,
              title: true,
              requester_user_id: true,
              assigned_to_user_id: true,
              status: true,
            },
          });

          if (!request) {
            throw new ServiceError(404, "Chamado não encontrado.");
          }

          assertUserCanAccessRequest(request, senderUserId, input.can_manage_rh);

          if (attachment && !isRhRequestMessageObjectPath(attachment, organizationId, requestId)) {
            throw new ServiceError(400, "O anexo informado não pertence a esta mensagem de RH.");
          }

          if (request.status === "Closed") {
            throw new ServiceError(
              409,
              "Não é possível enviar mensagens em uma solicitação fechada.",
            );
          }

          if (!input.can_manage_rh) {
            if (type === "Solution" && request.assigned_to_user_id !== senderUserId) {
              throw new ServiceError(403, "Somente o responsável pode enviar a solução.");
            }
            if (
              (type === "Rejection" || type === "Acceptance") &&
              request.requester_user_id !== senderUserId
            ) {
              throw new ServiceError(403, "Somente o solicitante pode responder à solução.");
            }
          }

          const expectedStatusByType: Record<RhMessageTypeInput, string | null> = {
            Message: null,
            Solution: "In_Progress",
            Rejection: "Resolved",
            Acceptance: "Resolved",
          };
          const expectedStatus = expectedStatusByType[type];
          if (expectedStatus !== null && request.status !== expectedStatus) {
            throw new ServiceError(409, "A mensagem de workflow não corresponde ao status atual.");
          }

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

          const nextStatus =
            type === "Solution"
              ? "Resolved"
              : type === "Rejection"
                ? "In_Progress"
                : type === "Acceptance"
                  ? "Closed"
                  : request.status === "New"
                    ? "In_Progress"
                    : null;
          if (nextStatus !== null) {
            await tx.rhRequest.update({
              where: { id: requestId },
              data: { status: nextStatus },
            });
          }

          const recipients = [request.requester_user_id, request.assigned_to_user_id].filter(
            (recipientId, index, all) =>
              recipientId !== senderUserId && all.indexOf(recipientId) === index,
          );
          return { created, recipients, requestTitle: request.title };
        },
      );

      for (const recipientId of transactionResult.recipients) {
        await rhNotificationService.notify({
          organization_id: organizationId,
          user_id: recipientId,
          request_id: requestId,
          event_key: `message:${transactionResult.created.id}`,
          title: "Atualização em solicitação de RH",
          message: `A solicitação “${transactionResult.requestTitle}” recebeu uma nova atualização.`,
        });
      }

      return transactionResult.created;
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

      assertUserCanAccessRequest(request, userId, input.can_manage_rh);

      const messages = await prismaClient.rhMessage.findMany({
        where: {
          request_id: requestId,
          organization_id: organizationId,
        },
        orderBy: { created_at: "asc" },
        select: MESSAGE_SELECT,
      });

      if (messages.length > 0) {
        await prismaClient.rhMessageRead.createMany({
          data: messages.map((message) => ({
            message_id: message.id,
            user_id: userId,
            organization_id: organizationId,
          })),
          skipDuplicates: true,
        });
      }

      return messages.map((message) => ({ ...message, is_read: true })) as RhMessageSnapshot[];
    } catch (err: unknown) {
      logError("Erro ao listar mensagens do chamado RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar mensagens. ${msg}`, err);
    }
  }
}

export { MessageService };
