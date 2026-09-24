import { describe, expect, it, vi } from "vitest";
import { call, TEST_ORGANIZATION_ID, TEST_USER_ID, testApp } from "./testing.js";

const SCORE_ID = "e0000000-0000-4000-8000-000000000001";
const EVALUATION_ID = "e1000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "b0000000-0000-4000-8000-000000000002";

const nitroRow = {
  id: "n1",
  score_id: SCORE_ID,
  projects_score: 0,
  hours_score: 0,
  errors_score: 0,
  folders_score: 0,
  total_hours: 0,
  total_errors: 0,
  organization_id: TEST_ORGANIZATION_ID,
};

function db() {
  const fake = {
    user: {
      findUnique: vi.fn(async () => ({
        id: OTHER_USER_ID,
        permission: 0,
        organization_id: TEST_ORGANIZATION_ID,
        department_id: "d1",
        permissions: [{ organization_id: TEST_ORGANIZATION_ID, rh: 0 }],
        permissionRef: null,
      })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    scoreQuarter: {
      findUnique: vi.fn(async () => null as unknown),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => [{ id: SCORE_ID, quarter: "2026-Q3" }]),
      create: vi.fn(async () => ({ id: SCORE_ID, quarter: "2026-Q3" })),
      update: vi.fn(async () => ({})),
    },
    scoreQuestion: { findMany: vi.fn(async () => []) },
    scoreEvaluation: {
      findMany: vi.fn(async () => [{ id: EVALUATION_ID }]),
      findFirst: vi.fn(async () => null as unknown),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    scoreNitro: {
      findUnique: vi.fn(async () => null as unknown),
      update: vi.fn(async () => nitroRow),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(fake)),
  };
  return fake;
}

describe("/rh/score/evaluations", () => {
  it("lists the caller's own pending evaluations without management", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", "/rh/score/evaluations/pending", {
      permission: 1,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: [{ id: EVALUATION_ID }] });
    expect(fake.scoreEvaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: TEST_ORGANIZATION_ID,
          evaluator_id: TEST_USER_ID,
        }),
      }),
    );
  });

  it("rejects pending listing without RH permission", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", "/rh/score/evaluations/pending", {
      permission: 0,
    });
    expect(response.status).toBe(403);
    expect(fake.scoreEvaluation.findMany).not.toHaveBeenCalled();
  });

  it("submits an evaluation owned by the caller", async () => {
    const fake = db();
    fake.scoreEvaluation.findFirst.mockResolvedValue({
      id: EVALUATION_ID,
      score_id: SCORE_ID,
      status: "Pending",
      organization_id: TEST_ORGANIZATION_ID,
      evaluator_id: TEST_USER_ID,
      evaluator_role: "SELF",
      answers: [],
      scoreQuarter: { user_id: TEST_USER_ID },
    });
    const response = await call(testApp(fake), "POST", "/rh/score/evaluations/submit", {
      permission: 1,
      body: { evaluation_id: EVALUATION_ID, answers: [{ question_id: "q1", answer: 8 }] },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { message: "Avaliação enviada com sucesso" },
    });
    expect(fake.scoreEvaluation.update).toHaveBeenCalled();
  });

  it("returns 404 when submitting an unknown evaluation", async () => {
    const response = await call(testApp(db()), "POST", "/rh/score/evaluations/submit", {
      permission: 1,
      body: { evaluation_id: EVALUATION_ID, answers: [] },
    });
    expect(response.status).toBe(404);
  });
});

describe("/rh/score/quarters", () => {
  it("generates a quarterly score in a transaction", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/score/quarters/generate", {
      body: { target_user_id: OTHER_USER_ID, quarter: "2026-Q3" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: SCORE_ID } });
    expect(fake.$transaction).toHaveBeenCalled();
    expect(fake.scoreQuarter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organization_id: TEST_ORGANIZATION_ID }),
      }),
    );
  });

  it("requires RH management to generate", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/score/quarters/generate", {
      permission: 2,
      body: { target_user_id: OTHER_USER_ID, quarter: "2026-Q3" },
    });
    expect(response.status).toBe(403);
    expect(fake.scoreQuarter.create).not.toHaveBeenCalled();
  });

  it("updates nitro of a score in the organization", async () => {
    const fake = db();
    fake.scoreNitro.findUnique.mockResolvedValue({
      ...nitroRow,
      scoreQuarter: { organization_id: TEST_ORGANIZATION_ID },
    });
    const response = await call(testApp(fake), "PATCH", "/rh/score/quarters/nitro", {
      body: { score_id: SCORE_ID, type: "hours", value: 1 },
    });
    expect(response.status).toBe(200);
    expect(fake.scoreNitro.update).toHaveBeenCalledWith({
      where: { score_id: SCORE_ID },
      data: { hours_score: 1 },
    });
  });

  it("returns 404 when patching nitro of an unknown score", async () => {
    const response = await call(testApp(db()), "PATCH", "/rh/score/quarters/nitro", {
      body: { score_id: SCORE_ID, type: "hours", value: 1 },
    });
    expect(response.status).toBe(404);
  });

  it("lists the caller's own scores", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", "/rh/score/quarters/me", {
      permission: 1,
    });
    expect(response.status).toBe(200);
    expect(fake.scoreQuarter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: TEST_USER_ID, organization_id: TEST_ORGANIZATION_ID },
      }),
    );
  });

  it("rejects listing own scores without RH permission", async () => {
    const response = await call(testApp(db()), "GET", "/rh/score/quarters/me", {
      permission: 0,
    });
    expect(response.status).toBe(403);
  });

  it("returns score detail to its owner", async () => {
    const fake = db();
    fake.scoreQuarter.findUnique.mockResolvedValue({
      id: SCORE_ID,
      user_id: TEST_USER_ID,
      organization_id: TEST_ORGANIZATION_ID,
    });
    const response = await call(testApp(fake), "GET", `/rh/score/quarters/${SCORE_ID}`, {
      permission: 1,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: SCORE_ID } });
  });

  it("forbids a non-manager from reading someone else's score", async () => {
    const fake = db();
    fake.scoreQuarter.findUnique.mockResolvedValue({
      id: SCORE_ID,
      user_id: OTHER_USER_ID,
      organization_id: TEST_ORGANIZATION_ID,
    });
    const response = await call(testApp(fake), "GET", `/rh/score/quarters/${SCORE_ID}`, {
      permission: 1,
    });
    expect(response.status).toBe(403);
  });
});

describe("/rh/score/nitro", () => {
  it("updates a nitro metric and recalculates the final score", async () => {
    const fake = db();
    fake.scoreNitro.findUnique.mockResolvedValue(nitroRow);
    const response = await call(testApp(fake), "PUT", "/rh/score/nitro/update", {
      body: { score_id: SCORE_ID, type: "projects", value: "2" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { score_id: SCORE_ID } });
    expect(fake.scoreNitro.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { projects_score: 2 } }),
    );
  });

  it("requires RH management", async () => {
    const fake = db();
    const response = await call(testApp(fake), "PUT", "/rh/score/nitro/update", {
      permission: 1,
      body: { score_id: SCORE_ID, type: "projects", value: 2 },
    });
    expect(response.status).toBe(403);
    expect(fake.scoreNitro.update).not.toHaveBeenCalled();
  });
});
