import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { DteQueryService, parseDocumentList } from "../services/dteQueryService.js";

const ORG = "a0000000-0000-4000-8000-000000000001";
const DATE = new Date("2026-10-09T00:00:00.000Z");
const CLIENTS = [
  { id: "client-a", name: "Alfa Comércio", fantasy_name: "Alfa", cpf_cnpj: "11.111.111/0001-11" },
  { id: "client-b", name: "Beta Indústria", fantasy_name: null, cpf_cnpj: "22222222000122" },
  { id: "client-c", name: "Gama Comércio", fantasy_name: null, cpf_cnpj: "33333333000133" },
];

type QueryRow = { id: string; organization_id: string; client_id: string; done: boolean };

// Banco em memória só com o que o serviço usa. As consultas ficam num Map por cliente, como
// o índice único (organização, cliente, dia) garante no banco.
function createPrisma(initial: Record<string, boolean> = {}) {
  const rows = new Map<string, QueryRow>(
    Object.entries(initial).map(([client_id, done]) => [
      client_id,
      { id: `query-${client_id}`, organization_id: ORG, client_id, done },
    ]),
  );
  const prisma = {
    rows,
    clientSegment: { findMany: vi.fn(async () => [{ name: "Varejo" }]) },
    client: {
      findMany: vi.fn(async (_args: Record<string, unknown>) => CLIENTS),
      findFirst: vi.fn(async (args: { where: { id: string; organization_id: string } }) =>
        args.where.organization_id === ORG
          ? (CLIENTS.find((client) => client.id === args.where.id) ?? null)
          : null,
      ),
    },
    regularizeDteQuery: {
      findMany: vi.fn(async (_args: Record<string, unknown>) => [...rows.values()]),
      findUnique: vi.fn(
        async (args: { where: { organization_id_client_id_date: { client_id: string } } }) =>
          rows.get(args.where.organization_id_client_id_date.client_id) ?? null,
      ),
      upsert: vi.fn(async (args: { create: { client_id: string; done: boolean } }) => {
        const row = {
          id: `query-${args.create.client_id}`,
          organization_id: ORG,
          client_id: args.create.client_id,
          done: args.create.done,
        };
        rows.set(row.client_id, row);
        return row;
      }),
      deleteMany: vi.fn(async (args: { where: { client_id: string } }) => ({
        count: rows.delete(args.where.client_id) ? 1 : 0,
      })),
      createMany: vi.fn(async (args: { data: Array<{ client_id: string; done: boolean }> }) => {
        for (const item of args.data) {
          rows.set(item.client_id, {
            id: `query-${item.client_id}`,
            organization_id: ORG,
            ...item,
          });
        }
        return { count: args.data.length };
      }),
      updateMany: vi.fn(
        async (args: { where: { client_id: { in: string[] } }; data: { done: boolean } }) => {
          for (const id of args.where.client_id.in) {
            const row = rows.get(id);
            if (row) row.done = args.data.done;
          }
          return { count: args.where.client_id.in.length };
        },
      ),
    },
    logs: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})) },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  return prisma;
}

function serviceFor(prisma: ReturnType<typeof createPrisma>) {
  return new DteQueryService(prisma as unknown as PrismaClient);
}

function statusOf(prisma: ReturnType<typeof createPrisma>) {
  return Object.fromEntries([...prisma.rows.values()].map((row) => [row.client_id, row.done]));
}

describe("parseDocumentList", () => {
  it("lê a lista textual do legado: separadores variados, máscara e repetidos", () => {
    expect(parseDocumentList("11.111.111/0001-11, 22222222000122,,\n22222222000122; ")).toEqual([
      "11111111000111",
      "22222222000122",
    ]);
    expect(parseDocumentList("")).toEqual([]);
  });
});

describe("DteQueryService.grid", () => {
  it("mostra feita, não feita e sem registro para os clientes do dia", async () => {
    const prisma = createPrisma({ "client-a": true, "client-b": false });

    const grid = await serviceFor(prisma).grid({ organizationId: ORG, date: DATE });

    expect(grid.rows.map((row) => [row.client_id, row.status])).toEqual([
      ["client-a", "feita"],
      ["client-b", "nao_feita"],
      ["client-c", "sem_registro"],
    ]);
    expect(grid.totals).toEqual({ feita: 1, nao_feita: 1, sem_registro: 1 });
    expect(prisma.regularizeDteQuery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG, date: DATE } }),
    );
  });

  it("busca os clientes elegíveis do legado e os que já têm registro no dia", async () => {
    const prisma = createPrisma({ "client-a": true });

    await serviceFor(prisma).grid({ organizationId: ORG, date: DATE });

    const where = prisma.client.findMany.mock.calls[0]?.[0].where as {
      organization_id: string;
      OR: Array<Record<string, unknown>>;
    };
    expect(where.organization_id).toBe(ORG);
    expect(where.OR[0]).toEqual({ id: { in: ["client-a"] } });
    expect(where.OR[1]).toMatchObject({
      segment: { in: ["Varejo"], mode: "insensitive" },
      state: { equals: "BA", mode: "insensitive" },
    });
  });
});

describe("DteQueryService.setStatus", () => {
  const base = { organizationId: ORG, userId: "user-1", date: DATE };

  it("tira o cliente das não feitas ao marcar feita, sem tocar nos outros", async () => {
    const prisma = createPrisma({ "client-a": false, "client-b": false });

    await serviceFor(prisma).setStatus({ ...base, clientId: "client-a", status: "feita" });

    expect(statusOf(prisma)).toEqual({ "client-a": true, "client-b": false });
  });

  it("tira o cliente das feitas ao marcar não feita", async () => {
    const prisma = createPrisma({ "client-a": true, "client-b": true });

    await serviceFor(prisma).setStatus({ ...base, clientId: "client-a", status: "nao_feita" });

    expect(statusOf(prisma)).toEqual({ "client-a": false, "client-b": true });
  });

  it.each([
    ["feita", true],
    ["não feita", false],
  ])("remove só o registro do cliente que estava em %s ao voltar para sem registro", async (_name, done) => {
    const prisma = createPrisma({ "client-a": done, "client-b": done });

    await serviceFor(prisma).setStatus({ ...base, clientId: "client-a", status: "sem_registro" });

    expect(statusOf(prisma)).toEqual({ "client-b": done });
  });

  it("cria o registro de quem estava sem registro e guarda o histórico", async () => {
    const prisma = createPrisma();

    const result = await serviceFor(prisma).setStatus({
      ...base,
      clientId: "client-c",
      status: "nao_feita",
    });

    expect(result).toEqual({ client_id: "client-c", date: "2026-10-09", status: "nao_feita" });
    expect(statusOf(prisma)).toEqual({ "client-c": false });
    expect(prisma.logs.create).toHaveBeenCalledWith({
      data: {
        user_id: "user-1",
        organization_id: ORG,
        action: "Cadastro",
        referring: "regularize.dte_queries",
        referring_id: "query-client-c",
        changes: {
          client_id: "client-c",
          date: "2026-10-09",
          status: { from: "sem_registro", to: "nao_feita" },
        },
      },
    });
  });

  it("não grava nem registra histórico quando nada muda", async () => {
    const prisma = createPrisma({ "client-a": true });

    await serviceFor(prisma).setStatus({ ...base, clientId: "client-a", status: "feita" });

    expect(prisma.regularizeDteQuery.upsert).not.toHaveBeenCalled();
    expect(prisma.logs.create).not.toHaveBeenCalled();
  });

  it("responde 404 para cliente de outra organização", async () => {
    const prisma = createPrisma();

    await expect(
      serviceFor(prisma).setStatus({
        ...base,
        organizationId: "outra-org",
        clientId: "client-a",
        status: "feita",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.regularizeDteQuery.upsert).not.toHaveBeenCalled();
  });
});

describe("DteQueryService.importLists", () => {
  const base = { organizationId: ORG, userId: "user-1", date: DATE };

  it("registra as duas listas por CPF/CNPJ, corrigindo quem estava no outro conjunto", async () => {
    const prisma = createPrisma({ "client-a": false });

    const result = await serviceFor(prisma).importLists({
      ...base,
      done: "11111111000111,22.222.222/0001-22",
      notDone: "33333333000133",
    });

    expect(statusOf(prisma)).toEqual({ "client-a": true, "client-b": true, "client-c": false });
    expect(result).toEqual({
      date: "2026-10-09",
      done_count: 2,
      not_done_count: 1,
      conflicts: [],
      unknown: [],
    });
    // O histórico guarda de onde saiu quem a lista trocou de conjunto.
    expect(prisma.logs.create).toHaveBeenCalledTimes(1);
    expect(prisma.logs.create.mock.calls[0]?.[0].data.changes).toMatchObject({
      done_client_ids: ["client-a", "client-b"],
      not_done_client_ids: ["client-c"],
      moved_from: { "client-a": "nao_feita" },
    });
  });

  it("não aplica documento que veio nas duas listas e informa os desconhecidos", async () => {
    const prisma = createPrisma();

    const result = await serviceFor(prisma).importLists({
      ...base,
      done: "11111111000111, 22222222000122, 99999999000199",
      notDone: "11111111000111",
    });

    expect(statusOf(prisma)).toEqual({ "client-b": true });
    expect(result).toMatchObject({
      done_count: 1,
      not_done_count: 0,
      conflicts: ["11111111000111"],
      unknown: ["99999999000199"],
    });
  });

  it("recusa listas vazias", async () => {
    const prisma = createPrisma();

    await expect(
      serviceFor(prisma).importLists({ ...base, done: " , ", notDone: "" }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
