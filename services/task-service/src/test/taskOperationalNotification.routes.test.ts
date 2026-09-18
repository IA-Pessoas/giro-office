import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  resetTaskRouteMocks,
  taskOperationalNotificationServiceMock,
} from "./taskTestUtils.js";

describe("task operational notification routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("expõe as notificações persistentes do destinatário com a contagem de não lidas", async () => {
    const response = await request(createTestApp()).get("/task/notifications");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { items: [], unread_count: 0 },
    });
    expect(taskOperationalNotificationServiceMock.list).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
    });
  });

  it("marca somente a notificação informada como lida", async () => {
    const response = await request(createTestApp())
      .put("/task/notifications/read")
      .send({ notification_id: "notification-1" });

    expect(response.status).toBe(200);
    expect(taskOperationalNotificationServiceMock.markRead).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      notification_id: "notification-1",
    });
  });

  it("rejeita corpo desconhecido ao marcar como lida", async () => {
    const response = await request(createTestApp())
      .put("/task/notifications/read")
      .send({ notification_id: "notification-1", extra: true });

    expect(response.status).toBe(400);
    expect(taskOperationalNotificationServiceMock.markRead).not.toHaveBeenCalled();
  });
});
