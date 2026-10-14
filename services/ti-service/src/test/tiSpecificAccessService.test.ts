import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import {
  listTiSpecificAccesses,
  setTiTaskCompletionAccess,
} from "../services/tiSpecificAccessService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
};
const targetUserId = "00000000-0000-4000-8000-000000000002";

type Call = { sql: string; values: unknown[] };

/** Banco falso: responde às consultas na ordem e registra o SQL de cada chamada. */
function database(answers: unknown[][]) {
  const queries: Call[] = [];
  const statements: Call[] = [];
  const db = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: strings.join("?"), values });
      return answers[queries.length - 1] ?? [];
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: strings.join("?"), values });
      return 1;
    }),
    $transaction: vi.fn(async (callback: (database: unknown) => Promise<unknown>) => callback(db)),
  };
  return { db, queries, statements };
}

const row = (taskCompletion: boolean) => ({
  id: targetUserId,
  name: "Ana",
  full_name: null,
  department: "Integração",
  task_completion: taskCompletion,
});

describe("listTiSpecificAccesses", () => {
  it("lists active users of the organization with their task completion access", async () => {
    const { db, queries } = database([[row(true)]]);

    expect(await listTiSpecificAccesses(db as never, context)).toEqual([row(true)]);
    expect(queries[0]?.sql).toContain("u.organization_id = ? AND u.status = 'active'");
    // Sem registro em permissions.specific o usuário não conclui tarefas.
    expect(queries[0]?.sql).toContain("COALESCE(s.task_completion, false)");
    expect(queries[0]?.values).toEqual([context.organizationId]);
  });
});

describe("setTiTaskCompletionAccess", () => {
  it("grants the access and logs who changed it, in one transaction", async () => {
    const { db, statements } = database([
      [{ id: targetUserId, task_completion: false, specific_organization_id: null }],
      [row(true)],
    ]);

    const result = await setTiTaskCompletionAccess(db as never, context, targetUserId, true);

    expect(result).toEqual(row(true));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(statements[0]?.sql).toContain('INSERT INTO "permissions.specific"');
    expect(statements[0]?.sql).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(statements[0]?.values).toEqual([targetUserId, true, context.organizationId]);
    expect(statements[1]?.sql).toContain('INSERT INTO "logs"');
    expect(statements[1]?.values).toEqual([
      expect.any(String),
      context.userId,
      targetUserId,
      JSON.stringify({ task_completion: { from: false, to: true } }),
      context.organizationId,
    ]);
  });

  it("does not let anyone change their own access", async () => {
    const { db, queries, statements } = database([]);

    await expect(
      setTiTaskCompletionAccess(db as never, context, context.userId, true),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(queries).toEqual([]);
    expect(statements).toEqual([]);
  });

  it("locks the user row so concurrent changes do not log twice", async () => {
    const { db, queries } = database([
      [{ id: targetUserId, task_completion: false, specific_organization_id: null }],
      [row(true)],
    ]);

    await setTiTaskCompletionAccess(db as never, context, targetUserId, true);

    expect(queries[0]?.sql).toContain("FOR UPDATE OF u");
  });

  it("does not log when nothing changes", async () => {
    const { db, statements } = database([
      [{ id: targetUserId, task_completion: true, specific_organization_id: null }],
      [row(true)],
    ]);

    await setTiTaskCompletionAccess(db as never, context, targetUserId, true);

    expect(statements).toHaveLength(1);
  });

  it("refuses users outside the organization or inactive", async () => {
    const { db, statements, queries } = database([[]]);

    await expect(
      setTiTaskCompletionAccess(db as never, context, targetUserId, true),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(queries[0]?.sql).toContain("u.organization_id = ?");
    expect(queries[0]?.sql).toContain("u.status = 'active'");
    expect(statements).toEqual([]);
  });

  it("does not touch an access row that belongs to another organization", async () => {
    const { db, statements } = database([
      [
        {
          id: targetUserId,
          task_completion: true,
          specific_organization_id: "10000000-0000-4000-8000-000000000009",
        },
      ],
    ]);

    await expect(
      setTiTaskCompletionAccess(db as never, context, targetUserId, false),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(statements).toEqual([]);
  });
});
