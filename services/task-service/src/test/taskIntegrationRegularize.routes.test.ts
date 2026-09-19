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
      referring: "process-1",
      referring_type: "process",
    });

    expect(res.status).toBe(201);
    expect(taskIntegrationRegularizeServiceMock.createLink).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      task_model_id: "model-1",
      referring: "process-1",
      referring_type: "process",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("POST /task/integration rejeita tipo de destino fora do contrato", async () => {
    const app = createTestApp();

    const res = await request(app).post("/task/integration").send({
      task_model_id: "model-1",
      referring: "folder-1",
      referring_type: "folder",
    });

    expect(res.status).toBe(400);
    expect(taskIntegrationRegularizeServiceMock.createLink).not.toHaveBeenCalled();
  });

  it("DELETE /task/integration remove vinculo", async () => {
    const app = createTestApp();

    const res = await request(app)
      .delete("/task/integration")
      .send({ integration_id: "integration-1" });

    expect(res.status).toBe(200);
    expect(taskIntegrationRegularizeServiceMock.removeLink).toHaveBeenCalledWith({
      user_id: "user-1",
      organization_id: "org-1",
      integration_id: "integration-1",
      integracaoLevel: 0,
      isOwner: false,
    });
  });

  it("GET /task/integration lista vinculos", async () => {
    const app = createTestApp();

    const res = await request(app).get("/task/integration").query({ task_model_id: "model-1" });

    expect(res.status).toBe(200);
    expect(taskIntegrationRegularizeServiceMock.list).toHaveBeenCalledWith("org-1", "model-1", {
      userId: "user-1",
      integracaoLevel: 0,
      isOwner: false,
    });
  });
});
