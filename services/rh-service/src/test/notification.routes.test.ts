import { FORWARDED_AUTH_PERMISSION_HEADER } from "@workspace/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetRhRouteMocks } from "./rhTestUtils.js";

describe("notification routes", () => {
  const notificationId = "00000000-0000-4000-8000-000000000010";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("GET /rh/notifications permite leitura com a permissão RH básica", async () => {
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app).get("/rh/notifications");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("PUT /rh/notifications/read marca todas as notificações do usuário", async () => {
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app).put("/rh/notifications/read").send({ all: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ count: 0 });
  });

  it("PUT /rh/notifications/read aceita o escopo de uma solicitação", async () => {
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app)
      .put("/rh/notifications/read")
      .send({ request_id: notificationId });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ count: 0 });
  });

  it("bloqueia notificações sem permissão RH", async () => {
    const app = createTestApp({ rhPermission: 0 });
    const res = await request(app)
      .get("/rh/notifications")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "0");

    expect(res.status).toBe(403);
  });
});
