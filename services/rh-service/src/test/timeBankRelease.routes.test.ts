import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  resetRhRouteMocks,
  timeBankReleaseServiceMock,
} from "./rhTestUtils.js";

describe("timeBankRelease routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("GET /rh/time-bank-releases/list lista lancamentos", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/time-bank-releases/list").query({
      user_id: userId,
      is_approved: "true",
      date_from: "2025-01-01",
      date_to: "2025-01-31",
    });

    expect(res.status).toBe(200);
    expect(timeBankReleaseServiceMock.list).toHaveBeenCalledTimes(1);
  });

  it("POST /rh/time-bank-releases cria lancamento", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/time-bank-releases").send({
      user_id: userId,
      date: "2025-01-15",
      minutes: 120,
      reason: "Hora extra",
    });

    expect(res.status).toBe(200);
    expect(timeBankReleaseServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("PUT /rh/time-bank-releases/approve aprova lancamento", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/time-bank-releases/approve").send({ id: itemId });

    expect(res.status).toBe(200);
    expect(timeBankReleaseServiceMock.approve).toHaveBeenCalledTimes(1);
  });
});
