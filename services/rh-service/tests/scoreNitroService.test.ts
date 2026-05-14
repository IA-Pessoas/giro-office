import { ServiceError } from "@workspace/shared";
import { expect, it } from "vitest";

import { type PrismaClient, ScoreEvaluationStatus } from "../src/generated/prisma/client.js";
import { ScoreNitroService } from "../src/services/scoreNitroService.js";

const orgId = "org-1";
const scoreUuid = "550e8400-e29b-41d4-a716-446655440099";

function asDb(mock: object): PrismaClient {
  return mock as unknown as PrismaClient;
}

function baseNitroRow() {
  return {
    id: "nitro-1",
    score_id: scoreUuid,
    projects_score: 0,
    hours_score: 0,
    errors_score: 0,
    folders_score: 0,
    total_hours: 0,
    total_errors: 0,
    organization_id: orgId,
  };
}

it("updateMetric lança 404 quando o registro Nitro não existe", async () => {
  const db = {
    scoreNitro: {
      findUnique: async () => null,
      update: async () => {
        throw new Error("update não deve ser chamado");
      },
    },
    scoreQuarter: {},
  };
  const svc = new ScoreNitroService(asDb(db));

  await expect(
    svc.updateMetric(orgId, "user-1", {
      score_id: scoreUuid,
      type: "projects",
      value: 1,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message.includes("Nitro não encontrado"),
  );
});

it("updateMetric lança 404 quando o Nitro pertence a outra organização", async () => {
  const db = {
    scoreNitro: {
      findUnique: async () => ({
        ...baseNitroRow(),
        organization_id: "outra-org",
      }),
      update: async () => {
        throw new Error("update não deve ser chamado");
      },
    },
    scoreQuarter: {},
  };
  const svc = new ScoreNitroService(asDb(db));

  await expect(
    svc.updateMetric(orgId, "user-1", {
      score_id: scoreUuid,
      type: "projects",
      value: 1,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message.includes("Nitro não encontrado"),
  );
});

it("updateMetric atualiza projects_score e recalcula final_score", async () => {
  const quarterUpdatePayloads: { data: Record<string, unknown> }[] = [];
  const db = {
    scoreNitro: {
      findUnique: async () => baseNitroRow(),
      update: async ({ data }: { data: { projects_score?: number } }) => ({
        ...baseNitroRow(),
        projects_score: data.projects_score ?? 0,
      }),
    },
    scoreQuarter: {
      findUnique: async () => ({
        id: scoreUuid,
        organization_id: orgId,
        evaluations: [
          {
            type: "behavioral",
            status: ScoreEvaluationStatus.Completed,
            average_score: 8,
          },
        ],
        nitro: {
          projects_score: 1,
          hours_score: 0,
          errors_score: 0,
          folders_score: 0,
        },
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        quarterUpdatePayloads.push({ data });
        return { id: scoreUuid };
      },
    },
  };
  const svc = new ScoreNitroService(asDb(db));

  const result = await svc.updateMetric(orgId, "user-1", {
    score_id: scoreUuid,
    type: "projects",
    value: 1,
  });

  expect(result.projects_score).toBe(1);
  expect(quarterUpdatePayloads.length).toBe(2);
  expect(quarterUpdatePayloads[0]?.data).toMatchObject({
    behavioral: 8,
    technical: 0,
    technology: 0,
    leadership: 0,
  });
  expect(quarterUpdatePayloads[1]?.data).toMatchObject({ final_score: 9 });
});

it("updateMetric mapeia hours, errors e folders para os campos corretos", async () => {
  const cases = [
    { type: "hours" as const, field: "hours_score", value: 0.5 },
    { type: "errors" as const, field: "errors_score", value: 1 },
    { type: "folders" as const, field: "folders_score", value: -0.25 },
  ];

  for (const { type, field, value } of cases) {
    let updatedField: string | undefined;
    const db = {
      scoreNitro: {
        findUnique: async () => baseNitroRow(),
        update: async ({ data }: { data: Record<string, number> }) => {
          updatedField = Object.keys(data)[0];
          return { ...baseNitroRow(), ...data };
        },
      },
      scoreQuarter: {
        findUnique: async () => ({
          id: scoreUuid,
          organization_id: orgId,
          evaluations: [],
          nitro: {
            projects_score: 0,
            hours_score: 0,
            errors_score: 0,
            folders_score: 0,
          },
        }),
        update: async () => ({ id: scoreUuid }),
      },
    };
    const svc = new ScoreNitroService(asDb(db));

    await svc.updateMetric(orgId, "user-1", {
      score_id: scoreUuid,
      type,
      value,
    });

    expect(updatedField).toBe(field);
  }
});

it("updateMetric ignora recálculo quando o score não tem nitro incluído (retorno antecipado)", async () => {
  let quarterUpdates = 0;
  const db = {
    scoreNitro: {
      findUnique: async () => baseNitroRow(),
      update: async () => ({ ...baseNitroRow(), projects_score: 2 }),
    },
    scoreQuarter: {
      findUnique: async () => ({
        id: scoreUuid,
        organization_id: orgId,
        evaluations: [],
        nitro: null,
      }),
      update: async () => {
        quarterUpdates += 1;
        return { id: scoreUuid };
      },
    },
  };
  const svc = new ScoreNitroService(asDb(db));

  const result = await svc.updateMetric(orgId, "user-1", {
    score_id: scoreUuid,
    type: "projects",
    value: 2,
  });

  expect(result.projects_score).toBe(2);
  expect(quarterUpdates).toBe(0);
});

it("updateMetric propaga 403 quando o score não pertence à organização no recálculo", async () => {
  const db = {
    scoreNitro: {
      findUnique: async () => baseNitroRow(),
      update: async () => ({ ...baseNitroRow(), projects_score: 1 }),
    },
    scoreQuarter: {
      findUnique: async () => ({
        id: scoreUuid,
        organization_id: "outra-org",
        evaluations: [],
        nitro: {
          projects_score: 1,
          hours_score: 0,
          errors_score: 0,
          folders_score: 0,
        },
      }),
      update: async () => {
        throw new Error("update não deve ser chamado");
      },
    },
  };
  const svc = new ScoreNitroService(asDb(db));

  await expect(
    svc.updateMetric(orgId, "user-1", {
      score_id: scoreUuid,
      type: "projects",
      value: 1,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError && err.statusCode === 403 && err.message.includes("organização"),
  );
});

it("updateMetric considera apenas avaliações Completed no recálculo", async () => {
  let finalScore: number | undefined;
  const db = {
    scoreNitro: {
      findUnique: async () => baseNitroRow(),
      update: async () => ({ ...baseNitroRow(), projects_score: 0 }),
    },
    scoreQuarter: {
      findUnique: async () => ({
        id: scoreUuid,
        organization_id: orgId,
        evaluations: [
          {
            type: "behavioral",
            status: ScoreEvaluationStatus.Pending,
            average_score: 10,
          },
          {
            type: "behavioral",
            status: ScoreEvaluationStatus.Completed,
            average_score: 4,
          },
        ],
        nitro: {
          projects_score: 0,
          hours_score: 0,
          errors_score: 0,
          folders_score: 0,
        },
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if ("final_score" in data) {
          finalScore = data.final_score as number;
        }
        return { id: scoreUuid };
      },
    },
  };
  const svc = new ScoreNitroService(asDb(db));

  await svc.updateMetric(orgId, "user-1", {
    score_id: scoreUuid,
    type: "projects",
    value: 0,
  });

  expect(finalScore).toBe(4);
});

it("updateMetric lança 400 quando organization_id está vazio", async () => {
  const db = {
    scoreNitro: {},
    scoreQuarter: {},
  };
  const svc = new ScoreNitroService(asDb(db));

  await expect(
    svc.updateMetric("   ", "user-1", {
      score_id: scoreUuid,
      type: "projects",
      value: 1,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 400 &&
      err.message.includes("organization_id"),
  );
});

it("updateMetric mapeia falha genérica do Prisma para 500", async () => {
  const db = {
    scoreNitro: {
      findUnique: async () => {
        throw new Error("connection refused");
      },
    },
    scoreQuarter: {},
  };
  const svc = new ScoreNitroService(asDb(db));

  await expect(
    svc.updateMetric(orgId, "user-1", {
      score_id: scoreUuid,
      type: "projects",
      value: 1,
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 500 &&
      err.message.includes("Erro interno ao atualizar métrica Nitro"),
  );
});
