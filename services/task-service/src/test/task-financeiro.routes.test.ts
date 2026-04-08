import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetTaskRouteMocks, taskFinanceiroServiceMock } from "./task-test-utils.js";

describe("task financeiro routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("PUT /task/financeiro atualiza cobranca financeira", async () => {
    const app = createTestApp();

    const res = await request(app).put("/task/financeiro").send({ task_id: "task-1" });

    expect(res.status).toBe(200);
    expect(taskFinanceiroServiceMock.updateChargeFinanceiro).toHaveBeenCalledTimes(1);
  });
});
