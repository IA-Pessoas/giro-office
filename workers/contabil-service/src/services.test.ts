import { describe, expect, it, vi } from "vitest";
import { createDocumentsService } from "./services.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MONTHLY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function audit() {
  return { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
}

function prisma() {
  const database = {
    client: { findFirst: vi.fn() },
    triageResponsible: { findFirst: vi.fn() },
    triageMonthly: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    triageBankStatement: { findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    triageCompetence: { findFirst: vi.fn(), update: vi.fn() },
    triageCatalogItem: { findFirst: vi.fn(), findMany: vi.fn() },
    triageCompetenceCatalogSnapshot: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  );
  return database;
}

const auth = { userId: USER, organizationId: ORG, modules: { contabil: 2 } };

describe("contabil services tenant and catalog seams", () => {
  it("recusa marcador bancário de cliente fora do tenant", async () => {
    const database = prisma();
    database.client.findFirst.mockResolvedValue(null);
    database.triageBankStatement.findFirst.mockResolvedValue(null);
    const service = createDocumentsService(database as never, audit());

    await expect(
      service.upsertStatement(
        { client_id: CLIENT, competence: "2026-09", bank_id: "bank-1", status: "PENDING" },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(database.triageBankStatement.upsert).not.toHaveBeenCalled();
  });

  it("recusa justificativa fora do catálogo da competência", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue({
      id: MONTHLY,
      client_id: CLIENT,
      checklist: {},
      item_notes: {},
    });
    database.triageCompetence.findFirst.mockResolvedValue(null);
    database.triageCatalogItem.findMany.mockResolvedValue([]);
    const service = createDocumentsService(database as never, audit());

    await expect(
      service.updateItem(
        MONTHLY,
        {
          type: "CONTABIL",
          field: "financial_transactions",
          status: "PENDING",
          justification: "missing",
        },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(database.triageMonthly.update).not.toHaveBeenCalled();
  });
});
