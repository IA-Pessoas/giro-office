import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetTaskRouteMocks, taskCrudServiceMock } from "./taskTestUtils.js";

describe("task crud routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("POST /task cria tarefa", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task").send({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      observations: "obs",
      urgency: "Alta",
    });

    expect(res.status).toBe(201);
    expect(taskCrudServiceMock.createTask).toHaveBeenCalledTimes(1);
  });

  it("GET /task/list lista tarefas", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/task/list")
      .query({ status: "Todos", page: "1", limit: "20" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.listTasks).toHaveBeenCalledWith({
      organization_id: "org-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "",
      page: 1,
      limit: 20,
    });
  });

  it("GET /task/list encaminha busca e pagina validadas", async () => {
    const app = createTestApp();

    const res = await request(app)
      .get("/task/list")
      .query({ status: "Todos", search: "registro 21", page: "2", limit: "20" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.listTasks).toHaveBeenCalledWith({
      organization_id: "org-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "registro 21",
      page: 2,
      limit: 20,
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
    expect(taskCrudServiceMock.detailTask).toHaveBeenCalledWith("task-1", "org-1");
  });

  it("DELETE /task remove tarefa", async () => {
    const app = createTestApp();

    const res = await request(app).delete("/task").query({ task_id: "task-1" });

    expect(res.status).toBe(200);
    expect(taskCrudServiceMock.deleteTask).toHaveBeenCalledTimes(1);
  });
});
