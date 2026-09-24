import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { CommercialProspectingCloseService } from "../services/commercialProspectingCloseService.js";

const EVENT = {
  event_id: "10000000-0000-4000-8000-000000000001",
  event_type: "commercial.prospecting.transition" as const,
  event_version: 1 as const,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  client_id: "b0000000-0000-4000-8000-000000000001",
  prospecting_id: "c0000000-0000-4000-8000-000000000001",
  from_status: "Envio de Proposta" as const,
  to_status: "Fechado" as const,
  status_date: "2026-09-10T12:00:00.000Z",
  description: null,
  audit_correlation_id: "audit-1",
  occurred_at: "2026-09-10T12:00:00.000Z",
};

describe("CommercialProspectingCloseService", () => {
  it("reabre tarefas comerciais e devolve a competência da tarefa contratual", async () => {
    const prisma = {
      project: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      task: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "task-1",
            name: "Definição de Competência",
            status: "Em andamento",
            billing: "Realizar",
            observations: "2026-10",
          },
          {
            id: "task-2",
            name: "Entrega mensal",
            status: "Em andamento",
            billing: "Não realizar",
            observations: null,
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      commercialProspectingCloseEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => ({
          ...(data as object),
          organization_id: EVENT.organization_id,
        })),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };

    const service = new CommercialProspectingCloseService(prisma as never);

    await expect(service.apply(EVENT)).resolves.toEqual({
      event_id: EVENT.event_id,
      client_id: EVENT.client_id,
      competence: "2026-10",
    });

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["task-1", "task-2"] },
        organization_id: EVENT.organization_id,
        billing: "Realizar",
        OR: [{ hiring_status: null }, { hiring_status: { not: "Contratado" } }],
      },
      data: { status: "Em Espera" },
    });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["task-1", "task-2"] },
        organization_id: EVENT.organization_id,
        billing: { not: "Realizar" },
      },
      data: { status: "Em andamento" },
    });
    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: {
        client_id: EVENT.client_id,
        organization_id: EVENT.organization_id,
        status: "Aguardando liberação do Comercial",
      },
      data: { status: "Em andamento" },
    });
  });

  it("não reaplica tarefas quando o evento já foi processado", async () => {
    const prisma = {
      project: { updateMany: vi.fn() },
      task: { findMany: vi.fn(), updateMany: vi.fn() },
      commercialProspectingCloseEvent: {
        findUnique: vi.fn().mockResolvedValue({
          event_id: EVENT.event_id,
          organization_id: EVENT.organization_id,
          client_id: EVENT.client_id,
          competence: "2026-10",
        }),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };

    await expect(
      new CommercialProspectingCloseService(prisma as never).apply(EVENT),
    ).resolves.toEqual({
      event_id: EVENT.event_id,
      client_id: EVENT.client_id,
      competence: "2026-10",
    });

    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.project.updateMany).not.toHaveBeenCalled();
    expect(prisma.commercialProspectingCloseEvent.create).not.toHaveBeenCalled();
  });
});
