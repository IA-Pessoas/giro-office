import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import { SituationService } from "../services/situationService.js";
import {
  clientId,
  createAuditMock,
  organizationId,
  recordId,
  userId,
} from "./pessoalCoreTestUtils.js";

function createPrismaMock() {
  return {
    client: { findFirst: vi.fn(async () => ({ id: clientId })) },
    situationsPessoal: {
      create: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
      findFirst: vi.fn(async () => ({ id: recordId, organization_id: organizationId })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
    },
  };
}

describe("SituationService", () => {
  it("cria situacao com status Em andamento", async () => {
    const prisma = createPrismaMock();
    const service = new SituationService(prisma as never, createAuditMock());

    await service.create(
      { organizationId, userId },
      { client_id: clientId, title: "Folha", description: "Conferir pendencias" },
    );

    expect(prisma.situationsPessoal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "Em andamento",
          registered_by_id: userId,
          organization_id: organizationId,
        }),
      }),
    );
  });

  it("finaliza situacao com usuario e data de conclusao", async () => {
    const prisma = createPrismaMock();
    const now = new Date("2026-06-30T12:00:00.000Z");
    const service = new SituationService(prisma as never, createAuditMock(), () => now);

    await service.update({ organizationId, userId }, recordId, { status: "Finalizado" });

    expect(prisma.situationsPessoal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "Finalizado",
          completed_by_id: userId,
          completion_date: now,
        }),
      }),
    );
  });

  it("busca detalhe escopado por organizacao", async () => {
    const prisma = createPrismaMock();
    const service = new SituationService(prisma as never, createAuditMock());

    await service.detail({ organizationId }, recordId);

    expect(prisma.situationsPessoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: recordId, organization_id: organizationId } }),
    );
  });
});
