import { describe, expect, it, vi } from "vitest";

import {
  listRelationshipHistory,
  type RelationshipHistoryPrisma,
} from "../services/relationshipHistoryService.js";

const ORG = "a0000000-0000-4000-8000-000000000001";
const CLIENT = "b0000000-0000-4000-8000-000000000001";
const RELATIONSHIP = "e0000000-0000-4000-8000-000000000001";
const USER = "c0000000-0000-4000-8000-000000000001";

function prisma(rows: Record<string, unknown>[]) {
  return {
    relationshipContabil: { findFirst: vi.fn().mockResolvedValue({ id: RELATIONSHIP }) },
    auditRequest: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
    },
    user: { findMany: vi.fn().mockResolvedValue([{ id: USER, name: "Ana" }]) },
  } satisfies RelationshipHistoryPrisma;
}

const input = { organizationId: ORG, clientId: CLIENT, page: 1, pageSize: 20 };

describe("listRelationshipHistory (#1723)", () => {
  it("lê só eventos de atualização do relacionamento da organização", async () => {
    const db = prisma([]);

    await listRelationshipHistory(db, input);

    expect(db.relationshipContabil.findFirst).toHaveBeenCalledWith({
      where: { organization_id: ORG, client_id: CLIENT },
      select: { id: true },
    });
    expect(db.auditRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORG,
          referring: "contabil.relationship",
          referring_id: RELATIONSHIP,
          action: { in: ["Cadastro", "Atualização"] },
          NOT: { changes_json: { equals: {} } },
        },
        skip: 0,
        take: 20,
      }),
    );
  });

  it("devolve campos antigos e novos estados com valor anterior e novo", async () => {
    const at = new Date("2026-10-01T10:00:00.000Z");
    const db = prisma([
      {
        id: "audit-1",
        user_id: USER,
        created_at: at,
        action: "Atualização",
        changes_json: {
          bidding: { from: true, to: null },
          chart_accounts: { from: "Plano próprio", to: "Sim — Jonrick" },
          client_id: { from: "x", to: "y" },
          tool: { to: null },
        },
      },
    ]);

    const result = await listRelationshipHistory(db, input);

    expect(result).toEqual({
      client_id: CLIENT,
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: "audit-1",
          at: at.toISOString(),
          actor: { id: USER, name: "Ana" },
          action: "Atualização",
          changes: [
            { field: "bidding", from: true, to: null },
            { field: "chart_accounts", from: "Plano próprio", to: "Sim — Jonrick" },
          ],
        },
      ],
    });
  });

  it("sem relacionamento na organização devolve vazio sem ler a auditoria", async () => {
    const db = prisma([]);
    db.relationshipContabil.findFirst.mockResolvedValue(null);

    await expect(listRelationshipHistory(db, input)).resolves.toMatchObject({
      total: 0,
      items: [],
    });
    expect(db.auditRequest.findMany).not.toHaveBeenCalled();
  });
});
