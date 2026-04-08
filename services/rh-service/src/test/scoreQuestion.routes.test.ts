import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetRhRouteMocks, scoreQuestionServiceMock } from "./rh-test-utils.js";

describe("scoreQuestion routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/score/questions cria pergunta", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/score/questions").send({
      question: "Como foi o trimestre?",
      type: "behavioral",
    });

    expect(res.status).toBe(200);
    expect(scoreQuestionServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("PUT /rh/score/questions atualiza pergunta", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/score/questions").send({
      id: itemId,
      question: "Pergunta atualizada",
    });

    expect(res.status).toBe(200);
    expect(scoreQuestionServiceMock.update).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/score/questions lista perguntas", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/score/questions").query({
      type: "technical",
      all: "true",
    });

    expect(res.status).toBe(200);
    expect(scoreQuestionServiceMock.list).toHaveBeenCalledTimes(1);
  });

  it("DELETE /rh/score/questions remove pergunta", async () => {
    const app = createTestApp();
    const res = await request(app).delete("/rh/score/questions").send({ id: itemId });

    expect(res.status).toBe(200);
    expect(scoreQuestionServiceMock.delete).toHaveBeenCalledTimes(1);
  });
});
