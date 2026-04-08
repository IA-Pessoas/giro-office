import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetTaskRouteMocks, taskComercialServiceMock } from "./taskTestUtils.js";

describe("task comercial routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("PUT /task/comercial atualiza cobranca comercial", async () => {
    const app = createTestApp();

    const res = await request(app).put("/task/comercial").send({
      task_id: "task-1",
      hiring_status: "Contratado",
      payment: "Pago",
      billing_description: "descricao",
    });

    expect(res.status).toBe(200);
    expect(taskComercialServiceMock.updateChargeComercial).toHaveBeenCalledTimes(1);
  });
});
