import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildTaskServiceOpenApiSpec } from "../openapi/spec.js";
import { createTestApp, resetTaskRouteMocks, taskCrudServiceMock } from "./taskTestUtils.js";

describe("task crud routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
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

  it("POST /task normaliza detalhes opcionais vazios para preservar os defaults do modelo", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task").send({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      name: "",
      status: "",
      department_id: "",
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
        department_id: undefined,
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
      observations: "obs",
      urgency: "Alta",
      prevision_date: "2026-02-31",
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

    expect(pathSpec).toContain('"isOwn":{"type":"boolean"}');
    expect(pathSpec).toContain('"required":["id","isOwn"]');
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
