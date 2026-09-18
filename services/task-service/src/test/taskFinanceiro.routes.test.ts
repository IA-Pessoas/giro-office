import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetTaskRouteMocks, taskFinanceiroServiceMock } from "./taskTestUtils.js";

describe("task financeiro routes", () => {
  beforeEach(() => {
    resetTaskRouteMocks();
  });

  it("POST /task/financeiro/settle exige chave idempotente e delega a baixa", async () => {
    const app = createTestApp();

    const res = await request(app)
      .post("/task/financeiro/settle")
      .set("Idempotency-Key", "settle-key")
      .send({ task_ids: ["task-1"] });

    expect(res.status).toBe(200);
    expect(taskFinanceiroServiceMock.settle).toHaveBeenCalledWith(
      expect.objectContaining({ task_ids: ["task-1"], idempotency_key: "settle-key" }),
    );
  });

  it("expõe fila filtrada e configuração de cobradores", async () => {
    const app = createTestApp();

    const queue = await request(app).get("/task/financeiro/queue").query({ client_id: "client-1" });
    const config = await request(app)
      .put("/task/financeiro/collectors")
      .send({ department_id: "department-1", collector_ids: ["user-2"] });

    expect(queue.status).toBe(200);
    expect(config.status).toBe(200);
    expect(taskFinanceiroServiceMock.listQueue).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "client-1" }),
    );
    expect(taskFinanceiroServiceMock.setCollectors).toHaveBeenCalledWith(
      expect.objectContaining({ department_id: "department-1", collector_ids: ["user-2"] }),
    );
  });
});
