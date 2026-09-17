import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  resetTaskRouteMocks,
  taskPostponementServiceMock,
} from "./taskTestUtils.js";

describe("task postponement routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("POST /task/postponement registra uma prorrogação com justificativa obrigatória", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task/postponement").send({
      task_id: "task-1",
      new_prevision_date: "2026-09-20",
      justification: "Aguardando documento do cliente.",
    });

    expect(res.status).toBe(201);
    expect(taskPostponementServiceMock.create).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      new_prevision_date: "2026-09-20",
      justification: "Aguardando documento do cliente.",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("POST /task/postponement rejeita justificativa vazia", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task/postponement").send({
      task_id: "task-1",
      new_prevision_date: "2026-09-20",
      justification: " ",
    });

    expect(res.status).toBe(400);
    expect(taskPostponementServiceMock.create).not.toHaveBeenCalled();
  });

  it("POST /task/postponement rejeita data de previsão inválida", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task/postponement").send({
      task_id: "task-1",
      new_prevision_date: "2026-02-30",
      justification: "Aguardando documento do cliente.",
    });

    expect(res.status).toBe(400);
    expect(taskPostponementServiceMock.create).not.toHaveBeenCalled();
  });

  it("GET /task/postponement/list retorna o histórico cronológico da tarefa", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/postponement/list").query({ task_id: "task-1" });

    expect(res.status).toBe(200);
    expect(taskPostponementServiceMock.list).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      integracaoLevel: 0,
      isOwner: false,
    });
  });
});
