import "./envBootstrap.js";

import type { CommercialProspectingTransitionEvent } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { CommercialProspectingTransitionService } from "../services/commercialProspectingTransitionService.js";

const BASE_EVENT = {
  event_id: "10000000-0000-4000-8000-000000000001",
  event_type: "commercial.prospecting.transition" as const,
  event_version: 1 as const,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  client_id: "b0000000-0000-4000-8000-000000000001",
  prospecting_id: "c0000000-0000-4000-8000-000000000001",
  from_status: "Análise/Agendamento" as const,
  status_date: "2026-09-10T12:00:00.000Z",
  description: null,
  audit_correlation_id: "audit-1",
  occurred_at: "2026-09-10T12:00:00.000Z",
};

function event(toStatus: string): CommercialProspectingTransitionEvent {
  return { ...BASE_EVENT, to_status: toStatus } as unknown as CommercialProspectingTransitionEvent;
}

function createPrismaMock() {
  const tx = {
    commercialProspectingTransitionEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => data),
    },
    task: { updateMany: vi.fn().mockResolvedValue({ count: 4 }) },
  };
  return {
    ...tx,
    $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback(tx),
    ),
  };
}

describe("CommercialProspectingTransitionService", () => {
  it.each([
    ["Paralisado", "Paralisado", ["Concluída", "Não Contratado", "Em Espera"]],
    ["Baixada", "Paralisado", ["Concluída", "Não Contratado"]],
    ["Análise Financeira", "A Realizar", ["Concluída", "Não Contratado", "Em Espera"]],
    ["Análise/Agendamento", "A Realizar", ["Concluída", "Não Contratado", "Em Espera"]],
    ["Envio de Proposta", "A Realizar", ["Concluída", "Não Contratado", "Em Espera"]],
    ["Recusado pelo Cliente", "Não Contratado", ["Concluída", "Em Espera"]],
    ["Inativo", "Não Contratado", ["Concluída", "Em Espera"]],
  ] as const)("aplica a elegibilidade legada de %s", async (toStatus, status, excludedStatuses) => {
    const prisma = createPrismaMock();

    await expect(
      new CommercialProspectingTransitionService(prisma as never).apply(event(toStatus)),
    ).resolves.toEqual({
      event_id: BASE_EVENT.event_id,
      client_id: BASE_EVENT.client_id,
      updated_count: 4,
      duplicate: false,
    });

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: BASE_EVENT.organization_id,
        client_id: BASE_EVENT.client_id,
        status: { notIn: [...excludedStatuses] },
      },
      data: { status },
    });
  });

  it("inclui tarefas de cobrança única, pois o legado não as exclui nessas transições", async () => {
    const prisma = createPrismaMock();

    await new CommercialProspectingTransitionService(prisma as never).apply(event("Baixada"));

    expect(prisma.task.updateMany.mock.calls[0]?.[0]).not.toHaveProperty("where.billing");
  });

  it("no reset agendado reativa Em Espera e preserva apenas concluídas e não contratadas", async () => {
    const prisma = createPrismaMock();

    await new CommercialProspectingTransitionService(prisma as never).apply({
      ...event("Análise/Agendamento"),
      scheduled_reset: true,
    });

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: BASE_EVENT.organization_id,
        client_id: BASE_EVENT.client_id,
        status: { notIn: ["Concluída", "Não Contratado"] },
      },
      data: { status: "A Realizar" },
    });
  });

  it("não repete efeitos quando o mesmo evento é entregue novamente", async () => {
    const prisma = createPrismaMock();
    prisma.commercialProspectingTransitionEvent.findUnique.mockResolvedValue({
      event_id: BASE_EVENT.event_id,
      organization_id: BASE_EVENT.organization_id,
      client_id: BASE_EVENT.client_id,
      prospecting_id: BASE_EVENT.prospecting_id,
    });

    await expect(
      new CommercialProspectingTransitionService(prisma as never).apply(event("Baixada")),
    ).resolves.toMatchObject({ event_id: BASE_EVENT.event_id, duplicate: true });

    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.commercialProspectingTransitionEvent.create).not.toHaveBeenCalled();
  });

  it("aplica cada nova mudança de situação uma vez", async () => {
    const prisma = createPrismaMock();
    const service = new CommercialProspectingTransitionService(prisma as never);

    await service.apply(event("Baixada"));
    await service.apply({
      ...event("Análise/Agendamento"),
      event_id: "10000000-0000-4000-8000-000000000002",
    });

    expect(prisma.task.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        organization_id: BASE_EVENT.organization_id,
        client_id: BASE_EVENT.client_id,
        status: { notIn: ["Concluída", "Não Contratado"] },
      },
      data: { status: "Paralisado" },
    });
    expect(prisma.task.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        organization_id: BASE_EVENT.organization_id,
        client_id: BASE_EVENT.client_id,
        status: { notIn: ["Concluída", "Não Contratado", "Em Espera"] },
      },
      data: { status: "A Realizar" },
    });
  });

  it("rejeita a reutilização de event_id em outro cliente", async () => {
    const prisma = createPrismaMock();
    prisma.commercialProspectingTransitionEvent.findUnique.mockResolvedValue({
      event_id: BASE_EVENT.event_id,
      organization_id: "d0000000-0000-4000-8000-000000000001",
      client_id: BASE_EVENT.client_id,
    });

    await expect(
      new CommercialProspectingTransitionService(prisma as never).apply(event("Baixada")),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });
});
