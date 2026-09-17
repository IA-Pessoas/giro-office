import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    rhNotification: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { RhNotificationService } from "../services/rhNotificationService.js";

describe("RhNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplica o mesmo evento por organização, usuário e solicitação", async () => {
    const service = new RhNotificationService();
    const input = {
      organization_id: "org-1",
      user_id: "user-1",
      request_id: "request-1",
      event_key: "message-1",
      title: "Atualização",
      message: "Nova mensagem",
    };

    await service.notify(input);

    expect(prismaMock.rhNotification.upsert).toHaveBeenCalledWith({
      where: {
        organization_id_user_id_request_id_event_key: {
          organization_id: "org-1",
          user_id: "user-1",
          request_id: "request-1",
          event_key: "message-1",
        },
      },
      create: input,
      update: {},
    });
  });

  it("lista apenas as notificações do usuário na organização", async () => {
    const notifications = [{ id: "notification-1" }];
    prismaMock.rhNotification.findMany.mockResolvedValue(notifications);
    const service = new RhNotificationService();

    const result = await service.list("org-1", "user-1");

    expect(result).toBe(notifications);
    expect(prismaMock.rhNotification.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", user_id: "user-1" },
      orderBy: { created_at: "desc" },
      take: 50,
    });
  });

  it("marca somente notificações não lidas no escopo do usuário", async () => {
    prismaMock.rhNotification.updateMany.mockResolvedValue({ count: 1 });
    const service = new RhNotificationService();

    const result = await service.markRead({
      organization_id: "org-1",
      user_id: "user-1",
      request_id: "request-1",
    });

    expect(result).toEqual({ count: 1 });
    expect(prismaMock.rhNotification.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        user_id: "user-1",
        read: false,
        request_id: "request-1",
      },
      data: { read: true },
    });
  });
});
