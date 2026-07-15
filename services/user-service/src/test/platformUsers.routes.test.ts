import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  gatewayAuthHeaders,
  gatewayPlatformAuthHeaders,
  resetUserRouteMocks,
  userServiceMock,
} from "./userTestUtils.js";

describe("platform organization user routes", () => {
  beforeEach(() => {
    resetUserRouteMocks();
  });

  it("GET /platform/organizations/:organizationId/users lista usuarios da organizacao alvo", async () => {
    userServiceMock.list.mockResolvedValue({ users: [{ id: "user-1" }], total: 1 });
    const app = createTestApp();

    const res = await request(app)
      .get("/platform/organizations/org-1/users")
      .set(gatewayPlatformAuthHeaders())
      .query({ skip: 0, take: 20 });

    expect(res.status).toBe(200);
    expect(userServiceMock.list).toHaveBeenCalledWith({
      skip: 0,
      take: 20,
      organizationId: "org-1",
    });
  });

  it("POST /platform/organizations/:organizationId/users cria usuario na organizacao alvo", async () => {
    userServiceMock.create.mockResolvedValue({ id: "user-2" });
    const app = createTestApp();

    const res = await request(app)
      .post("/platform/organizations/org-1/users")
      .set(gatewayPlatformAuthHeaders())
      .send({
        name: "Novo Usuario",
        login: "novo.usuario",
        password: "secret",
        department_id: "dep-1",
        permission: 1,
      });

    expect(res.status).toBe(201);
    expect(userServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        first_owner_flag: false,
      }),
    );
  });

  it("POST /platform/organizations/:organizationId/users sempre cria sem first_owner_flag", async () => {
    userServiceMock.create.mockResolvedValue({ id: "user-2" });
    const app = createTestApp();

    const res = await request(app)
      .post("/platform/organizations/org-1/users")
      .set(gatewayPlatformAuthHeaders())
      .send({
        name: "Novo Owner",
        login: "novo.owner",
        password: "secret",
        department_id: "dep-1",
        permission: 2,
        type: "owner",
        first_owner_flag: true,
      });

    expect(res.status).toBe(201);
    expect(userServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        first_owner_flag: false,
        organization_id: "org-1",
      }),
    );
  });

  it("PATCH /platform/organizations/:organizationId/users/:userId atualiza usuario alvo", async () => {
    userServiceMock.update.mockResolvedValue({ id: "user-2", name: "Atualizado" });
    const app = createTestApp();

    const res = await request(app)
      .patch("/platform/organizations/org-1/users/user-2")
      .set(gatewayPlatformAuthHeaders())
      .send({ name: "Atualizado" });

    expect(res.status).toBe(200);
    expect(userServiceMock.update).toHaveBeenCalledWith("user-2", { name: "Atualizado" }, "org-1");
  });

  it("DELETE /platform/organizations/:organizationId/users/:userId desativa usuario alvo", async () => {
    userServiceMock.delete.mockResolvedValue(undefined);
    const app = createTestApp();

    const res = await request(app)
      .delete("/platform/organizations/org-1/users/user-2")
      .set(gatewayPlatformAuthHeaders());

    expect(res.status).toBe(200);
    expect(userServiceMock.delete).toHaveBeenCalledWith("user-2", "org-1");
  });

  it("bloqueia usuario organizacional nas rotas de usuarios da plataforma", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/platform/organizations/org-1/users")
      .set(gatewayAuthHeaders({ permission: 2, type: "owner" }));

    expect(res.status).toBe(403);
    expect(userServiceMock.list).not.toHaveBeenCalled();
  });

  it("rejeita query invalida na listagem de usuarios da plataforma", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/platform/organizations/org-1/users")
      .set(gatewayPlatformAuthHeaders())
      .query({ skip: 0, take: 0 });

    expect(res.status).toBe(400);
    expect(userServiceMock.list).not.toHaveBeenCalled();
  });

  it("rejeita body invalido ao criar usuario via plataforma", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/platform/organizations/org-1/users")
      .set(gatewayPlatformAuthHeaders())
      .send({
        name: "Novo Usuario",
        login: "novo.usuario",
        department_id: "dep-1",
        permission: 1,
      });

    expect(res.status).toBe(400);
    expect(userServiceMock.create).not.toHaveBeenCalled();
  });
});
