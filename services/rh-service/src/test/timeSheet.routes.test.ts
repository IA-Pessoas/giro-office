import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetRhRouteMocks, timeSheetServiceMock } from "./rh-test-utils.js";

describe("timeSheet routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/timesheets cria folha", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/timesheets").send({
      user_id: userId,
      start_time: "2025-01-01T08:00:00.000Z",
      end_time: "2025-01-01T18:00:00.000Z",
    });

    expect(res.status).toBe(200);
    expect(timeSheetServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/timesheets lista folhas", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/timesheets").query({ target_user_id: userId });

    expect(res.status).toBe(200);
    expect(timeSheetServiceMock.list).toHaveBeenCalledWith({
      organization_id: organizationId,
      user_id: userId,
    });
  });

  it("PUT /rh/timesheets/sign assina folha", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/timesheets/sign").send({
      id: itemId,
      signature: "assinatura",
    });

    expect(res.status).toBe(200);
    expect(timeSheetServiceMock.sign).toHaveBeenCalledTimes(1);
  });
});
