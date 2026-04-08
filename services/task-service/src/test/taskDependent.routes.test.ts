import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetTaskRouteMocks, taskDependentServiceMock } from "./taskTestUtils.js";

describe("task dependent routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("POST /task/model/dependent adiciona dependente", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task/model/dependent").send({
      task_model_id: "model-1",
      dependent_id: "dep-2",
      wait: true,
      observation: "Aguardar",
    });

    expect(res.status).toBe(201);
    expect(taskDependentServiceMock.addDependent).toHaveBeenCalledTimes(1);
  });

  it("GET /task/model/dependent lista dependentes", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/model/dependent").query({ task_model_id: "model-1" });

    expect(res.status).toBe(200);
    expect(taskDependentServiceMock.listDependents).toHaveBeenCalledWith("model-1", "org-1");
  });

  it("DELETE /task/model/dependent remove dependente", async () => {
    const app = createTestApp();

    const res = await request(app).delete("/task/model/dependent").query({ id: "dep-1" });

    expect(res.status).toBe(200);
    expect(taskDependentServiceMock.deleteDependent).toHaveBeenCalledTimes(1);
  });
});
