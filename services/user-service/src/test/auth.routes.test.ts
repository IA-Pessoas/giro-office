import { ServiceError } from "@workspace/shared";
import { createMemoryRateLimitStore } from "@workspace/shared/http";
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
  beforeEach(() => {
    resetUserRouteMocks();
  });

  it("POST /user/session autentica com payload valido", async () => {
    authServiceMock.login.mockResolvedValue({ token: "jwt" });
    const app = createTestApp();

    const res = await request(app).post("/user/session").send({
      login: "admin",
      password: "secret",
    });

    expect(res.status).toBe(200);
    expect(authServiceMock.login).toHaveBeenCalledWith({ login: "admin", password: "secret" });
  });

  it("bloqueia o quarto login paralelo da mesma conta normalizada em IPs distintos", async () => {
    authServiceMock.login.mockResolvedValue({ token: "jwt" });
    const app = createTestApp(
      {
        trustedProxyCidrs: ["127.0.0.1/32"],
        authRateLimitIpMax: 10,
        authRateLimitAccountMax: 3,
        authRateLimitIpAccountMax: 10,
        authRateLimitDegradationMode: "block",
      },
      { rateLimitStore: createMemoryRateLimitStore() },
    );

    const responses = await Promise.all(
      ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"].map((ip) =>
        request(app)
          .post("/user/session")
          .set("X-Forwarded-For", ip)
          .send({ login: " A@EXAMPLE.COM ", password: "secret" }),
      ),
    );

    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
    expect(responses.find((response) => response.status === 429)?.headers["retry-after"]).toMatch(
      /^\d+$/,
    );
  });

  it("bloqueia o login quando o armazenamento distribuído está indisponível", async () => {
    const app = createTestApp(
      { authRateLimitDegradationMode: "block" },
      { rateLimitStore: { consume: async () => Promise.reject(new Error("unavailable")) } },
    );

    const response = await request(app)
      .post("/user/session")
      .send({ login: "account", password: "secret" });

    expect(response.status).toBe(503);
    expect(authServiceMock.login).not.toHaveBeenCalled();
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
