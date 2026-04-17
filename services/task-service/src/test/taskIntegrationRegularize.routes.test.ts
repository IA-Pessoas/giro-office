import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  resetTaskRouteMocks,
  taskIntegrationRegularizeServiceMock,
} from "./taskTestUtils.js";

describe("task integration regularize routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("POST /task/integration cria vinculo", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task/integration").send({
      task_model_id: "model-1",
      referring: "regularize",
      referring_type: "folder",
    });

    expect(res.status).toBe(201);
    expect(taskIntegrationRegularizeServiceMock.createLink).toHaveBeenCalledTimes(1);
  });

  it("DELETE /task/integration remove vinculo", async () => {
    const app = createTestApp();

    const res = await request(app).delete("/task/integration").send({ integration_id: "integration-1" });

    expect(res.status).toBe(200);
    expect(taskIntegrationRegularizeServiceMock.removeLink).toHaveBeenCalledTimes(1);
  });

  it("GET /task/integration lista vinculos", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/integration").query({ task_model_id: "model-1" });

    expect(res.status).toBe(200);
    expect(taskIntegrationRegularizeServiceMock.list).toHaveBeenCalledWith("org-1", "model-1");
  });
});
