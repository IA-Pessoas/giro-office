import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetRhRouteMocks, timeSheetServiceMock } from "./rhTestUtils.js";

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

  it("GET /rh/timesheets/:id retorna detalhe completo da folha", async () => {
    const app = createTestApp();
    const res = await request(app).get(`/rh/timesheets/${itemId}`);

    expect(res.status).toBe(200);
    expect(timeSheetServiceMock.getById).toHaveBeenCalledWith({
      organization_id: organizationId,
      timesheet_id: itemId,
    });
    expect(res.body.data).toMatchObject({
      id: itemId,
      status: "Gerada",
      days: [],
      totals: { absence_count: 0 },
    });
  });

  it("GET /rh/timesheets/:id permite visualizador abrir a propria folha", async () => {
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app).get(`/rh/timesheets/${itemId}`);

    expect(res.status).toBe(200);
    expect(timeSheetServiceMock.getById).toHaveBeenCalledWith({
      organization_id: organizationId,
      timesheet_id: itemId,
    });
  });

  it("GET /rh/timesheets/:id bloqueia visualizador em folha de terceiro", async () => {
    timeSheetServiceMock.getById.mockResolvedValueOnce({
      id: itemId,
      user_id: "00000000-0000-4000-8000-000000000099",
      status: "Gerada",
      days: [],
      totals: { absence_count: 0 },
    });
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app).get(`/rh/timesheets/${itemId}`);

    expect(res.status).toBe(403);
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

  it("PUT /rh/timesheets/reopen reabre folha assinada", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/timesheets/reopen").send({
      id: itemId,
      reason: "Correcao de ajuste aprovada",
    });

    expect(res.status).toBe(200);
    expect(timeSheetServiceMock.reopen).toHaveBeenCalledWith({
      organization_id: organizationId,
      timesheet_id: itemId,
      reopened_by_user_id: userId,
      reason: "Correcao de ajuste aprovada",
    });
  });

  it("PUT /rh/timesheets/reopen bloqueia self-service", async () => {
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app).put("/rh/timesheets/reopen").send({
      id: itemId,
      reason: "Nao permitido",
    });

    expect(res.status).toBe(403);
    expect(timeSheetServiceMock.reopen).not.toHaveBeenCalled();
  });
});
