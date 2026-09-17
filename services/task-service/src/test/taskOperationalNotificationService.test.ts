import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  taskOperationalNotification: {
    updateMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    createMany: vi.fn(),
  },
  user: { findMany: vi.fn() },
  permission: { findMany: vi.fn() },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));

import {
  publishTaskOperationalNotifications,
  TASK_OPERATIONAL_NOTIFICATION_TYPE,
  TaskOperationalNotificationService,
} from "../services/taskOperationalNotificationService.js";

describe("TaskOperationalNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isola a caixa de entrada pelo destinatário e organização", async () => {
    prismaMock.taskOperationalNotification.findMany.mockResolvedValue([]);
    prismaMock.taskOperationalNotification.count.mockResolvedValue(0);

    await expect(
      new TaskOperationalNotificationService().list({
        user_id: "user-1",
        organization_id: "org-1",
      }),
    ).resolves.toEqual({ items: [], unread_count: 0 });

    expect(prismaMock.taskOperationalNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipient_id: "user-1", organization_id: "org-1" }),
      }),
    );
    expect(prismaMock.taskOperationalNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archived_at: expect.any(Date) }) }),
    );
  });

  it("não marca como lida notificação de outro destinatário", async () => {
    prismaMock.taskOperationalNotification.findFirst.mockResolvedValue(null);

    await expect(
      new TaskOperationalNotificationService().markRead({
        user_id: "user-1",
        organization_id: "org-1",
        notification_id: "notification-2",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("inclui o proprietário entre os administradores notificados", async () => {
    prismaMock.user.findMany
      .mockResolvedValueOnce([{ id: "user-1" }])
      .mockResolvedValueOnce([{ id: "owner-1" }]);
    prismaMock.permission.findMany.mockResolvedValue([]);

    await publishTaskOperationalNotifications(prismaMock, {
      organization_id: "org-1",
      task_id: "task-1",
      event_key: "task-reopen:task-1",
      type: TASK_OPERATIONAL_NOTIFICATION_TYPE.TASK_CHANGED,
      title: "Tarefa reaberta",
      message: "Motivo.",
      responsible_ids: ["user-1"],
      include_administrators: true,
    });

    expect(prismaMock.taskOperationalNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ recipient_id: "owner-1" })]),
      skipDuplicates: true,
    });
  });

  it("deduplica o mesmo evento por destinatário e entidade", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1" }, { id: "user-2" }]);
    prismaMock.permission.findMany.mockResolvedValue([{ user_id: "admin-1" }]);

    await publishTaskOperationalNotifications(prismaMock, {
      organization_id: "org-1",
      task_id: "task-1",
      event_key: "postponement:postponement-1",
      type: TASK_OPERATIONAL_NOTIFICATION_TYPE.TASK_CHANGED,
      title: "Tarefa prorrogada",
      message: "Nova previsão.",
      responsible_ids: ["user-1", "user-2", "user-1"],
      include_administrators: true,
      exclude_user_id: "user-1",
    });

    expect(prismaMock.taskOperationalNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          recipient_id: "user-2",
          event_key: "postponement:postponement-1",
        }),
        expect.objectContaining({
          recipient_id: "admin-1",
          event_key: "postponement:postponement-1",
        }),
      ]),
      skipDuplicates: true,
    });
  });
});
