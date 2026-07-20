import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  operationalUserServiceMock,
  requestServiceMock,
  resetRhRouteMocks,
} from "./rhTestUtils.js";

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
      urgency: "High",
    });

    expect(res.status).toBe(200);
    expect(requestServiceMock.create).toHaveBeenCalledWith({
      organization_id: organizationId,
      requester_user_id: userId,
      title: "Solicitacao",
      description: "Descricao",
      category_id: itemId,
      urgency: "High",
    });
  });

  it("GET /rh/operational-users lista colaboradores elegiveis para operacao RH", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/operational-users");

    expect(res.status).toBe(200);
    expect(operationalUserServiceMock.list).toHaveBeenCalledWith(organizationId);
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
    expect(requestServiceMock.canManageRequests).toHaveBeenCalledWith(organizationId, userId);
    expect(requestServiceMock.list).toHaveBeenCalledWith(organizationId, {
      category_id: itemId,
      requester_user_id: userId,
      assigned_to_user_id: userId,
      status: "New",
    });
  });

  it("GET /rh/requests força solicitante autenticado quando usuario nao gerencia RH", async () => {
    requestServiceMock.canManageRequests.mockResolvedValue(false);
    const app = createTestApp();
    const otherUserId = "00000000-0000-4000-8000-000000000003";

    const res = await request(app).get("/rh/requests").query({
      requester_user_id: otherUserId,
      status: "New",
    });

    expect(res.status).toBe(200);
    expect(requestServiceMock.list).toHaveBeenCalledWith(organizationId, {
      requester_user_id: userId,
      status: "New",
    });
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
