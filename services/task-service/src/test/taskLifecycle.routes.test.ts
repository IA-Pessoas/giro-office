import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { integracaoTaskConclusionBodySchema } from "../schemas/integracaoTaskConclusionBody.schema.js";

it("conclusão aceita responsável principal nulo", () => {
  expect(
    integracaoTaskConclusionBodySchema.safeParse({
      task_id: "task-1",
      status: "Concluída",
      responsible_id: null,
    }).success,
  ).toBe(true);
});

it("conclusão rejeita alteração direta de previsão", () => {
  expect(
    integracaoTaskConclusionBodySchema.safeParse({
      task_id: "task-1",
      status: "Em Andamento",
      responsible_id: null,
      prevision_date: "2026-09-20",
    }).success,
  ).toBe(false);
});

import { createTestApp, resetTaskRouteMocks, taskLifecycleServiceMock } from "./taskTestUtils.js";

describe("task lifecycle routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("PUT /task/conclusion conclui tarefa", async () => {
    const app = createTestApp();

    const res = await request(app).put("/task/conclusion").send({
      task_id: "task-1",
      status: "Concluída",
      responsible_id: "user-1",
      end_date: "2025-01-01T12:00:00.000Z",
    });

    expect(res.status).toBe(200);
    expect(taskLifecycleServiceMock.concludeTask).toHaveBeenCalledTimes(1);
  });

  it("PUT /task/complete-request aprova conclusao", async () => {
    const app = createTestApp();

    const res = await request(app).put("/task/complete-request").send({ task_id: "task-1" });

    expect(res.status).toBe(200);
    expect(taskLifecycleServiceMock.approveTaskCompletion).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("POST /task/complete-request cria uma solicitação de conclusão", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/task/complete-request")
      .send({ task_id: "task-1", reason: "Pronta para validação." });

    expect(res.status).toBe(200);
    expect(taskLifecycleServiceMock.requestTaskCompletion).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      reason: "Pronta para validação.",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("PUT /task/complete-request encaminha recusa com motivo", async () => {
    const app = createTestApp();

    const res = await request(app).put("/task/complete-request").send({
      task_id: "task-1",
      request_id: "request-1",
      decision: "refused",
      reason: "Falta documento obrigatório.",
    });

    expect(res.status).toBe(200);
    expect(taskLifecycleServiceMock.approveTaskCompletion).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      request_id: "request-1",
      decision: "refused",
      reason: "Falta documento obrigatório.",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("DELETE /task/complete-request cancela a própria solicitação", async () => {
    const app = createTestApp();

    const res = await request(app)
      .delete("/task/complete-request")
      .send({ task_id: "task-1", request_id: "request-1" });

    expect(res.status).toBe(200);
    expect(taskLifecycleServiceMock.cancelTaskCompletion).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      request_id: "request-1",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("PUT /task/reopen reabre tarefa com motivo", async () => {
    const app = createTestApp();

    const res = await request(app)
      .put("/task/reopen")
      .send({ task_id: "task-1", reason: "Documentos pendentes." });

    expect(res.status).toBe(200);
    expect(taskLifecycleServiceMock.reopenTask).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      reason: "Documentos pendentes.",
      integracaoLevel: 0,
      isOwner: false,
    });
  });
});
