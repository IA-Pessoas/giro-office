import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

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
    });
  });
});
