import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, messageServiceMock, resetRhRouteMocks } from "./rhTestUtils.js";

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
    expect(messageServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ can_manage_rh: true }),
    );
  });

  it("POST /rh/messages rejeita workflow para RH Visualizador", async () => {
    const app = createTestApp({ rhPermission: 1 });
    const res = await request(app).post("/rh/messages").send({
      request_id: itemId,
      message: "SoluÃ§Ã£o",
      type: "Solution",
    });

    expect(res.status).toBe(403);
    expect(messageServiceMock.create).not.toHaveBeenCalled();
  });

  it("POST /rh/messages preserva workflow para RH Usuario", async () => {
    const app = createTestApp({ rhPermission: 2 });
    const res = await request(app).post("/rh/messages").send({
      request_id: itemId,
      message: "SoluÃ§Ã£o",
      type: "Solution",
    });

    expect(res.status).toBe(200);
    expect(messageServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ can_use_workflow_messages: true }),
    );
  });

  it("GET /rh/messages lista mensagens", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/messages").query({ requestId: itemId });

    expect(res.status).toBe(200);
    expect(messageServiceMock.listByRequest).toHaveBeenCalledTimes(1);
    expect(messageServiceMock.listByRequest).toHaveBeenCalledWith(
      expect.objectContaining({ can_manage_rh: true }),
    );
  });
});
