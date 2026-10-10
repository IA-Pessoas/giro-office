import { describe, expect, it, vi } from "vitest";

import {
  type ControlHistoryPrisma,
  listControlHistory,
} from "../services/controlHistoryService.js";

const ORG = "a0000000-0000-4000-8000-000000000001";
const CLIENT = "b0000000-0000-4000-8000-000000000001";
const CONTROL = "e0000000-0000-4000-8000-000000000001";
const USER = "c0000000-0000-4000-8000-000000000001";

function prisma(rows: Record<string, unknown>[], total = rows.length) {
  return {
    controlContabil: { findFirst: vi.fn().mockResolvedValue({ id: CONTROL }) },
    auditRequest: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
    user: { findMany: vi.fn().mockResolvedValue([{ id: USER, name: "Ana" }]) },
  } satisfies ControlHistoryPrisma;
}

const input = {
  organizationId: ORG,
  clientId: CLIENT,
  competence: "2026-09",
  page: 2,
  pageSize: 10,
};

describe("listControlHistory (#1722)", () => {
  it("lê eventos da auditoria no escopo da organização, sem corte por data", async () => {
    const db = prisma([]);

    await listControlHistory(db, input);

    expect(db.controlContabil.findFirst).toHaveBeenCalledWith({
      where: { organization_id: ORG, client_id: CLIENT, competence: "2026-09" },
      select: { id: true },
    });
    const where = {
      organization_id: ORG,
      referring: "contabil.control",
      referring_id: CONTROL,
      action: { in: ["Atualização", "Concluir todos os itens do controle contábil"] },
      NOT: { changes_json: { equals: {} } },
    };
    expect(db.auditRequest.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: 10,
      take: 10,
      select: { id: true, user_id: true, created_at: true, action: true, changes_json: true },
    });
    expect(db.auditRequest.count).toHaveBeenCalledWith({ where });
  });

  it("achata cada evento em ator, instante, campo e valores anterior/novo", async () => {
    const at = new Date("2026-09-10T12:00:00.000Z");
    const db = prisma(
      [
        {
          id: "audit-1",
          user_id: USER,
          created_at: at,
          action: "Concluir todos os itens do controle contábil",
          changes_json: {
            monthly_closing: { from: false, to: true },
            depreciation: { from: false, to: true },
            archived_at: { from: null, to: null },
          },
        },
        {
          id: "audit-2",
          user_id: "removido",
          created_at: at,
          action: "Atualização",
          changes_json: { notes: { from: "", to: "Conferir extrato" } },
        },
      ],
      21,
    );

    const result = await listControlHistory(db, input);

    expect(db.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: [USER, "removido"] } },
      select: { id: true, name: true },
    });
    expect(result).toEqual({
      client_id: CLIENT,
      competence: "2026-09",
      page: 2,
      pageSize: 10,
      total: 21,
      items: [
        {
          id: "audit-1",
          at: at.toISOString(),
          actor: { id: USER, name: "Ana" },
          action: "Concluir todos os itens do controle contábil",
          changes: [
            { field: "monthly_closing", from: false, to: true },
            { field: "depreciation", from: false, to: true },
          ],
        },
        {
          id: "audit-2",
          at: at.toISOString(),
          actor: { id: "removido", name: null },
          action: "Atualização",
          changes: [{ field: "notes", from: "", to: "Conferir extrato" }],
        },
      ],
    });
  });

  it("devolve histórico vazio quando o controle não existe na organização", async () => {
    const db = prisma([]);
    db.controlContabil.findFirst.mockResolvedValue(null);

    const result = await listControlHistory(db, input);

    expect(result).toMatchObject({ total: 0, items: [] });
    expect(db.auditRequest.findMany).not.toHaveBeenCalled();
  });
});
