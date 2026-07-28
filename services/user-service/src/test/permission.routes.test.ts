import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  gatewayAuthHeaders,
  permissionServiceMock,
  resetUserRouteMocks,
} from "./userTestUtils.js";

describe("permission routes", () => {
  beforeEach(() => {
    resetUserRouteMocks();
  });

  it("GET /user/permission/:userId busca permissao", async () => {
    permissionServiceMock.getByUserId.mockResolvedValue({ users: 1 });
    const app = createTestApp();

    const res = await request(app)
      .get("/user/permission/user-3")
      .set(gatewayAuthHeaders())
      .query({ modulo: "fiscal" });

    expect(res.status).toBe(200);
    expect(permissionServiceMock.getByUserId).toHaveBeenCalledWith(
      "user-3",
      "fiscal",
      "a0000000-0000-4000-8000-000000000001",
    );
  });

  it("PUT /user/permission/:userId atualiza permissao", async () => {
    permissionServiceMock.update.mockResolvedValue({ ti: 3 });
    const app = createTestApp();

    const res = await request(app).put("/user/permission/user-3").set(gatewayAuthHeaders()).send({
      ti: 3,
    });

    expect(res.status).toBe(200);
    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-3",
      {
        ti: 3,
      },
      "a0000000-0000-4000-8000-000000000001",
      { actorUserId: "c0000000-0000-4000-8000-000000000001" },
    );
  });

  it("PUT /user/permission/:userId bloqueia admin RH; niveis sao alterados pelo owner", async () => {
    permissionServiceMock.update.mockResolvedValue({ financeiro: 1 });
    const app = createTestApp();

    const res = await request(app)
      .put("/user/permission/user-3")
      .set(gatewayAuthHeaders({ permission: 1, type: "admin", modules: { rh: 3 } }))
      .send({
        financeiro: 1,
      });

    expect(res.status).toBe(403);
    expect(permissionServiceMock.update).not.toHaveBeenCalled();
  });

  it("PUT /user/permission/:userId persiste zero ao revogar permissao de TI", async () => {
    permissionServiceMock.update.mockResolvedValue({ ti: 0 });
    const app = createTestApp();

    const res = await request(app).put("/user/permission/user-3").set(gatewayAuthHeaders()).send({
      ti: 0,
    });

    expect(res.status).toBe(200);
    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-3",
      {
        ti: 0,
      },
      "a0000000-0000-4000-8000-000000000001",
      { actorUserId: "c0000000-0000-4000-8000-000000000001" },
    );
  });

  it("rejeita módulos de permissão aposentados no query e no payload", async () => {
    const app = createTestApp();

    const getRes = await request(app)
      .get("/user/permission/user-3")
      .set(gatewayAuthHeaders())
      .query({ modulo: "pec" });
    const putRes = await request(app)
      .put("/user/permission/user-3")
      .set(gatewayAuthHeaders())
      .send({ atendimento: 2, wiki: 1 });

    expect(getRes.status).toBe(400);
    expect(putRes.status).toBe(400);
    expect(permissionServiceMock.getByUserId).not.toHaveBeenCalled();
    expect(permissionServiceMock.update).not.toHaveBeenCalled();
  });

  it("GET /user/permission/:userId permite admin RH consultar permissoes modulares", async () => {
    permissionServiceMock.getByUserId.mockResolvedValue({ comercial: 2 });
    const app = createTestApp();

    const res = await request(app)
      .get("/user/permission/user-1")
      .set(gatewayAuthHeaders({ permission: 2, type: "admin", modules: { rh: 3 } }))
      .query({ modulo: "comercial" });

    expect(res.status).toBe(200);
    expect(permissionServiceMock.getByUserId).toHaveBeenCalledWith(
      "user-1",
      "comercial",
      "a0000000-0000-4000-8000-000000000001",
    );
  });

  it("PUT /user/permission/:userId permite admin RH atualizar permissoes modulares", async () => {
    permissionServiceMock.update.mockResolvedValue({ comercial: 2 });
    const app = createTestApp();

    const res = await request(app)
      .put("/user/permission/user-1")
      .set(gatewayAuthHeaders({ permission: 2, type: "admin", modules: { rh: 3 } }))
      .send({ comercial: 2 });

    expect(res.status).toBe(403);
    expect(permissionServiceMock.update).not.toHaveBeenCalled();
  });

  it("bloqueia consulta e atualizacao de permissoes para nao-admin", async () => {
    const app = createTestApp();
    const headers = gatewayAuthHeaders({ permission: 1 });

    const getRes = await request(app).get("/user/permission/user-3").set(headers);
    const putRes = await request(app).put("/user/permission/user-3").set(headers).send({
      users: 2,
    });

    expect(getRes.status).toBe(403);
    expect(putRes.status).toBe(403);
    expect(permissionServiceMock.getByUserId).not.toHaveBeenCalled();
    expect(permissionServiceMock.update).not.toHaveBeenCalled();
  });
});
