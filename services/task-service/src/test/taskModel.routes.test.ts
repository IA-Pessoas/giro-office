import { ServiceError } from "@workspace/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetTaskRouteMocks, taskModelServiceMock } from "./taskTestUtils.js";

describe("task model routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("POST /task/model cria modelo", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task/model").send({
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "user-1",
      billing: "Realizar",
      prevision: 2,
    });

    expect(res.status).toBe(201);
    expect(taskModelServiceMock.createModel).toHaveBeenCalledTimes(1);
    expect(taskModelServiceMock.createModel).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
      observations: null,
      billing: "Realizar",
      prevision: 2,
      type: null,
    });
  });

  it("GET /task/model busca modelo", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/model").query({ task_id: "model-1" });

    expect(res.status).toBe(200);
    expect(taskModelServiceMock.detailModel).toHaveBeenCalledWith("model-1", "org-1");
  });

  it("PUT /task/model atualiza modelo", async () => {
    const app = createTestApp();

    const res = await request(app).put("/task/model").send({
      task_id: "model-1",
      name: "Modelo 2",
      department_id: "dep-1",
      responsible_id: "user-1",
      billing: "Realizar",
      prevision: 4,
    });

    expect(res.status).toBe(200);
    expect(taskModelServiceMock.updateModel).toHaveBeenCalledTimes(1);
    expect(taskModelServiceMock.updateModel).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "model-1",
      name: "Modelo 2",
      department_id: "dep-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
      observations: null,
      billing: "Realizar",
      prevision: 4,
      type: null,
    });
  });

  it("GET /task/model/list lista modelos", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/task/model/list")
      .query({ type: "fiscal", billing: "Realizar" });

    expect(res.status).toBe(200);
    expect(taskModelServiceMock.listModel).toHaveBeenCalledWith({
      type: "fiscal",
      billing: "Realizar",
      search: "",
      organizationId: "org-1",
      paginationRequested: false,
      page: 1,
      limit: 20,
    });
  });

  it("GET /task/model/list lista todos os modelos quando type e billing nao sao enviados", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/model/list");

    expect(res.status).toBe(200);
    expect(taskModelServiceMock.listModel).toHaveBeenCalledWith({
      type: undefined,
      billing: undefined,
      search: "",
      organizationId: "org-1",
      paginationRequested: false,
      page: 1,
      limit: 20,
    });
  });

  it("GET /task/model/list preserva filtros legados enviados no corpo", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/task/model/list")
      .send({ type: "fiscal", billing: "Realizar" });

    expect(res.status).toBe(200);
    expect(taskModelServiceMock.listModel).toHaveBeenCalledWith({
      type: "fiscal",
      billing: "Realizar",
      search: "",
      organizationId: "org-1",
      paginationRequested: false,
      page: 1,
      limit: 20,
    });
  });

  it("GET /task/model/list pagina busca remota", async () => {
    taskModelServiceMock.listModel.mockResolvedValueOnce({
      data: [{ id: "model-21", name: "Fiscal 21", department_id: "dep-1" }],
      total: 21,
      page: 2,
      limit: 20,
      hasMore: false,
    });
    const app = createTestApp();

    const res = await request(app)
      .get("/task/model/list")
      .query({ search: "fiscal", page: "2", limit: "20" });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(21);
    expect(taskModelServiceMock.listModel).toHaveBeenCalledWith({
      type: undefined,
      billing: undefined,
      search: "fiscal",
      organizationId: "org-1",
      paginationRequested: true,
      page: 2,
      limit: 20,
    });
  });

  it("GET /task/model/list rejeita limite invalido", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/model/list").query({ limit: "101" });

    expect(res.status).toBe(400);
    expect(taskModelServiceMock.listModel).not.toHaveBeenCalled();
  });

  it("DELETE /task/model remove modelo", async () => {
    const app = createTestApp();

    const res = await request(app).delete("/task/model").query({ task_id: "model-1" });

    expect(res.status).toBe(200);
    expect(taskModelServiceMock.deleteModel).toHaveBeenCalledTimes(1);
    expect(taskModelServiceMock.deleteModel).toHaveBeenCalledWith({
      task_id: "model-1",
      user_id: "user-1",
      organization_id: "org-1",
    });
  });

  it("POST /task/model retorna 403 quando o servico nega permissao", async () => {
    taskModelServiceMock.createModel.mockRejectedValueOnce(new ServiceError(403, "Sem permissao."));
    const app = createTestApp();

    const res = await request(app).post("/task/model").send({
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "user-1",
      billing: "Realizar",
      prevision: 2,
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: "Sem permissao.",
    });
  });

  it("PUT /task/model retorna 403 quando o servico nega permissao", async () => {
    taskModelServiceMock.updateModel.mockRejectedValueOnce(new ServiceError(403, "Sem permissao."));
    const app = createTestApp();

    const res = await request(app).put("/task/model").send({
      task_id: "model-1",
      name: "Modelo 2",
      department_id: "dep-1",
      responsible_id: "user-1",
      billing: "Realizar",
      prevision: 4,
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: "Sem permissao.",
    });
  });

  it("DELETE /task/model retorna 403 quando o servico nega permissao", async () => {
    taskModelServiceMock.deleteModel.mockRejectedValueOnce(new ServiceError(403, "Sem permissao."));
    const app = createTestApp();

    const res = await request(app).delete("/task/model").query({ task_id: "model-1" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: "Sem permissao.",
    });
  });
});
