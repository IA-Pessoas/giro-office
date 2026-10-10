import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import {
  listObligationHistory,
  OBLIGATION_AUDIT_REFERRING,
  obligationFieldChange,
} from "../services/obligationHistoryService.js";
import { clientId, organizationId, recordId, userId } from "./pessoalCoreTestUtils.js";

function prismaMock(obligation: { id: string; client_id: string; competence: string } | null) {
  return {
    obrigationsPessoal: { findFirst: vi.fn(async () => obligation) },
    auditRequest: {
      findMany: vi.fn(async () => [
        {
          id: "audit-1",
          user_id: userId,
          created_at: new Date("2026-09-10T12:00:00.000Z"),
          action: "Atualizacao",
          changes_json: { va: { from: false, to: true } },
        },
      ]),
      count: vi.fn(async () => 1),
    },
    user: { findMany: vi.fn(async () => [{ id: userId, name: "Ana" }]) },
  };
}

describe("historico por item de obrigacao", () => {
  it("grava valor anterior e novo de cada campo alterado", () => {
    expect(obligationFieldChange({ va: false, vt: null }, { va: true })).toEqual({
      va: { from: false, to: true },
    });
    expect(obligationFieldChange({ va: true }, { responsavel_id: userId })).toEqual({
      responsavel_id: { from: null, to: userId },
    });
  });

  it("le a auditoria da obrigacao dentro da organizacao", async () => {
    const prisma = prismaMock({ id: recordId, client_id: clientId, competence: "2026-09" });

    const result = await listObligationHistory(prisma, organizationId, recordId, {
      page: 1,
      pageSize: 20,
    });

    expect(prisma.obrigationsPessoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: recordId, organization_id: organizationId } }),
    );
    expect(prisma.auditRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: organizationId,
          referring: OBLIGATION_AUDIT_REFERRING,
          referring_id: recordId,
        }),
      }),
    );
    expect(result).toMatchObject({
      obligation_id: recordId,
      competence: "2026-09",
      total: 1,
      items: [
        {
          at: "2026-09-10T12:00:00.000Z",
          actor: { id: userId, name: "Ana" },
          changes: [{ field: "va", from: false, to: true }],
        },
      ],
    });
  });

  it("nao revela historico de obrigacao de outra organizacao", async () => {
    const prisma = prismaMock(null);

    await expect(
      listObligationHistory(prisma, organizationId, recordId, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.auditRequest.findMany).not.toHaveBeenCalled();
  });
});
