import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { ServiceError } from "@workspace/shared";

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
  create?: ReturnType<typeof mock.fn>;
  findFirst?: ReturnType<typeof mock.fn>;
  findMany?: ReturnType<typeof mock.fn>;
  update?: ReturnType<typeof mock.fn>;
}): PrismaClient {
  return {
    scoreQuestion: {
      create:
        overrides.create ??
        mock.fn(async (args: { data: typeof baseRow }) => ({
          ...baseRow,
          ...args.data,
        })),
      findFirst: overrides.findFirst ?? mock.fn(async () => null),
      findMany: overrides.findMany ?? mock.fn(async () => []),
      update:
        overrides.update ??
        mock.fn(async (args: { data: Partial<typeof baseRow>; where: { id: string } }) => ({
          ...baseRow,
          ...args.data,
          id: args.where.id,
        })),
    },
  } as unknown as PrismaClient;
}

type MockCallContext = { arguments: unknown[] };

function firstCallArgs<T>(mockFn: { mock: { calls: readonly unknown[] } }): T {
  const calls = mockFn.mock.calls as unknown as MockCallContext[];
  assert.ok(calls.length >= 1, "esperado pelo menos uma chamada ao mock");
  return calls[0].arguments[0] as T;
}

test("create normaliza trim em organization_id e question e define id igual a question_id", async () => {
  const create = mock.fn(async (args: { data: Record<string, unknown> }) => ({
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

  assert.equal(result.organization_id, "org-1");
  assert.equal(result.question, "Texto?");
  assert.equal(result.type, "technical");
  assert.equal(result.active, true);
  assert.equal(result.id, result.question_id);
  assert.equal(create.mock.calls.length, 1);
  const arg0 = firstCallArgs<{ data: Record<string, unknown> }>(create);
  assert.equal(arg0.data.organization_id, "org-1");
  assert.equal(arg0.data.question, "Texto?");
  assert.equal(arg0.data.id, arg0.data.question_id);
});

test("create propaga ServiceError 400 quando organization_id é vazio", async () => {
  const service = new ScoreQuestionService(createPrismaStub({}));
  await assert.rejects(
    async () =>
      service.create({
        organization_id: "   ",
        question: "x",
        type: "behavioral",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, "organization_id é obrigatório.");
      return true;
    },
  );
});

test("create encapsula falha do Prisma em ServiceError 500", async () => {
  const create = mock.fn(async () => {
    throw new Error("db down");
  });
  const service = new ScoreQuestionService(createPrismaStub({ create }));

  await assert.rejects(
    async () =>
      service.create({
        organization_id: "org-1",
        question: "q",
        type: "leadership",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.statusCode, 500);
      assert.ok(
        String((err as ServiceError).message).includes("Erro interno ao criar pergunta de score"),
      );
      return true;
    },
  );
});

test("update exige ao menos um campo alterável", async () => {
  const service = new ScoreQuestionService(createPrismaStub({}));
  await assert.rejects(
    async () =>
      service.update({
        id: baseRow.id,
        organization_id: "org-1",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.statusCode, 400);
      return true;
    },
  );
});

test("update retorna 404 quando a pergunta não existe na organização", async () => {
  const findFirst = mock.fn(async () => null);
  const service = new ScoreQuestionService(createPrismaStub({ findFirst }));

  await assert.rejects(
    async () =>
      service.update({
        id: baseRow.id,
        organization_id: "org-1",
        question: "Nova",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test("update aplica alterações quando o registro existe", async () => {
  const findFirst = mock.fn(async () => ({ ...baseRow }));
  const update = mock.fn(async () => ({
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

  assert.equal(result.question, "Atualizada");
  assert.equal(result.active, false);
  assert.equal(update.mock.calls.length, 1);
});

test("list filtra por organização e apenas ativas por padrão", async () => {
  const findMany = mock.fn(async () => [baseRow]);
  const service = new ScoreQuestionService(createPrismaStub({ findMany }));

  await service.list("org-1");

  assert.equal(findMany.mock.calls.length, 1);
  const arg0 = firstCallArgs<{
    where: { organization_id: string; active?: boolean; type?: string };
  }>(findMany);
  assert.equal(arg0.where.organization_id, "org-1");
  assert.equal(arg0.where.active, true);
  assert.equal(arg0.where.type, undefined);
});

test("list com includeInactive não restringe por active", async () => {
  const findMany = mock.fn(async () => []);
  const service = new ScoreQuestionService(createPrismaStub({ findMany }));

  await service.list("org-1", { includeInactive: true });

  const arg0 = firstCallArgs<{ where: Record<string, unknown> }>(findMany);
  assert.equal(arg0.where.organization_id, "org-1");
  assert.equal(arg0.where.active, undefined);
});

test("list com type filtra pelo tipo", async () => {
  const findMany = mock.fn(async () => []);
  const service = new ScoreQuestionService(createPrismaStub({ findMany }));

  await service.list("org-1", { type: "tech" });

  const arg0 = firstCallArgs<{ where: { type?: string } }>(findMany);
  assert.equal(arg0.where.type, "tech");
});

test("delete inativa pergunta existente", async () => {
  const findFirst = mock.fn(async () => ({ id: baseRow.id }));
  const update = mock.fn(async () => baseRow);
  const service = new ScoreQuestionService(createPrismaStub({ findFirst, update }));

  const result = await service.delete({
    id: baseRow.id,
    organization_id: "org-1",
  });

  assert.equal(result.message, "Pergunta inativada com sucesso");
  assert.equal(update.mock.calls.length, 1);
  const upd = firstCallArgs<{ data: { active: boolean } }>(update);
  assert.equal(upd.data.active, false);
});

test("delete retorna 404 quando não encontra na organização", async () => {
  const findFirst = mock.fn(async () => null);
  const service = new ScoreQuestionService(createPrismaStub({ findFirst }));

  await assert.rejects(
    async () =>
      service.delete({
        id: baseRow.id,
        organization_id: "org-1",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});
