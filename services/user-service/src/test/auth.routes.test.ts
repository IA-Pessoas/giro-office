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

    const res = await request(app).get("/user/me").set(gatewayAuthHeaders({ userId: "user-1" }));

    expect(res.status).toBe(200);
    expect(userServiceMock.getById).toHaveBeenCalledWith("user-1");
  });
});
