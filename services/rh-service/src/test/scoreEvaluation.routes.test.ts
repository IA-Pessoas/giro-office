import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  resetRhRouteMocks,
  scoreEvaluationServiceMock,
  setRhRoutePermission,
} from "./rhTestUtils.js";

describe("scoreEvaluation routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";
  const userId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("GET /rh/score/evaluations/pending lista avaliacoes pendentes", async () => {
    setRhRoutePermission(1);
    const app = createTestApp();
    const res = await request(app).get("/rh/score/evaluations/pending");

    expect(res.status).toBe(200);
    expect(scoreEvaluationServiceMock.listPendingEvaluations).toHaveBeenCalledWith(
      organizationId,
      userId,
      false,
    );
  });

  it("POST /rh/score/evaluations/submit envia avaliacao", async () => {
    setRhRoutePermission(1);
    const app = createTestApp();
    const res = await request(app)
      .post("/rh/score/evaluations/submit")
      .send({
        evaluation_id: itemId,
        answers: [{ question_id: itemId, answer: 5 }],
      });

    expect(res.status).toBe(200);
    expect(scoreEvaluationServiceMock.submitEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ can_manage: false }),
    );
  });

  it("GET /rh/score/evaluations/pending preserva contexto gerencial", async () => {
    setRhRoutePermission(3);
    const app = createTestApp();
    const res = await request(app).get("/rh/score/evaluations/pending");

    expect(res.status).toBe(200);
    expect(scoreEvaluationServiceMock.listPendingEvaluations).toHaveBeenCalledWith(
      organizationId,
      userId,
      true,
    );
  });
});
