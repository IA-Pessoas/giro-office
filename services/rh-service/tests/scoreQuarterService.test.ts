import { ServiceError } from "@workspace/shared";
import { expect, it } from "vitest";

import {
  Prisma,
  type PrismaClient,
  ScoreEvaluationStatus,
} from "../src/generated/prisma/client.js";

import { ScoreEvaluationService } from "../src/services/scoreEvaluationService.js";
import { ScoreQuarterService } from "../src/services/scoreQuarterService.js";

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
        throw new Error("scoreEvaluation.create não deve ser chamado sem perguntas ativas");
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

it("generateQuarterlyScore lança 409 quando o trimestre já existe", async () => {
  const db = {
    scoreQuarter: {
      findUnique: async () => ({ id: "existing" }),
    },
    user: { findUnique: async () => null },
    $transaction: async () => {
      throw new Error("transaction não deve rodar");
    },
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await expect(
    svc.generateQuarterlyScore({
      organization_id: orgId,
      target_user_id: targetUserId,
      quarter,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 409 && err.message.includes("já gerado"),
  );
});

it("generateQuarterlyScore lança 404 quando o usuário alvo não existe", async () => {
  const db = {
    scoreQuarter: { findUnique: async () => null },
    user: { findUnique: async () => null },
    $transaction: async () => {
      throw new Error("transaction não deve rodar");
    },
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await expect(
    svc.generateQuarterlyScore({
      organization_id: orgId,
      target_user_id: targetUserId,
      quarter,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message.includes("não encontrado"),
  );
});

it("generateQuarterlyScore lança 400 quando o alvo não pertence à organização", async () => {
  const db = {
    scoreQuarter: { findUnique: async () => null },
    user: {
      findUnique: async () => ({
        ...collaboratorTargetUser(),
        organization_id: "outra-org",
      }),
    },
    $transaction: async () => {
      throw new Error("transaction não deve rodar");
    },
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await expect(
    svc.generateQuarterlyScore({
      organization_id: orgId,
      target_user_id: targetUserId,
      quarter,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 400 && err.message.includes("organização"),
  );
});

it("generateQuarterlyScore lança 400 sem permissão RH na organização", async () => {
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
    $transaction: async () => {
      throw new Error("transaction não deve rodar");
    },
    scoreEvaluation: {},
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await expect(
    svc.generateQuarterlyScore({
      organization_id: orgId,
      target_user_id: targetUserId,
      quarter,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 400 &&
      err.message.includes("permissões RH"),
  );
});

it("generateQuarterlyScore conclui transação quando não há perguntas cadastradas", async () => {
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

  expect(result && typeof result === "object").toBe(true);
  expect((result as { id: string }).id).toBe("score-new");
});

it("generateQuarterlyScore mapeia P2002 para 409", async () => {
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

  await expect(
    svc.generateQuarterlyScore({
      organization_id: orgId,
      target_user_id: targetUserId,
      quarter,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 409 && err.message.includes("já gerado"),
  );
});

it("ScoreEvaluationService.submitEvaluation lança 404 quando a avaliação não existe", async () => {
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

  await expect(
    svc.submitEvaluation({
      organization_id: orgId,
      user_id: "user-1",
      evaluation_id: evalIdSubmit,
      answers: [{ question_id: "q1", answer: 5 }],
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 404 && err.message.includes("Avaliação"),
  );
});

it("ScoreEvaluationService.submitEvaluation lança 409 quando já está concluída", async () => {
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

  await expect(
    svc.submitEvaluation({
      organization_id: orgId,
      user_id: "user-1",
      evaluation_id: evalIdSubmit,
      answers: [{ question_id: "q1", answer: 5 }],
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 409 && err.message.includes("concluída"),
  );
});

it("ScoreEvaluationService.submitEvaluation atualiza e dispara recálculo", async () => {
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

  expect(evaluationUpdateCalls).toBe(1);
  expect(quarterUpdateCalls).toBe(1);
  expect(result.message).toBe("Avaliação enviada com sucesso");
});

it("getDetail lança 404 quando o score não existe", async () => {
  const db = {
    scoreQuarter: { findUnique: async () => null },
    scoreEvaluation: {},
    user: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreQuarterService(asDb(db));

  await expect(svc.getDetail({ organization_id: orgId, score_id: "x" })).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message.includes("Score não encontrado"),
  );
});

it("getDetail lança 403 quando a organização não confere", async () => {
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

  await expect(svc.getDetail({ organization_id: orgId, score_id: "s1" })).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 403 && err.message.includes("organização"),
  );
});

it("listForUser retorna lista do prisma", async () => {
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
  expect(rows).toEqual(expected);
});

it("ScoreEvaluationService.listPendingEvaluations lança 404 se o utilizador não existe", async () => {
  const db = {
    user: { findUnique: async () => null },
    scoreQuarter: {},
    scoreEvaluation: {},
    $transaction: async () => undefined,
    scoreNitro: {},
  };
  const svc = new ScoreEvaluationService(asDb(db));

  await expect(svc.listPendingEvaluations(orgId, "ghost")).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message.includes("Utilizador não encontrado"),
  );
});

it("updateNitro lança 404 quando nitro não existe", async () => {
  const db = {
    scoreNitro: { findUnique: async () => null },
    scoreQuarter: {},
    scoreEvaluation: {},
    user: {},
    $transaction: async () => undefined,
  };
  const svc = new ScoreQuarterService(asDb(db));

  await expect(
    svc.updateNitro({
      organization_id: orgId,
      score_id: "s1",
      type: "projects",
      value: 1,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 404 && err.message.includes("Nitro"),
  );
});
