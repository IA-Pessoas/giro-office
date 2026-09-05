import { FORWARDED_AUTH_MODULES_HEADER, FORWARDED_AUTH_PERMISSION_HEADER } from "@workspace/shared";
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

  it("POST /rh/requests permite Usuario criar solicitacao propria sem atribuicao de gestao", async () => {
    const app = createTestApp({ rhPermission: 2 });
    const res = await request(app).post("/rh/requests").send({
      title: "Solicitacao",
      description: "Descricao",
      category_id: itemId,
      urgency: "High",
      assigned_to_user_id: "00000000-0000-4000-8000-000000000099",
    });

    expect(res.status).toBe(200);
    expect(requestServiceMock.create).toHaveBeenCalledTimes(1);
    expect(requestServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: organizationId,
        requester_user_id: userId,
        title: "Solicitacao",
        description: "Descricao",
        category_id: itemId,
        urgency: "High",
      }),
    );
    expect(requestServiceMock.create.mock.calls[0]?.[0]).not.toHaveProperty("assigned_to_user_id");
  });

  it("GET /rh/operational-users lista colaboradores elegiveis para operacao RH", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/operational-users");

    expect(res.status).toBe(200);
    expect(operationalUserServiceMock.list).toHaveBeenCalledWith(organizationId, undefined);
  });

  it("GET /rh/operational-users encaminha o contexto de departamento e modulo", async () => {
    const app = createTestApp();
    const departmentId = "00000000-0000-4000-8000-000000000003";
    const res = await request(app).get("/rh/operational-users").query({
      department_id: departmentId,
      module: "rh",
    });

    expect(res.status).toBe(200);
    expect(operationalUserServiceMock.list).toHaveBeenCalledWith(organizationId, {
      departmentId,
      module: "rh",
    });
  });

  it("GET /rh/operational-users rejeita query desconhecida", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/operational-users").query({ unknown: "value" });

    expect(res.status).toBe(400);
    expect(operationalUserServiceMock.list).not.toHaveBeenCalled();
  });

  it("GET /rh/operational-users aceita modulo Contabil para seletores operacionais", async () => {
    const app = createTestApp();
    const res = await request(app)
      .get("/rh/operational-users")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "0")
      .set(FORWARDED_AUTH_MODULES_HEADER, JSON.stringify({ contabil: 3, rh: 0 }));

    expect(res.status).toBe(200);
    expect(operationalUserServiceMock.list).toHaveBeenCalledWith(organizationId, undefined);
  });

  it("GET /rh/operational-users aceita modulo Pessoal para seletores de responsavel", async () => {
    const app = createTestApp();
    const res = await request(app)
      .get("/rh/operational-users")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "0")
      .set(FORWARDED_AUTH_MODULES_HEADER, JSON.stringify({ pessoal: 1, rh: 0 }));

    expect(res.status).toBe(200);
    expect(operationalUserServiceMock.list).toHaveBeenCalledWith(organizationId, undefined);
  });

  it.each([
    "ti",
    "integracao",
  ])("GET /rh/operational-users aceita modulo %s para seletores contextuais", async (moduleKey) => {
    const app = createTestApp();
    const res = await request(app)
      .get("/rh/operational-users")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "0")
      .set(FORWARDED_AUTH_MODULES_HEADER, JSON.stringify({ [moduleKey]: 1, rh: 0 }));

    expect(res.status).toBe(200);
    expect(operationalUserServiceMock.list).toHaveBeenCalledWith(organizationId, undefined);
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
    expect(requestServiceMock.list).toHaveBeenCalledWith(organizationId, {
      category_id: itemId,
      requester_user_id: userId,
      assigned_to_user_id: userId,
      status: "New",
      page: 1,
      limit: 20,
    });
  });

  it.each([
    ["page", 0],
    ["limit", 101],
  ])("GET /rh/requests rejeita %s fora do limite", async (field, value) => {
    const app = createTestApp();
    const res = await request(app)
      .get("/rh/requests")
      .query({ [field]: value });

    expect(res.status).toBe(400);
    expect(requestServiceMock.list).not.toHaveBeenCalled();
  });

  it("GET /rh/requests restringe RH self-service ao proprio usuario", async () => {
    const app = createTestApp();
    const res = await request(app)
      .get("/rh/requests")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "1")
      .query({
        requester_user_id: "00000000-0000-4000-8000-000000000099",
        assigned_to_user_id: userId,
      });

    expect(res.status).toBe(200);
    expect(requestServiceMock.list).toHaveBeenCalledWith(organizationId, {
      requester_user_id: userId,
      page: 1,
      limit: 20,
    });
  });

  it("GET /rh/requests restringe Usuario RH as proprias solicitacoes", async () => {
    const app = createTestApp({ rhPermission: 2 });
    const res = await request(app).get("/rh/requests").query({
      requester_user_id: "00000000-0000-4000-8000-000000000099",
      assigned_to_user_id: "00000000-0000-4000-8000-000000000098",
      status: "New",
    });

    expect(res.status).toBe(200);
    expect(requestServiceMock.list).toHaveBeenCalledWith(organizationId, {
      requester_user_id: userId,
      status: "New",
      page: 1,
      limit: 20,
    });
  });

  it("GET /rh/requests/:id detalha solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).get(`/rh/requests/${itemId}`);

    expect(res.status).toBe(200);
    expect(requestServiceMock.getById).toHaveBeenCalledWith(itemId, organizationId);
  });

  it("GET /rh/requests/:id permite Usuario RH ver solicitacao propria", async () => {
    const app = createTestApp({ rhPermission: 2 });
    requestServiceMock.getById.mockResolvedValueOnce({
      id: itemId,
      requester_user_id: userId,
    });

    const res = await request(app).get(`/rh/requests/${itemId}`);

    expect(res.status).toBe(200);
    expect(requestServiceMock.getById).toHaveBeenCalledWith(itemId, organizationId);
  });

  it("GET /rh/requests/:id bloqueia Usuario RH ao acessar solicitacao de terceiro", async () => {
    const app = createTestApp({ rhPermission: 2 });
    requestServiceMock.getById.mockResolvedValueOnce({
      id: itemId,
      requester_user_id: "00000000-0000-4000-8000-000000000099",
    });

    const res = await request(app).get(`/rh/requests/${itemId}`);

    expect(res.status).toBe(403);
    expect(requestServiceMock.getById).toHaveBeenCalledWith(itemId, organizationId);
  });

  it("PUT /rh/requests atualiza solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/requests").send({ id: itemId, status: "Resolved" });

    expect(res.status).toBe(200);
    expect(requestServiceMock.update).toHaveBeenCalledTimes(1);
  });

  it("PUT /rh/requests bloqueia RH self-service", async () => {
    const app = createTestApp();
    const res = await request(app)
      .put("/rh/requests")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "1")
      .send({ id: itemId, status: "Resolved" });

    expect(res.status).toBe(403);
    expect(requestServiceMock.update).not.toHaveBeenCalled();
  });

  it("PUT /rh/requests bloqueia Usuario RH", async () => {
    const app = createTestApp({ rhPermission: 2 });
    const res = await request(app).put("/rh/requests").send({ id: itemId, status: "Resolved" });

    expect(res.status).toBe(403);
    expect(requestServiceMock.update).not.toHaveBeenCalled();
  });

  it("DELETE /rh/requests remove solicitacao", async () => {
    const app = createTestApp();
    const res = await request(app).delete("/rh/requests").send({ id: itemId });

    expect(res.status).toBe(200);
    expect(requestServiceMock.delete).toHaveBeenCalledTimes(1);
  });

  it("DELETE /rh/requests bloqueia Usuario RH", async () => {
    const app = createTestApp({ rhPermission: 2 });
    const res = await request(app).delete("/rh/requests").send({ id: itemId });

    expect(res.status).toBe(403);
    expect(requestServiceMock.delete).not.toHaveBeenCalled();
  });
});
