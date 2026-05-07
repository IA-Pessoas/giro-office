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
    expect(permissionServiceMock.getByUserId).toHaveBeenCalledWith("user-3", "users");
  });

  it("PUT /user/permission/:userId atualiza permissao", async () => {
    permissionServiceMock.update.mockResolvedValue({ users: 2 });
    const app = createTestApp();

    const res = await request(app).put("/user/permission/user-3").set(gatewayAuthHeaders()).send({
      users: 2,
      finance: null,
    });

    expect(res.status).toBe(200);
    expect(permissionServiceMock.update).toHaveBeenCalledWith("user-3", {
      users: 2,
      finance: null,
    });
  });
});
