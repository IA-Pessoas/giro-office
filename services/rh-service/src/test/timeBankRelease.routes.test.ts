import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetRhRouteMocks, timeBankReleaseServiceMock } from "./rhTestUtils.js";

describe("timeBankRelease routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";

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

  it("GET /rh/time-bank-releases/list limita visualizador ao proprio usuario", async () => {
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app).get("/rh/time-bank-releases/list").query({
      user_id: "abc",
      is_approved: "false",
    });

    expect(res.status).toBe(200);
    expect(timeBankReleaseServiceMock.list).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ user_id: userId, is_approved: false }),
    );
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

  it("GET /rh/time-bank/summary retorna resumo do usuario autenticado", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/time-bank/summary");

    expect(res.status).toBe(200);
    expect(timeBankReleaseServiceMock.getSummary).toHaveBeenCalledWith(organizationId, userId);
    expect(res.body.data).toMatchObject({
      user_id: userId,
      balance_minutes: 75,
      approved_releases_count: 2,
      pending_releases_count: 1,
    });
  });

  it("GET /rh/time-bank/summary/:userId retorna resumo de colaborador", async () => {
    const app = createTestApp();
    const targetUserId = "00000000-0000-4000-8000-000000000003";
    const res = await request(app).get(`/rh/time-bank/summary/${targetUserId}`);

    expect(res.status).toBe(200);
    expect(timeBankReleaseServiceMock.getSummary).toHaveBeenCalledWith(
      organizationId,
      targetUserId,
    );
  });

  it("GET /rh/time-bank/overview retorna visao agregada", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/time-bank/overview");

    expect(res.status).toBe(200);
    expect(timeBankReleaseServiceMock.getOverview).toHaveBeenCalledWith(organizationId);
    expect(res.body.data).toMatchObject({
      total_pending_releases: 1,
      total_approved_releases: 2,
      users_with_positive_balance: 3,
      users_with_negative_balance: 4,
    });
  });
});
