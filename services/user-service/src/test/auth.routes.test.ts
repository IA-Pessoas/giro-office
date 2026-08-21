import { ServiceError } from "@workspace/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  authServiceMock,
  createTestApp,
  gatewayAuthHeaders,
  resetUserRouteMocks,
  userServiceMock,
} from "./userTestUtils.js";

describe("auth routes", () => {
  const issuedSessionFixture = {
    id: "user-1",
    name: "Admin",
    login: "admin",
    permission: 2,
    modules: {},
    department_id: "dep-1",
    organization_id: "org-1",
    token: "signed.jwt",
    csrfToken: "A".repeat(43),
  };

  beforeEach(() => {
    resetUserRouteMocks();
  });

  it("POST /user/session autentica com payload valido", async () => {
    authServiceMock.login.mockResolvedValue(issuedSessionFixture);
    const app = createTestApp();

    const res = await request(app).post("/user/session").send({
      login: "admin",
      password: "secret",
    });

    expect(res.status).toBe(200);
    expect(authServiceMock.login).toHaveBeenCalledWith({ login: "admin", password: "secret" });
  });

  it("POST /user/session emite cookies seguros sem expor o JWT", async () => {
    authServiceMock.login.mockResolvedValue(issuedSessionFixture);

    const response = await request(createTestApp({ authCookieSecure: true }))
      .post("/user/session")
      .send({ login: "admin", password: "secret" });

    expect(response.status).toBe(200);
    expect(response.body.data.token).toBeUndefined();
    expect(response.body.data.csrfToken).toBeUndefined();
    const cookies = response.headers["set-cookie"] ?? [];
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("cw.session=signed.jwt");
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[0]).toContain("Secure");
    expect(cookies[0]).toContain("SameSite=Lax");
    expect(cookies[0]).toContain("Max-Age=86400");
    expect(cookies[1]).toContain("cw.csrf=");
    expect(cookies[1]).not.toContain("HttpOnly");
  });

  it("POST /user/session/refresh rotaciona ambos os cookies", async () => {
    authServiceMock.refreshSession.mockResolvedValue(issuedSessionFixture);

    const response = await request(createTestApp({ authCookieSecure: true }))
      .post("/user/session/refresh")
      .set(gatewayAuthHeaders({ userId: "user-1", organizationId: "org-1", sessionVersion: 1 }));

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toHaveLength(2);
    expect(response.body.data.token).toBeUndefined();
    expect(authServiceMock.refreshSession).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      session_version: 1,
      session_id: "session-1",
      csrf_hash: "a".repeat(64),
    });
  });

  it("DELETE /user/session revoga a versão e expira ambos os cookies", async () => {
    const response = await request(createTestApp({ authCookieSecure: true }))
      .delete("/user/session")
      .set(gatewayAuthHeaders({ userId: "user-1", organizationId: "org-1", sessionVersion: 1 }));

    expect(response.status).toBe(200);
    expect(authServiceMock.revokeSession).toHaveBeenCalledWith("user-1", "session-1");
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("cw.session=; Max-Age=0")]),
    );
  });

  it("POST /user/session serializa a falha genérica sem redirect", async () => {
    authServiceMock.login.mockRejectedValue(new ServiceError(401, "Login ou senha inválidos."));

    const response = await request(createTestApp())
      .post("/user/session")
      .send({ login: "account", password: "secret" });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: "Login ou senha inválidos.",
      code: "UNAUTHORIZED",
    });
    expect(Object.keys(response.body).sort()).toEqual(["code", "error", "requestId", "success"]);
    expect(response.headers.location).toBeUndefined();
  });

  it("POST /user/start-config executa configuracao inicial", async () => {
    authServiceMock.firstCreate.mockResolvedValue({ id: "user-1" });
    const app = createTestApp();

    const res = await request(app).post("/user/start-config");

    expect(res.status).toBe(200);
    expect(authServiceMock.firstCreate).toHaveBeenCalledTimes(1);
  });

  it("GET /user/me usa o usuario encaminhado pelo gateway", async () => {
    userServiceMock.getByIdWithModules.mockResolvedValue({
      id: "user-1",
      organization_id: "a0000000-0000-4000-8000-000000000001",
      modules: { contabil: 1, rh: 1, ti: 1 },
    });
    const app = createTestApp();

    const res = await request(app)
      .get("/user/me")
      .set(gatewayAuthHeaders({ userId: "user-1" }));

    expect(res.status).toBe(200);
    expect(res.body.data.modules).toEqual({ contabil: 1, rh: 1, ti: 1 });
    expect(userServiceMock.getByIdWithModules).toHaveBeenCalledWith(
      "user-1",
      "a0000000-0000-4000-8000-000000000001",
    );
  });

  it("GET /user/session/validate confirma o contexto autenticado", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/user/session/validate")
      .set(gatewayAuthHeaders({ userId: "user-1" }));

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
  });
});
