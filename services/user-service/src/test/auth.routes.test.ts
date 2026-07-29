import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  authServiceMock,
  createTestApp,
  gatewayAuthHeaders,
  resetUserRouteMocks,
  userOrganizationServiceMock,
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

  it("POST /user/start-config executa configuracao inicial", async () => {
    authServiceMock.firstCreate.mockResolvedValue({ id: "user-1" });
    const app = createTestApp();

    const res = await request(app).post("/user/start-config");

    expect(res.status).toBe(200);
    expect(authServiceMock.firstCreate).toHaveBeenCalledTimes(1);
  });

  it("GET /user/me usa o usuario encaminhado pelo gateway", async () => {
    userServiceMock.getById.mockResolvedValue({ id: "user-1" });
    const app = createTestApp();

    const res = await request(app)
      .get("/user/me")
      .set(gatewayAuthHeaders({ userId: "user-1" }));

    expect(res.status).toBe(200);
    expect(userServiceMock.getById).toHaveBeenCalledWith(
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

  it("GET /user/organizations retorna somente organizações associadas ao usuário", async () => {
    userOrganizationServiceMock.listForUser.mockResolvedValue([
      {
        organization_id: "a0000000-0000-4000-8000-000000000002",
        name: "Organização B",
        slug: "org-b",
        status: "active",
        department_id: "b0000000-0000-4000-8000-000000000002",
      },
    ]);
    const app = createTestApp();

    const res = await request(app)
      .get("/user/organizations")
      .set(gatewayAuthHeaders({ userId: "user-1" }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(userOrganizationServiceMock.listForUser).toHaveBeenCalledWith("user-1");
  });

  it("POST /user/organization/switch emite a sessão da organização selecionada", async () => {
    userOrganizationServiceMock.switchOrganization.mockResolvedValue({
      token: "jwt-org-b",
      organization_id: "a0000000-0000-4000-8000-000000000002",
      modules: { ti: 2 },
    });
    const app = createTestApp();

    const res = await request(app)
      .post("/user/organization/switch")
      .set(gatewayAuthHeaders({ userId: "user-1" }))
      .send({ organization_id: "a0000000-0000-4000-8000-000000000002" });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe("jwt-org-b");
    expect(userOrganizationServiceMock.switchOrganization).toHaveBeenCalledWith(
      "user-1",
      "a0000000-0000-4000-8000-000000000002",
    );
  });

  it("POST /user/organization/switch rejeita chaves desconhecidas", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/user/organization/switch")
      .set(gatewayAuthHeaders({ userId: "user-1" }))
      .send({
        organization_id: "a0000000-0000-4000-8000-000000000002",
        extra: true,
      });

    expect(res.status).toBe(400);
    expect(userOrganizationServiceMock.switchOrganization).not.toHaveBeenCalled();
  });
});
