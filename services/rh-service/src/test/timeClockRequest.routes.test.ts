import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetRhRouteMocks, timeClockRequestServiceMock } from "./rhTestUtils.js";

describe("timeClockRequest routes", () => {
  const requestId = "00000000-0000-4000-8000-000000000010";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("GET /rh/point/adjustment/requests lista solicitacoes", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/point/adjustment/requests?status=Pendente");

    expect(res.status).toBe(200);
    expect(timeClockRequestServiceMock.list).toHaveBeenCalledWith(organizationId, {
      status: "Pendente",
      user_id: undefined,
    });
  });

  it("GET /rh/point/adjustment/requests retorna 400 para status invalido", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/point/adjustment/requests?status=Invalido");

    expect(res.status).toBe(400);
    expect(timeClockRequestServiceMock.list).not.toHaveBeenCalled();
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
