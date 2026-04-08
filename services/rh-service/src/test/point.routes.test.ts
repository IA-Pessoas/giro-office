import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, pointServiceMock, resetRhRouteMocks } from "./rh-test-utils.js";

describe("point routes", () => {
  const pointId = "00000000-0000-4000-8000-000000000010";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/point/register registra ponto", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/point/register");

    expect(res.status).toBe(200);
    expect(pointServiceMock.registerPoint).toHaveBeenCalledTimes(1);
  });

  it("POST /rh/point/:pointId/calculate calcula horas", async () => {
    const app = createTestApp();
    const res = await request(app).post(`/rh/point/${pointId}/calculate`);

    expect(res.status).toBe(200);
    expect(pointServiceMock.calculateDailyHours).toHaveBeenCalledWith(pointId, organizationId);
  });
});
