import { error as logError, ServiceError } from "@workspace/shared";

import { prismaClient } from "../integrations/prisma.js";

interface RhNotificationRecord {
  id: string;
  user_id: string;
  request_id: string;
  event_key: string;
  title: string;
  message: string;
  read: boolean;
  created_at: Date;
  organization_id: string;
}

export interface RhNotificationCreateInput {
  organization_id: string;
  user_id: string;
  request_id: string;
  event_key: string;
  title: string;
  message: string;
}

export type RhNotificationSnapshot = RhNotificationRecord;

export class RhNotificationService {
  async notify(input: RhNotificationCreateInput): Promise<void> {
    try {
      await prismaClient.rhNotification.upsert({
        where: {
          organization_id_user_id_request_id_event_key: {
            organization_id: input.organization_id,
            user_id: input.user_id,
            request_id: input.request_id,
            event_key: input.event_key,
          },
        },
        create: input,
        update: {},
      });
    } catch (err: unknown) {
      logError("Erro ao persistir notificação RH", {
        err,
        organizationId: input.organization_id,
        userId: input.user_id,
        requestId: input.request_id,
        eventKey: input.event_key,
      });
    }
  }

  async list(organizationId: string, userId: string): Promise<RhNotificationSnapshot[]> {
    try {
      return await prismaClient.rhNotification.findMany({
        where: { organization_id: organizationId, user_id: userId },
        orderBy: { created_at: "desc" },
        take: 50,
      });
    } catch (err: unknown) {
      logError("Erro ao listar notificações RH", { err });
      throw new ServiceError(500, "Erro interno ao listar notificações RH.", err);
    }
  }

  async markRead(input: {
    organization_id: string;
    user_id: string;
    id?: string;
    request_id?: string;
    all?: boolean;
  }): Promise<{ count: number }> {
    const where: Record<string, unknown> = {
      organization_id: input.organization_id,
      user_id: input.user_id,
      read: false,
    };
    if (input.id) where.id = input.id;
    if (input.request_id) where.request_id = input.request_id;

    try {
      return await prismaClient.rhNotification.updateMany({
        where,
        data: { read: true },
      });
    } catch (err: unknown) {
      logError("Erro ao marcar notificação RH como lida", { err });
      throw new ServiceError(500, "Erro interno ao atualizar notificações RH.", err);
    }
  }
}

export const rhNotificationService = new RhNotificationService();
