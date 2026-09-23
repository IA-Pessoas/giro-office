import { describe, expect, it, vi } from "vitest";
import { createParcelamentoWorkerApp, type ParcelamentoWorkerEnv } from "./app.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INSTALLMENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TOKEN = "parcelamento-internal-token";

type Row = Record<string, unknown>;
type Where = Row;

const env: ParcelamentoWorkerEnv = {
  JWT_SECRET: "parcelamento-worker-secret",
  INTERNAL_SERVICE_TOKEN: TOKEN,
  AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 201 })) },
  AUDIT_SERVICE_TOKEN: "audit-token",
  HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
};

const headers = {
  "x-internal-service-token": TOKEN,
  "x-auth-user-id": USER,
  "x-auth-organization-id": ORG,
  "x-auth-permission": "2",
  "x-auth-kind": "organization",
  "x-request-id": "race-request",
  "content-type": "application/json",
};

const matches = (row: Row, where: Where) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

/**
 * Dublê de Prisma com semântica mínima de PostgreSQL READ COMMITTED: escrita em transação
 * só fica visível para as outras no commit, e `SELECT ... FOR NO KEY UPDATE` bloqueia até o
 * dono da linha encerrar a transação. Os hooks deixam o teste intercalar duas requisições.
 */
function interleavingPrisma() {
  const committed = {
    installments: [
      {
        id: INSTALLMENT,
        client_id: CLIENT,
        type: "Federal",
        jurisdiction: "PGFN",
        is_automatic_debit: false,
        consolidated_total_amount: 0,
        first_installment_amount: 50,
        current_month_installment_amount: 50,
        outstanding_balance: 500,
        paid_installments_count: 0,
        agreed_installments_count: 10,
        remaining_installments_count: 10,
        overdue_installments_count: 0,
        enrollment_date: null,
        document_url: "",
        status: "Ativo",
        completion_date: null,
        down_payment_installments_count: 0,
        legal_nature: "Simples",
        situation_shutdown: null,
        agreement_number: null,
        organization_id: ORG,
      } as Row,
    ],
    competencies: [] as Row[],
  };
  const lockOwners = new Map<string, symbol>();
  let wakeWaiters: Array<() => void> = [];
  const hooks = {
    onCompetenciesRead: () => {},
    beforeTotalsWrite: async () => {},
    onLockWait: () => {},
  };
  const isolationLevels: unknown[] = [];

  function client(tx: symbol | null) {
    const staged = { competencies: [] as Row[], patches: [] as { where: Where; data: Row }[] };
    const installments = () =>
      committed.installments.map((row) => {
        let current = row;
        for (const patch of staged.patches) {
          if (matches(current, patch.where)) current = { ...current, ...patch.data };
        }
        return current;
      });
    const competencies = () => [...committed.competencies, ...staged.competencies];
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    const api = {
      staged,
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        if (!sql.includes("FOR NO KEY UPDATE")) return [{ ok: 1 }];
        if (!tx) throw new Error("lock de linha fora de transação não protege nada");
        const [id, organizationId] = values as [string, string];
        while (lockOwners.has(id) && lockOwners.get(id) !== tx) {
          hooks.onLockWait();
          await new Promise<void>((resolve) => wakeWaiters.push(resolve));
        }
        lockOwners.set(id, tx);
        return installments()
          .filter((row) => matches(row, { id, organization_id: organizationId }))
          .map((row) => ({ id: row.id }));
      },
      installment: {
        findFirst: async ({ where }: { where: Where }) => {
          await tick();
          return installments().find((row) => matches(row, where)) ?? null;
        },
        updateMany: async ({ where, data }: { where: Where; data: Row }) => {
          if ("paid_installments_count" in data) await hooks.beforeTotalsWrite();
          await tick();
          if (tx) staged.patches.push({ where, data });
          else
            committed.installments = committed.installments.map((row) =>
              matches(row, where) ? { ...row, ...data } : row,
            );
          return { count: 1 };
        },
      },
      installmentCompetencies: {
        findFirst: async ({ where }: { where: Where }) => {
          await tick();
          return competencies().find((row) => matches(row, where)) ?? null;
        },
        findMany: async ({ where }: { where: Where }) => {
          await tick();
          const rows = competencies().filter((row) => matches(row, where));
          hooks.onCompetenciesRead();
          return rows;
        },
        create: async ({ data }: { data: Row }) => {
          await tick();
          const row = { id: crypto.randomUUID(), ...data };
          (tx ? staged.competencies : committed.competencies).push(row);
          return row;
        },
        updateMany: async () => ({ count: 1 }),
      },
    };
    return api;
  }

  const root = client(null);
  const prisma = {
    ...root,
    $transaction: async (
      callback: (db: ReturnType<typeof client>) => Promise<unknown>,
      options?: unknown,
    ) => {
      isolationLevels.push(options);
      const tx = Symbol("tx");
      const db = client(tx);
      try {
        const result = await callback(db);
        committed.competencies.push(...db.staged.competencies);
        for (const patch of db.staged.patches) {
          committed.installments = committed.installments.map((row) =>
            matches(row, patch.where) ? { ...row, ...patch.data } : row,
          );
        }
        return result;
      } finally {
        for (const [id, owner] of lockOwners) if (owner === tx) lockOwners.delete(id);
        const waiters = wakeWaiters;
        wakeWaiters = [];
        for (const wake of waiters) wake();
      }
    },
  };
  return { prisma, committed, hooks, isolationLevels };
}

describe("parcelamento Worker — recálculo concorrente de agregados", () => {
  it("não perde parcela paga quando duas competências do mesmo parcelamento são gravadas em paralelo", async () => {
    const { prisma, committed, hooks, isolationLevels } = interleavingPrisma();
    const app = createParcelamentoWorkerApp({ env, prisma: prisma as never });
    const post = (competence: string) =>
      app.request(
        `https://parcelamento.test/parcelamento/installments/${INSTALLMENT}/competencies`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            competence,
            how_many_paid: 1,
            how_many_overdue: 0,
            download: false,
            installment_amount: 50,
          }),
        },
      );

    // A requisição 1 lê as competências e fica parada antes de gravar os totais até a 2
    // terminar ou ficar bloqueada no lock: é a janela da corrida.
    let second: Promise<Response> | undefined;
    let releaseFirst: () => void = () => {};
    const firstMayWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    hooks.onCompetenciesRead = () => {
      hooks.onCompetenciesRead = () => {};
      second = post("2026-09");
      second.then(() => releaseFirst());
    };
    hooks.onLockWait = () => releaseFirst();
    hooks.beforeTotalsWrite = async () => {
      hooks.beforeTotalsWrite = async () => {};
      await firstMayWrite;
    };

    const first = await post("2026-08");
    const secondResponse = await (second as Promise<Response>);

    expect(first.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(committed.competencies).toHaveLength(2);
    expect(committed.installments[0]).toMatchObject({
      paid_installments_count: 2,
      remaining_installments_count: 8,
      outstanding_balance: 400,
    });
    expect(isolationLevels).toEqual([
      { isolationLevel: "ReadCommitted" },
      { isolationLevel: "ReadCommitted" },
    ]);
  });
});
