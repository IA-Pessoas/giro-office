import { describe, expect, it, vi } from "vitest";
import { statementHistorySchema } from "./schemas.js";
import { createDocumentsService } from "./services.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const auth = { userId: USER, organizationId: ORG, modules: { contabil: 2 } };

type Row = Record<string, unknown>;

// Tabela em memória: o histórico lê o mesmo acompanhamento que o upsert grava.
function prisma(rows: Row[]) {
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const range = value as { gte?: string; lte?: string; in?: unknown[] };
        const field = row[key] as string;
        return (
          (range.gte === undefined || field >= range.gte) &&
          (range.lte === undefined || field <= range.lte) &&
          (range.in === undefined || range.in.includes(field))
        );
      }
      return row[key] === value;
    });
  const database = {
    client: { findFirst: vi.fn().mockResolvedValue({ id: CLIENT }) },
    triageResponsible: { findFirst: vi.fn() },
    triageBankStatement: {
      findMany: vi.fn(
        async ({ where, orderBy, take }: { where: Row; orderBy: Row[]; take: number }) => {
          expect(orderBy).toEqual([{ competence: "desc" }, { bank_id: "asc" }]);
          return rows
            .filter((row) => matches(row, where))
            .slice(0, take)
            .sort(
              (a, b) =>
                String(b.competence).localeCompare(String(a.competence)) ||
                String(a.bank_id).localeCompare(String(b.bank_id)),
            );
        },
      ),
      findFirst: vi.fn(
        async ({ where }: { where: Row }) => rows.find((row) => matches(row, where)) ?? null,
      ),
      upsert: vi.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const identity = where.organization_id_client_id_competence_bank_id as Row;
        const current = rows.find((row) => matches(row, identity));
        if (current) return Object.assign(current, update);
        const created = { id: `s-${rows.length + 1}`, ...create };
        rows.push(created);
        return created;
      }),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  );
  return database;
}

function statement(competence: string, bank_id: string, status: string, extra: Row = {}): Row {
  return {
    id: `${competence}-${bank_id}`,
    organization_id: ORG,
    client_id: CLIENT,
    competence,
    bank_id,
    status,
    archived_at: null,
    updated_at: new Date("2026-09-30T12:00:00.000Z"),
    ...extra,
  };
}

describe("pendências bancárias em várias competências (#1694)", () => {
  it("lista competência, banco e situação por período, sem misturar competências", async () => {
    const rows = [
      statement("2026-07", "itau", "PENDING"),
      statement("2026-08", "bb", "COMPLETED"),
      statement("2026-08", "itau", "ATTENTION"),
      statement("2026-09", "itau", "PENDING"),
      statement("2026-06", "itau", "PENDING"),
      statement("2026-08", "caixa", "PENDING", { archived_at: new Date() }),
      statement("2026-08", "sicoob", "PENDING", { organization_id: OTHER_ORG }),
    ];
    const service = createDocumentsService(prisma(rows) as never, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    const history = await service.listStatementHistory(
      { client_id: CLIENT, from: "2026-07", to: "2026-08" },
      auth,
    );

    expect(history).toEqual({
      client_id: CLIENT,
      competences: [
        {
          competence: "2026-08",
          pending: 1,
          statements: [
            { bank_id: "bb", status: "COMPLETED", updated_at: expect.any(Date) },
            { bank_id: "itau", status: "ATTENTION", updated_at: expect.any(Date) },
          ],
        },
        {
          competence: "2026-07",
          pending: 1,
          statements: [{ bank_id: "itau", status: "PENDING", updated_at: expect.any(Date) }],
        },
      ],
    });
  });

  it("filtra só pendências e reflete a atualização do acompanhamento bancário", async () => {
    const rows = [statement("2026-05", "itau", "PENDING"), statement("2026-06", "bb", "PENDING")];
    const service = createDocumentsService(prisma(rows) as never, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    const before = await service.listStatementHistory({ client_id: CLIENT, pending: true }, auth);
    await service.upsertStatement(
      { client_id: CLIENT, competence: "2026-05", bank_id: "itau", status: "COMPLETED" },
      auth,
    );
    const after = await service.listStatementHistory({ client_id: CLIENT, pending: true }, auth);

    expect(before.competences.map((group: Row) => group.competence)).toEqual([
      "2026-06",
      "2026-05",
    ]);
    expect(after.competences.map((group: Row) => group.competence)).toEqual(["2026-06"]);
  });

  it("recusa cliente de outra organização", async () => {
    const database = prisma([]);
    database.client.findFirst.mockResolvedValue(null);

    await expect(
      createDocumentsService(database as never, {
        createLog: vi.fn(),
        logUpdateIfChanged: vi.fn(),
      }).listStatementHistory({ client_id: CLIENT }, auth),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(database.triageBankStatement.findMany).not.toHaveBeenCalled();
  });

  it("valida o período da consulta", () => {
    expect(statementHistorySchema.safeParse({ client_id: CLIENT }).success).toBe(true);
    expect(
      statementHistorySchema.safeParse({
        client_id: CLIENT,
        from: "2026-01",
        to: "2026-03",
        pending: "true",
      }).data,
    ).toEqual({ client_id: CLIENT, from: "2026-01", to: "2026-03", pending: true });
    expect(
      statementHistorySchema.safeParse({ client_id: CLIENT, from: "2026-04", to: "2026-03" })
        .success,
    ).toBe(false);
    expect(statementHistorySchema.safeParse({ client_id: CLIENT, from: "2026-13" }).success).toBe(
      false,
    );
  });
});
