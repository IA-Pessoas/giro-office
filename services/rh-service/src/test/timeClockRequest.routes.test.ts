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
    expect(timeClockRequestServiceMock.list).toHaveBeenCalledWith(
      organizationId,
      {
        status: "Pendente",
        user_id: undefined,
      },
      {
        actor_user_id: "00000000-0000-4000-8000-000000000001",
        rh_permission: 3,
      },
    );
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

    expect(res.status).toBe(201);
    expect(timeClockRequestServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("POST /rh/point/adjustment/retroactive exige permissao de gestao", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/point/adjustment/retroactive").send({
      target_user_id: "00000000-0000-4000-8000-000000000099",
      date: "2025-01-01T00:00:00.000Z",
      clock_in: "2025-01-01T08:00:00.000Z",
      lunch_out: "2025-01-01T12:00:00.000Z",
      lunch_in: "2025-01-01T13:00:00.000Z",
      clock_out: "2025-01-01T18:00:00.000Z",
      justification: "Lancamento retroativo autorizado",
    });

    expect(res.status).toBe(201);
    expect(timeClockRequestServiceMock.createRetroactive).toHaveBeenCalledTimes(1);
  });

  it("PUT /rh/point/adjustment/approve-bulk aprova lote", async () => {
    const app = createTestApp();
    const res = await request(app)
      .put("/rh/point/adjustment/approve-bulk")
      .send({
        request_ids: [requestId],
        obs_approver: "Lote conferido",
      });

    expect(res.status).toBe(200);
    expect(timeClockRequestServiceMock.approveBulk).toHaveBeenCalledTimes(1);
  });

  it("POST /rh/point/adjustment/:id/attachment valida e encaminha comprovante", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post(`/rh/point/adjustment/${requestId}/attachment`)
      .attach("file", Buffer.from("%PDF-1.7\ncomprovante"), {
        filename: "comprovante.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(timeClockRequestServiceMock.uploadAttachment).toHaveBeenCalledTimes(1);
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

  it("PUT /rh/point/adjustment/reject rejeita solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/point/adjustment/reject").send({
      request_id: requestId,
      obs_approver: "Motivo",
    });

    expect(res.status).toBe(200);
    expect(timeClockRequestServiceMock.reject).toHaveBeenCalledTimes(1);
  });

  it("PUT /rh/point/adjustment/reject bloqueia usuario sem permissao", async () => {
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app).put("/rh/point/adjustment/reject").send({
      request_id: requestId,
    });

    expect(res.status).toBe(403);
    expect(timeClockRequestServiceMock.reject).not.toHaveBeenCalled();
  });

  it("GET /rh/point/adjustment/requests aceita status Rejeitado", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/point/adjustment/requests?status=Rejeitado");

    expect(res.status).toBe(200);
    expect(timeClockRequestServiceMock.list).toHaveBeenCalledWith(
      organizationId,
      {
        status: "Rejeitado",
        user_id: undefined,
      },
      {
        actor_user_id: "00000000-0000-4000-8000-000000000001",
        rh_permission: 3,
      },
    );
  });
});
