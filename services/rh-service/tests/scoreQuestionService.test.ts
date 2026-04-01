import { ServiceError } from "@workspace/shared";
import { expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client.js";
import { ScoreQuestionService } from "../src/services/scoreQuestionService.js";

const baseRow = {
  id: "00000000-0000-4000-8000-000000000001",
  question_id: "00000000-0000-4000-8000-000000000001",
  organization_id: "org-1",
  question: "Pergunta base",
  type: "behavioral" as const,
  active: true,
};

function createPrismaStub(overrides: {
  create?: ReturnType<typeof vi.fn>;
  findFirst?: ReturnType<typeof vi.fn>;
  findMany?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): PrismaClient {
  return {
    scoreQuestion: {
      create:
        overrides.create ??
        vi.fn(async (args: { data: typeof baseRow }) => ({
          ...baseRow,
          ...args.data,
        })),
      findFirst: overrides.findFirst ?? vi.fn(async () => null),
      findMany: overrides.findMany ?? vi.fn(async () => []),
      update:
        overrides.update ??
        vi.fn(async (args: { data: Partial<typeof baseRow>; where: { id: string } }) => ({
          ...baseRow,
          ...args.data,
          id: args.where.id,
        })),
    },
  } as unknown as PrismaClient;
}

function firstCallArgs<T>(mockFn: { mock: { calls: unknown[][] } }): T {
  expect(mockFn.mock.calls.length).toBeGreaterThanOrEqual(1);
  return mockFn.mock.calls[0][0] as T;
}

it("create normaliza trim em organization_id e question e define id igual a question_id", async () => {
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: args.data.id,
    question_id: args.data.question_id,
    organization_id: args.data.organization_id,
    question: args.data.question,
    type: args.data.type,
    active: args.data.active,
  }));

  const service = new ScoreQuestionService(createPrismaStub({ create }));
  const result = await service.create({
    organization_id: "  org-1  ",
    question: "  Texto?  ",
    type: "technical",
  });

  expect(result.organization_id).toBe("org-1");
  expect(result.question).toBe("Texto?");
  expect(result.type).toBe("technical");
  expect(result.active).toBe(true);
  expect(result.id).toBe(result.question_id);
  expect(create.mock.calls.length).toBe(1);
  const arg0 = firstCallArgs<{ data: Record<string, unknown> }>(create);
  expect(arg0.data.organization_id).toBe("org-1");
  expect(arg0.data.question).toBe("Texto?");
  expect(arg0.data.id).toBe(arg0.data.question_id);
});

it("create propaga ServiceError 400 quando organization_id é vazio", async () => {
  const service = new ScoreQuestionService(createPrismaStub({}));
  await expect(
    service.create({
      organization_id: "   ",
      question: "x",
      type: "behavioral",
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 400 &&
      err.message === "organization_id é obrigatório.",
  );
});

it("create encapsula falha do Prisma em ServiceError 500", async () => {
  const create = vi.fn(async () => {
    throw new Error("db down");
  });
  const service = new ScoreQuestionService(createPrismaStub({ create }));

  await expect(
    service.create({
      organization_id: "org-1",
      question: "q",
      type: "leadership",
    }),
  ).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ServiceError &&
      err.statusCode === 500 &&
      String((err as ServiceError).message).includes("Erro interno ao criar pergunta de score"),
  );
});

it("update exige ao menos um campo alterável", async () => {
  const service = new ScoreQuestionService(createPrismaStub({}));
  await expect(
    service.update({
      id: baseRow.id,
      organization_id: "org-1",
    }),
  ).rejects.toSatisfy((err: unknown) => err instanceof ServiceError && err.statusCode === 400);
});

it("update retorna 404 quando a pergunta não existe na organização", async () => {
  const findFirst = vi.fn(async () => null);
  const service = new ScoreQuestionService(createPrismaStub({ findFirst }));

  await expect(
    service.update({
      id: baseRow.id,
      organization_id: "org-1",
      question: "Nova",
    }),
  ).rejects.toSatisfy((err: unknown) => err instanceof ServiceError && err.statusCode === 404);
});

it("update aplica alterações quando o registro existe", async () => {
  const findFirst = vi.fn(async () => ({ ...baseRow }));
  const update = vi.fn(async () => ({
    ...baseRow,
    question: "Atualizada",
    active: false,
  }));
  const service = new ScoreQuestionService(createPrismaStub({ findFirst, update }));

  const result = await service.update({
    id: baseRow.id,
    organization_id: "org-1",
    question: "Atualizada",
    active: false,
  });

  expect(result.question).toBe("Atualizada");
  expect(result.active).toBe(false);
  expect(update.mock.calls.length).toBe(1);
});

it("list filtra por organização e apenas ativas por padrão", async () => {
  const findMany = vi.fn(async () => [baseRow]);
  const service = new ScoreQuestionService(createPrismaStub({ findMany }));

  await service.list("org-1");

  expect(findMany.mock.calls.length).toBe(1);
  const arg0 = firstCallArgs<{
    where: { organization_id: string; active?: boolean; type?: string };
  }>(findMany);
  expect(arg0.where.organization_id).toBe("org-1");
  expect(arg0.where.active).toBe(true);
  expect(arg0.where.type).toBe(undefined);
});

it("list com includeInactive não restringe por active", async () => {
  const findMany = vi.fn(async () => []);
  const service = new ScoreQuestionService(createPrismaStub({ findMany }));

  await service.list("org-1", { includeInactive: true });

  const arg0 = firstCallArgs<{ where: Record<string, unknown> }>(findMany);
  expect(arg0.where.organization_id).toBe("org-1");
  expect(arg0.where.active).toBe(undefined);
});

it("list com type filtra pelo tipo", async () => {
  const findMany = vi.fn(async () => []);
  const service = new ScoreQuestionService(createPrismaStub({ findMany }));

  await service.list("org-1", { type: "tech" });

  const arg0 = firstCallArgs<{ where: { type?: string } }>(findMany);
  expect(arg0.where.type).toBe("tech");
});

it("delete inativa pergunta existente", async () => {
  const findFirst = vi.fn(async () => ({ id: baseRow.id }));
  const update = vi.fn(async () => baseRow);
  const service = new ScoreQuestionService(createPrismaStub({ findFirst, update }));

  const result = await service.delete({
    id: baseRow.id,
    organization_id: "org-1",
  });

  expect(result.message).toBe("Pergunta inativada com sucesso");
  expect(update.mock.calls.length).toBe(1);
  const upd = firstCallArgs<{ data: { active: boolean } }>(update);
  expect(upd.data.active).toBe(false);
});

it("delete retorna 404 quando não encontra na organização", async () => {
  const findFirst = vi.fn(async () => null);
  const service = new ScoreQuestionService(createPrismaStub({ findFirst }));

  await expect(
    service.delete({
      id: baseRow.id,
      organization_id: "org-1",
    }),
  ).rejects.toSatisfy((err: unknown) => err instanceof ServiceError && err.statusCode === 404);
});
