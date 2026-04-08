import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  resetRhRouteMocks,
  timeClockRequestServiceMock,
} from "./rhTestUtils.js";

describe("timeClockRequest routes", () => {
  const requestId = "00000000-0000-4000-8000-000000000010";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/point/adjustment/request cria solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/point/adjustment/request").send({
      point_id: requestId,
      clock_in: "2025-01-01T08:00:00.000Z",
      lunch_out: "2025-01-01T12:00:00.000Z",
      lunch_in: "2025-01-01T13:00:00.000Z",
      clock_out: "2025-01-01T18:00:00.000Z",
      justification: "Ajuste",
    });

    expect(res.status).toBe(200);
    expect(timeClockRequestServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("PUT /rh/point/adjustment/approve aprova solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/point/adjustment/approve").send({
      request_id: requestId,
      obs_approver: "ok",
    });

    expect(res.status).toBe(200);
    expect(timeClockRequestServiceMock.approve).toHaveBeenCalledTimes(1);
  });
});
