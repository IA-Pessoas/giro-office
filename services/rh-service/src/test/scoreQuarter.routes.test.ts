import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  resetRhRouteMocks,
  scoreQuarterServiceMock,
  setRhRoutePermission,
} from "./rhTestUtils.js";

describe("scoreQuarter routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/score/quarters/generate gera score", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/score/quarters/generate").send({
      target_user_id: userId,
      quarter: "2025Q1",
    });

    expect(res.status).toBe(200);
    expect(scoreQuarterServiceMock.generateQuarterlyScore).toHaveBeenCalledTimes(1);
  });

  it("PATCH /rh/score/quarters/nitro atualiza nitro", async () => {
    const app = createTestApp();
    const res = await request(app).patch("/rh/score/quarters/nitro").send({
      score_id: itemId,
      type: "projects",
      value: 10,
    });

    expect(res.status).toBe(200);
    expect(scoreQuarterServiceMock.updateNitro).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/score/quarters/me lista scores do usuario", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/score/quarters/me");

    expect(res.status).toBe(200);
    expect(scoreQuarterServiceMock.listForUser).toHaveBeenCalledWith(organizationId, userId);
  });

  it("GET /rh/score/quarters/:id permite usuario comum detalhar o proprio score", async () => {
    setRhRoutePermission(1);
    const app = createTestApp();
    const res = await request(app).get(`/rh/score/quarters/${itemId}`);

    expect(res.status).toBe(200);
    expect(scoreQuarterServiceMock.getDetail).toHaveBeenCalledWith({
      organization_id: organizationId,
      score_id: itemId,
      user_id: userId,
      can_manage: false,
    });
  });
});
