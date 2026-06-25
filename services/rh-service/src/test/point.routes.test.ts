import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, pointServiceMock, resetRhRouteMocks } from "./rhTestUtils.js";

describe("point routes", () => {
  const pointId = "00000000-0000-4000-8000-000000000010";
  const organizationId = "00000000-0000-4000-8000-000000000002";
  const userId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("GET /rh/point lista registros com filtros validos", async () => {
    const app = createTestApp();
    const res = await request(app).get(
      "/rh/point?date_from=2026-05-01T00:00:00.000Z&date_to=2026-05-31T23:59:59.999Z",
    );

    expect(res.status).toBe(200);
    expect(pointServiceMock.listPoints).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({
        date_from: expect.any(Date),
        date_to: expect.any(Date),
      }),
    );
  });

  it("GET /rh/point limita permissao RH pessoal aos proprios registros", async () => {
    const app = createTestApp();
    const res = await request(app)
      .get(
        "/rh/point?user_id=00000000-0000-4000-8000-000000000099&date_from=2026-05-01T00:00:00.000Z",
      )
      .set("x-auth-permission", "1");

    expect(res.status).toBe(200);
    expect(pointServiceMock.listPoints).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({
        user_id: userId,
      }),
    );
  });

  it("GET /rh/point/me/today busca ponto do dia do usuario autenticado", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/point/me/today");

    expect(res.status).toBe(200);
    expect(pointServiceMock.getTodayPointForUser).toHaveBeenCalledWith({
      organization_id: organizationId,
      user_id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("GET /rh/point/summary busca resumo mensal", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/point/summary?month=2026-05");

    expect(res.status).toBe(200);
    expect(pointServiceMock.getMonthlySummary).toHaveBeenCalledWith({
      organization_id: organizationId,
      user_id: "00000000-0000-4000-8000-000000000001",
      month: "2026-05",
    });
  });

  it("GET /rh/point/summary retorna 400 para month invalido", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/point/summary?month=2026-13");

    expect(res.status).toBe(400);
    expect(pointServiceMock.getMonthlySummary).not.toHaveBeenCalled();
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

  it("POST /rh/point/:pointId/calculate bloqueia gestao com permissao RH pessoal", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post(`/rh/point/${pointId}/calculate`)
      .set("x-auth-permission", "1");

    expect(res.status).toBe(403);
    expect(pointServiceMock.calculateDailyHours).not.toHaveBeenCalled();
  });
});
