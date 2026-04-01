import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../src/generated/prisma/client.js";

process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:5432/rh_service_test";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-32-characters-long";
process.env.LOG_LEVEL ??= "silent";
process.env.NODE_ENV ??= "test";

const { Prisma, ScoreEvaluationStatus } = await import("../src/generated/prisma/client.js");
const { ServiceError } = await import("@workspace/shared");
const { ScoreQuarterService } = await import("../src/services/scoreQuarterService.js");
const { ScoreEvaluationService } = await import("../src/services/scoreEvaluationService.js");

const orgId = "org-1";
/** UUID fixo para testes de submit (schema HTTP exige UUID). */
const evalIdSubmit = "550e8400-e29b-41d4-a716-446655440001";
const targetUserId = "user-target";
const quarter = "2026-Q1";

function collaboratorTargetUser() {
  return {
    id: targetUserId,
    organization_id: orgId,
    department_id: "dept-1",
    permission: 0,
    permissionRef: null,
    permissions: [{ organization_id: orgId, rh: 0 }],
  };
}

function createEmptyQuestionsTxMock() {
  return {
    scoreQuarter: {
      create: async ({
        data,
      }: {
        data: { user_id: string; quarter: string; organization_id: string };
      }) => ({
        id: "score-new",
        user_id: data.user_id,
        quarter: data.quarter,
        organization_id: data.organization_id,
      }),
    },
    scoreQuestion: {
      findMany: async () => [],
    },
    scoreEvaluation: {
      create: async () => {
        assert.fail("scoreEvaluation.create não deve ser chamado sem perguntas ativas");
      },
    },
    user: {
      findFirst: async () => null,
      findMany: async () => [],
    },
  };
}

function asDb(mock: object): PrismaClient {
  return mock as unknown as PrismaClient;
}

test("generateQuarterlyScore lança 409 quando o trimestre já existe", async () => {
  const db = {
    scoreQuarter: {
      findUnique: async () => ({ id: "existing" }),
    },
    user: { findUnique: async () => null },
    $transaction: async () => assert.fail("transaction não deve rodar"),
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await assert.rejects(
    () =>
      svc.generateQuarterlyScore({
        organization_id: orgId,
        target_user_id: targetUserId,
        quarter,
      }),
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 409 && err.message.includes("já gerado"),
  );
});

test("generateQuarterlyScore lança 404 quando o usuário alvo não existe", async () => {
  const db = {
    scoreQuarter: { findUnique: async () => null },
    user: { findUnique: async () => null },
    $transaction: async () => assert.fail("transaction não deve rodar"),
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await assert.rejects(
    () =>
      svc.generateQuarterlyScore({
        organization_id: orgId,
        target_user_id: targetUserId,
        quarter,
      }),
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message.includes("não encontrado"),
  );
});

test("generateQuarterlyScore lança 400 quando o alvo não pertence à organização", async () => {
  const db = {
    scoreQuarter: { findUnique: async () => null },
    user: {
      findUnique: async () => ({
        ...collaboratorTargetUser(),
        organization_id: "outra-org",
      }),
    },
    $transaction: async () => assert.fail("transaction não deve rodar"),
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await assert.rejects(
    () =>
      svc.generateQuarterlyScore({
        organization_id: orgId,
        target_user_id: targetUserId,
        quarter,
      }),
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 400 && err.message.includes("organização"),
  );
});

test("generateQuarterlyScore lança 400 sem permissão RH na organização", async () => {
  const db = {
    scoreQuarter: { findUnique: async () => null },
    user: {
      findUnique: async () => ({
        id: targetUserId,
        organization_id: orgId,
        department_id: "dept-1",
        permission: 0,
        permissionRef: null,
        permissions: [{ organization_id: "outra-org", rh: 1 }],
      }),
    },
    $transaction: async () => assert.fail("transaction não deve rodar"),
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await assert.rejects(
    () =>
      svc.generateQuarterlyScore({
        organization_id: orgId,
        target_user_id: targetUserId,
        quarter,
      }),
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 400 &&
      err.message.includes("permissões RH"),
  );
});

test("generateQuarterlyScore conclui transação quando não há perguntas cadastradas", async () => {
  const tx = createEmptyQuestionsTxMock();
  const db = {
    scoreQuarter: { findUnique: async () => null },
    user: { findUnique: async () => collaboratorTargetUser() },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  const result = await svc.generateQuarterlyScore({
    organization_id: orgId,
    target_user_id: targetUserId,
    quarter,
  });

  assert.ok(result && typeof result === "object");
  assert.equal((result as { id: string }).id, "score-new");
});

test("generateQuarterlyScore mapeia P2002 para 409", async () => {
  const db = {
    scoreQuarter: { findUnique: async () => null },
    user: { findUnique: async () => collaboratorTargetUser() },
    $transaction: async () => {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      });
    },
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await assert.rejects(
    () =>
      svc.generateQuarterlyScore({
        organization_id: orgId,
        target_user_id: targetUserId,
        quarter,
      }),
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 409 && err.message.includes("já gerado"),
  );
});

test("ScoreEvaluationService.submitEvaluation lança 404 quando a avaliação não existe", async () => {
  const db = {
    scoreEvaluation: {
      findFirst: async () => null,
    },
    scoreQuarter: {},
    user: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreEvaluationService(asDb(db));

  await assert.rejects(
    () =>
      svc.submitEvaluation({
        organization_id: orgId,
        user_id: "user-1",
        evaluation_id: evalIdSubmit,
        answers: [{ question_id: "q1", answer: 5 }],
      }),
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 404 && err.message.includes("Avaliação"),
  );
});

test("ScoreEvaluationService.submitEvaluation lança 409 quando já está concluída", async () => {
  const db = {
    scoreEvaluation: {
      findFirst: async () => ({
        id: evalIdSubmit,
        score_id: "s-1",
        organization_id: orgId,
        status: ScoreEvaluationStatus.Completed,
        evaluator_id: "user-1",
        evaluator_role: "SELF",
        scoreQuarter: { organization_id: orgId },
      }),
    },
    scoreQuarter: {},
    user: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreEvaluationService(asDb(db));

  await assert.rejects(
    () =>
      svc.submitEvaluation({
        organization_id: orgId,
        user_id: "user-1",
        evaluation_id: evalIdSubmit,
        answers: [{ question_id: "q1", answer: 5 }],
      }),
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 409 && err.message.includes("concluída"),
  );
});

test("ScoreEvaluationService.submitEvaluation atualiza e dispara recálculo", async () => {
  const scoreId = "s-recalc";
  const submitUserId = "user-evaluator";
  let evaluationUpdateCalls = 0;
  let quarterUpdateCalls = 0;
  const db = {
    scoreEvaluation: {
      findFirst: async () => ({
        id: evalIdSubmit,
        score_id: scoreId,
        organization_id: orgId,
        status: ScoreEvaluationStatus.Pending,
        evaluator_id: submitUserId,
        evaluator_role: "SELF",
        scoreQuarter: { organization_id: orgId },
      }),
      update: async () => {
        evaluationUpdateCalls += 1;
        return { id: evalIdSubmit };
      },
    },
    scoreQuarter: {
      findFirst: async () => ({
        id: scoreId,
        organization_id: orgId,
        evaluations: [],
        nitro: {
          projects_score: 0,
          hours_score: 0,
          errors_score: 0,
          folders_score: 0,
        },
      }),
      update: async () => {
        quarterUpdateCalls += 1;
        return { id: scoreId };
      },
    },
    user: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreEvaluationService(asDb(db));

  const result = await svc.submitEvaluation({
    organization_id: orgId,
    user_id: submitUserId,
    evaluation_id: evalIdSubmit,
    answers: [
      { question_id: "q1", answer: 8 },
      { question_id: "q2", answer: 6 },
    ],
  });

  assert.equal(evaluationUpdateCalls, 1);
  assert.equal(quarterUpdateCalls, 1);
  assert.equal(result.message, "Avaliação enviada com sucesso");
});

test("getDetail lança 404 quando o score não existe", async () => {
  const db = {
    scoreQuarter: { findUnique: async () => null },
    scoreEvaluation: {},
    user: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await assert.rejects(
    () => svc.getDetail({ organization_id: orgId, score_id: "x" }),
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message.includes("Score não encontrado"),
  );
});

test("getDetail lança 403 quando a organização não confere", async () => {
  const db = {
    scoreQuarter: {
      findUnique: async () => ({
        id: "s1",
        organization_id: "outra",
        nitro: null,
        evaluations: [],
      }),
    },
    scoreEvaluation: {},
    user: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await assert.rejects(
    () => svc.getDetail({ organization_id: orgId, score_id: "s1" }),
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 403 && err.message.includes("organização"),
  );
});

test("listForUser retorna lista do prisma", async () => {
  const expected = [{ id: "s1", quarter }];
  const db = {
    scoreQuarter: {
      findMany: async () => expected,
    },
    scoreEvaluation: {},
    user: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  const rows = await svc.listForUser(orgId, "user-1");
  assert.deepEqual(rows, expected);
});

test("ScoreEvaluationService.listPendingEvaluations lança 404 se o utilizador não existe", async () => {
  const db = {
    user: { findUnique: async () => null },
    scoreQuarter: {},
    scoreEvaluation: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreEvaluationService(asDb(db));

  await assert.rejects(
    () => svc.listPendingEvaluations(orgId, "ghost"),
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message.includes("Utilizador não encontrado"),
  );
});

test("updateNitro lança 404 quando nitro não existe", async () => {
  const db = {
    scoreNitro: { findUnique: async () => null },
    scoreQuarter: {},
    scoreEvaluation: {},
    user: {},
    $transaction: async () => undefined,
  };
  const svc = new ScoreQuarterService(asDb(db));

  await assert.rejects(
    () =>
      svc.updateNitro({
        organization_id: orgId,
        score_id: "s1",
        type: "projects",
        value: 1,
      }),
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 404 && err.message.includes("Nitro"),
  );
});
