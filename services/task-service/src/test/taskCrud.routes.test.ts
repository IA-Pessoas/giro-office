import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildTaskServiceOpenApiSpec } from "../openapi/spec.js";
import { createTestApp, resetTaskRouteMocks, taskCrudServiceMock } from "./taskTestUtils.js";

describe("task crud routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("POST /task preserva null explícito nos responsáveis", async () => {
    const res = await request(createTestApp()).post("/task").send({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      department_id: "department-1",
      urgency: "Alta",
      responsible_id: null,
      responsible2_id: null,
      responsible3_id: null,
    });
    expect(res.status).toBe(201);
    expect(taskCrudServiceMock.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        responsible_id: null,
        responsible2_id: null,
        responsible3_id: null,
      }),
    );
  });

  it("PUT /task aceita desatribuição por null e serializa null", async () => {
    taskCrudServiceMock.updateTask.mockResolvedValue({ responsible_id: null });
    const res = await request(createTestApp()).put("/task").send({
      task_id: "task-1",
      responsible_id: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.responsible_id).toBeNull();
    expect(taskCrudServiceMock.updateTask).toHaveBeenCalledWith(
      expect.objectContaining({ responsible_id: null }),
    );
  });

  it("POST /task encaminha os detalhes operacionais opcionais da criação", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task").send({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      name: "Revisar documentação assinada",
      status: "Em Espera",
      department_id: "department-1",
      observations: "obs",
      billing: "Não Realizar",
      urgency: "Alta",
      responsible_id: "user-1",
      responsible2_id: "user-2",
      responsible3_id: "user-3",
      prevision_date: "2026-08-15",
    });

    expect(res.status).toBe(201);
    expect(taskCrudServiceMock.createTask).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      name: "Revisar documentação assinada",
      status: "Em Espera",
      department_id: "department-1",
      observations: "obs",
      billing: "Não Realizar",
      urgency: "Alta",
      responsible_id: "user-1",
      responsible2_id: "user-2",
      responsible3_id: "user-3",
      prevision_date: "2026-08-15",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("POST /task normaliza detalhes opcionais vazios e preserva o departamento selecionado", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task").send({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      name: "",
      status: "",
      department_id: "department-1",
      billing: "",
      observations: "obs",
      urgency: "Alta",
      responsible_id: "",
      responsible2_id: "",
      responsible3_id: "",
      prevision_date: "",
    });

    expect(res.status).toBe(201);
    expect(taskCrudServiceMock.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        name: undefined,
        status: undefined,
        department_id: "department-1",
        billing: undefined,
        responsible_id: undefined,
        responsible2_id: undefined,
        responsible3_id: undefined,
        prevision_date: undefined,
      }),
    );
  });

  it("POST /task rejects an invalid prevision date", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task").send({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      department_id: "department-1",
      observations: "obs",
      urgency: "Alta",
      prevision_date: "2026-02-31",
    });

    expect(res.status).toBe(400);
    expect(taskCrudServiceMock.createTask).not.toHaveBeenCalled();
  });

  it("POST /task exige o departamento selecionado", async () => {
    const res = await request(createTestApp()).post("/task").send({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      urgency: "Alta",
    });

    expect(res.status).toBe(400);
    expect(taskCrudServiceMock.createTask).not.toHaveBeenCalled();
  });

  it("GET /task/list lista tarefas", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/task/list")
      .query({ status: "Todos", page: "1", limit: "20" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.listTasks).toHaveBeenCalledWith({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "",
      page: 1,
      limit: 20,
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("GET /task/list encaminha filtros validados de cliente e atribuição", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/list").query({
      client_id: "11111111-1111-4111-8111-111111111111",
      assignment: "unassigned",
    });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "11111111-1111-4111-8111-111111111111",
        assignment: "unassigned",
      }),
    );
  });

  it("GET /task/list expõe autoria calculada no contrato HTTP", async () => {
    const listResult = {
      data: [
        {
          id: "task-1",
          isOwn: true,
        },
      ],
      total: 1,
      hasMore: false,
      summary: { inProgress: 1, billable: 1 },
    };
    taskCrudServiceMock.listTasks.mockResolvedValue(listResult);
    const app = createTestApp();

    const res = await request(app).get("/task/list").query({ status: "Todos" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(listResult);

    const pathSpec = JSON.stringify(
      buildTaskServiceOpenApiSpec({
        port: 3032,
        databaseUrl: "postgresql://localhost/task_test",
        jwtSecret: "test-secret",
        nodeEnv: "test",
        logLevel: "silent",
        logPretty: false,
        auditEnabled: false,
        auditServiceUrl: "http://localhost:3020",
        auditServiceToken: "audit-service-token",
        projectServiceUrl: "http://localhost:3033",
        enableApiDocs: false,
      }).paths["/task/list"],
    );

    expect(pathSpec).toContain(
      '"client_id","in":"query","schema":{"type":"string","format":"uuid"}',
    );
    expect(pathSpec).toContain(
      '"assignment","in":"query","schema":{"type":"string","enum":["assigned","unassigned"]}',
    );
    expect(pathSpec).toContain('"isOwn":{"type":"boolean"}');
    expect(pathSpec).toContain('"isUnassigned":{"type":"boolean"}');
    expect(pathSpec).toContain('"required":["id","isOwn","isUnassigned"]');
  });

  it("GET /task/list encaminha busca e pagina validadas", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/task/list")
      .query({ status: "Todos", search: "registro 21", page: "2", limit: "20" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.listTasks).toHaveBeenCalledWith({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "registro 21",
      page: 2,
      limit: 20,
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("GET /task/list encaminha filtros validados de cliente e atribuição", async () => {
    const app = createTestApp();
    const clientId = "11111111-1111-4111-8111-111111111111";

    const res = await request(app)
      .get("/task/list")
      .query({ client_id: clientId, assignment: "unassigned" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: clientId, assignment: "unassigned" }),
    );
  });

  it.each([
    { client_id: "cliente-invalido" },
    { assignment: "anyone" },
  ])("GET /task/list rejeita filtro inválido: %o", async (query) => {
    const res = await request(createTestApp()).get("/task/list").query(query);

    expect(res.status).toBe(400);
    expect(taskCrudServiceMock.listTasks).not.toHaveBeenCalled();
  });

  it("GET /task/list rejeita pagina invalida", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/list").query({ page: "0" });

    expect(res.status).toBe(400);
    expect(taskCrudServiceMock.listTasks).not.toHaveBeenCalled();
  });

  it("PUT /task atualiza tarefa", async () => {
    const app = createTestApp();

    const res = await request(app).put("/task").send({ task_id: "task-1", name: "Atualizada" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.updateTask).toHaveBeenCalledTimes(1);
  });

  it("PUT /task encaminha troca de modelo e departamento", async () => {
    const res = await request(createTestApp()).put("/task").send({
      task_id: "task-1",
      model_id: "model-2",
      department_id: "department-2",
    });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.updateTask).toHaveBeenCalledWith(
      expect.objectContaining({ model_id: "model-2", department_id: "department-2" }),
    );
  });

  it("GET /task detalha tarefa", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task").query({ task_id: "task-1" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.detailTask).toHaveBeenCalledWith("task-1", "org-1", {
      user_id: "user-1",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("DELETE /task remove tarefa", async () => {
    const app = createTestApp();

    const res = await request(app).delete("/task").query({ task_id: "task-1" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.deleteTask).toHaveBeenCalledTimes(1);
  });
});
