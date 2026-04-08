import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, messageServiceMock, resetRhRouteMocks } from "./rh-test-utils.js";

describe("message routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/messages cria mensagem", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/messages").send({
      request_id: itemId,
      message: "Mensagem",
      type: "Message",
    });

    expect(res.status).toBe(200);
    expect(messageServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/messages lista mensagens", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/messages").query({ requestId: itemId });

    expect(res.status).toBe(200);
    expect(messageServiceMock.listByRequest).toHaveBeenCalledTimes(1);
  });
});
