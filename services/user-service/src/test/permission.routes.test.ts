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
      .query({ modulo: "users" });

    expect(res.status).toBe(200);
    expect(permissionServiceMock.getByUserId).toHaveBeenCalledWith(
      "user-3",
      "users",
      "a0000000-0000-4000-8000-000000000001",
    );
  });

  it("PUT /user/permission/:userId atualiza permissao", async () => {
    permissionServiceMock.update.mockResolvedValue({ users: 2 });
    const app = createTestApp();

    const res = await request(app).put("/user/permission/user-3").set(gatewayAuthHeaders()).send({
      users: 2,
      finance: null,
    });

    expect(res.status).toBe(200);
    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-3",
      {
        users: 2,
        finance: null,
      },
      "a0000000-0000-4000-8000-000000000001",
    );
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
