import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, requestServiceMock, resetRhRouteMocks } from "./rh-test-utils.js";

describe("request routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/requests cria solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/requests").send({
      title: "Solicitacao",
      description: "Descricao",
      category_id: itemId,
      assigned_to_user_id: userId,
      urgency: "High",
    });

    expect(res.status).toBe(200);
    expect(requestServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/requests lista solicitacoes", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/requests").query({
      category_id: itemId,
      requester_user_id: userId,
      assigned_to_user_id: userId,
      status: "New",
    });

    expect(res.status).toBe(200);
    expect(requestServiceMock.list).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/requests/:id detalha solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).get(`/rh/requests/${itemId}`);

    expect(res.status).toBe(200);
    expect(requestServiceMock.getById).toHaveBeenCalledWith(itemId, organizationId);
  });

  it("PUT /rh/requests atualiza solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/requests").send({ id: itemId, status: "Resolved" });

    expect(res.status).toBe(200);
    expect(requestServiceMock.update).toHaveBeenCalledTimes(1);
  });

  it("DELETE /rh/requests remove solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).delete("/rh/requests").send({ id: itemId });

    expect(res.status).toBe(200);
    expect(requestServiceMock.delete).toHaveBeenCalledTimes(1);
  });
});
