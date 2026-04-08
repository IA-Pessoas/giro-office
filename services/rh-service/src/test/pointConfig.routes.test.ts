import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, pointConfigServiceMock, resetRhRouteMocks } from "./rhTestUtils.js";

describe("pointConfig routes", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("PUT /rh/point-config upsert config", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/point-config").send({
      start_time: "08:00",
      lunch_break: "12:00",
      lunch_return: "13:00",
      end_time: "18:00",
      work_days: "1,2,3,4,5",
    });

    expect(res.status).toBe(200);
    expect(pointConfigServiceMock.upsert).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/point-config busca config do usuario autenticado", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/point-config");

    expect(res.status).toBe(200);
    expect(pointConfigServiceMock.getByUserId).toHaveBeenCalledWith(userId, organizationId);
  });

  it("GET /rh/point-config/:userId busca config por usuario", async () => {
    const app = createTestApp();
    const res = await request(app).get(`/rh/point-config/${userId}`);

    expect(res.status).toBe(200);
    expect(pointConfigServiceMock.getByUserId).toHaveBeenCalledWith(userId, organizationId);
  });
});
