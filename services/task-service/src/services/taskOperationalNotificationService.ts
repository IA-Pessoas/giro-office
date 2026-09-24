import { INTEGRACAO_PERMISSION_LEVEL, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type prismaClient from "../prisma/index.js";

const RETENTION_DAYS = 90;

export const TASK_OPERATIONAL_NOTIFICATION_TYPE = {
  COMPLETION_REQUEST: "completion_request",
  COMPLETION_DECISION: "completion_decision",
  TASK_CHANGED: "task_changed",
} as const;

export type TaskOperationalNotificationType =
  (typeof TASK_OPERATIONAL_NOTIFICATION_TYPE)[keyof typeof TASK_OPERATIONAL_NOTIFICATION_TYPE];

type NotificationPrisma = Pick<
  Prisma.TransactionClient,
  "permission" | "taskOperationalNotification" | "user"
>;

export type TaskOperationalNotification = {
  id: string;
  task_id: string;
  type: string;
  title: string;
  message: string;
  read_at: Date | null;
  created_at: Date;
};

export async function publishTaskOperationalNotifications(
  prisma: NotificationPrisma,
  input: {
    organization_id: string;
    task_id: string;
    event_key: string;
    type: TaskOperationalNotificationType;
    title: string;
    message: string;
    responsible_ids: Array<string | null | undefined>;
    include_administrators?: boolean;
    exclude_user_id?: string;
  },
): Promise<void> {
  const responsibleIds = [
    ...new Set(input.responsible_ids.filter((id): id is string => Boolean(id))),
  ];
  const [responsibles, administrators] = await Promise.all([
    responsibleIds.length > 0
      ? prisma.user.findMany({
          where: {
            id: { in: responsibleIds },
            status: "active",
            OR: [
              { organization_id: input.organization_id },
              { department: { organization_id: input.organization_id } },
            ],
          },
          select: { id: true },
        })
      : [],
    input.include_administrators
      ? prisma.permission.findMany({
          where: {
            organization_id: input.organization_id,
            integracao: { gte: INTEGRACAO_PERMISSION_LEVEL.ADMIN },
            user: { status: "active" },
          },
          select: { user_id: true },
        })
      : [],
  ]);
  /** O proprietário administra a Integração por bypass, sem nível no módulo. */
  const owners = input.include_administrators
    ? await prisma.user.findMany({
        where: { organization_id: input.organization_id, status: "active", type: "owner" },
        select: { id: true },
      })
    : [];
  const recipientIds = new Set([
    ...responsibles.map(({ id }) => id),
    ...administrators.map(({ user_id }) => user_id),
    ...owners.map(({ id }) => id),
  ]);
  if (input.exclude_user_id) recipientIds.delete(input.exclude_user_id);
  if (recipientIds.size === 0) return;

  await prisma.taskOperationalNotification.createMany({
    data: [...recipientIds].map((recipient_id) => ({
      organization_id: input.organization_id,
      recipient_id,
      task_id: input.task_id,
      event_key: input.event_key,
      type: input.type,
      title: input.title,
      message: input.message,
    })),
    skipDuplicates: true,
  });
}

export class TaskOperationalNotificationService {
  constructor(private readonly prisma: typeof prismaClient) {}

  async list(input: {
    user_id: string;
    organization_id: string;
  }): Promise<{ items: TaskOperationalNotification[]; unread_count: number }> {
    const now = new Date();
    const retentionDate = new Date(now);
    retentionDate.setUTCDate(retentionDate.getUTCDate() - RETENTION_DAYS);
    await this.prisma.taskOperationalNotification.updateMany({
      where: {
        organization_id: input.organization_id,
        recipient_id: input.user_id,
        archived_at: null,
        created_at: { lt: retentionDate },
      },
      data: { archived_at: now },
    });
    const where = {
      organization_id: input.organization_id,
      recipient_id: input.user_id,
      archived_at: null,
    };
    const [items, unread_count] = await Promise.all([
      this.prisma.taskOperationalNotification.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: 50,
        select: {
          id: true,
          task_id: true,
          type: true,
          title: true,
          message: true,
          read_at: true,
          created_at: true,
        },
      }),
      this.prisma.taskOperationalNotification.count({ where: { ...where, read_at: null } }),
    ]);
    return { items, unread_count };
  }

  async markRead(input: {
    user_id: string;
    organization_id: string;
    notification_id: string;
  }): Promise<{ id: string; read_at: Date }> {
    const notification = await this.prisma.taskOperationalNotification.findFirst({
      where: {
        id: input.notification_id,
        organization_id: input.organization_id,
        recipient_id: input.user_id,
        archived_at: null,
      },
      select: { id: true, read_at: true },
    });
    if (!notification) throw new ServiceError(404, "Notificação não encontrada.");
    const read_at = notification.read_at ?? new Date();
    if (!notification.read_at) {
      await this.prisma.taskOperationalNotification.updateMany({
        where: { id: notification.id, recipient_id: input.user_id, read_at: null },
        data: { read_at },
      });
    }
    return { id: notification.id, read_at };
  }
}
