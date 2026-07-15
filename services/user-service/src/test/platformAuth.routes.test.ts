import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  gatewayPlatformAuthHeaders,
  platformAuthServiceMock,
  resetUserRouteMocks,
} from "./userTestUtils.js";

describe("platform auth routes", () => {
  beforeEach(() => {
    resetUserRouteMocks();
  });

  it("POST /platform/session autentica usuario de plataforma", async () => {
    platformAuthServiceMock.login.mockResolvedValue({
      id: "platform-1",
      name: "Dev Admin",
      email: "dev@example.com",
      platform_role: "super_admin",
      token: "platform-jwt",
    });

    const app = createTestApp();
    const res = await request(app).post("/platform/session").send({
      email: "dev@example.com",
      password: "secret",
    });

    expect(res.status).toBe(200);
    expect(platformAuthServiceMock.login).toHaveBeenCalledWith({
      email: "dev@example.com",
      password: "secret",
    });
  });

  it("GET /platform/me retorna usuario de plataforma encaminhado", async () => {
    platformAuthServiceMock.getMe.mockResolvedValue({
      id: "platform-1",
      name: "Dev Admin",
      email: "dev@example.com",
      platform_role: "super_admin",
      status: "active",
    });

    const app = createTestApp();
    const res = await request(app).get("/platform/me").set(gatewayPlatformAuthHeaders());

    expect(res.status).toBe(200);
    expect(platformAuthServiceMock.getMe).toHaveBeenCalledWith("platform-1");
  });

  it("POST /platform/support-sessions cria sessao de suporte auditavel", async () => {
    platformAuthServiceMock.startSupportSession.mockResolvedValue({
      support_session_id: "support-1",
      organization_id: "a0000000-0000-4000-8000-000000000001",
      reason: "debug de permissao",
      token: "support-jwt",
      expires_at: "2026-07-13T13:00:00.000Z",
    });

    const app = createTestApp();
    const res = await request(app)
      .post("/platform/support-sessions")
      .set(gatewayPlatformAuthHeaders())
      .send({
        organization_id: "a0000000-0000-4000-8000-000000000001",
        reason: "debug de permissao",
      });

    expect(res.status).toBe(201);
    expect(platformAuthServiceMock.startSupportSession).toHaveBeenCalledWith({
      platformUserId: "platform-1",
      organizationId: "a0000000-0000-4000-8000-000000000001",
      reason: "debug de permissao",
    });
  });

  it("DELETE /platform/support-sessions/current encerra sessao de suporte atual", async () => {
    platformAuthServiceMock.endSupportSession.mockResolvedValue({
      platform_user_id: "platform-1",
      support_session_id: "support-1",
    });

    const app = createTestApp();
    const res = await request(app)
      .delete("/platform/support-sessions/current")
      .set(gatewayPlatformAuthHeaders({ supportSessionId: "support-1" }));

    expect(res.status).toBe(200);
    expect(platformAuthServiceMock.endSupportSession).toHaveBeenCalledWith(
      "platform-1",
      "support-1",
    );
  });
});
