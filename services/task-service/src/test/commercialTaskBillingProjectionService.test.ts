import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { CommercialTaskBillingProjectionService } from "../services/commercialTaskBillingProjectionService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const TASK_ID = "b0000000-0000-4000-8000-000000000001";

function event(hiring_status: "A Realizar" | "Contratado" | "Não Contratado") {
  return {
    event_id: "c0000000-0000-4000-8000-000000000001",
    event_type: "commercial.task_billing.updated" as const,
    event_version: 1 as const,
    organization_id: ORG_ID,
    task_id: TASK_ID,
    hiring_status,
    payment: "Pago",
    billing_description: "Cobrança confirmada",
    audit_correlation_id: "audit-1",
    occurred_at: "2026-09-10T12:00:00.000Z",
  };
}

function createPrismaMock() {
  const prisma = {
    task: { findFirst: vi.fn(), updateMany: vi.fn() },
    commercialTaskBillingProjectionEvent: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(prisma),
  );
  prisma.task.findFirst.mockResolvedValue({ id: TASK_ID, status: "A Realizar" });
  prisma.task.updateMany.mockResolvedValue({ count: 1 });
  prisma.commercialTaskBillingProjectionEvent.findUnique.mockResolvedValue(null);
  return prisma;
}

describe("CommercialTaskBillingProjectionService", () => {
  it.each([
    ["A Realizar", "A Realizar", true, false],
    ["Contratado", "Em Andamento", false, true],
    ["Não Contratado", "Não Contratado", false, false],
  ] as const)("aplica o estado %s aos efeitos legados", async (hiringStatus, status, chargeComercial, chargeFinanceiro) => {
    const prisma = createPrismaMock();
    const service = new CommercialTaskBillingProjectionService(prisma as never);

    await service.apply(event(hiringStatus));

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: TASK_ID, organization_id: ORG_ID },
      data: {
        status,
        charge_comercial: chargeComercial,
        charge_financeiro: chargeFinanceiro,
        hiring_status: hiringStatus,
        payment: "Pago",
        billing_description: "Cobrança confirmada",
      },
    });
  });

  it("ignora a repetição do mesmo evento sem repetir os efeitos", async () => {
    const prisma = createPrismaMock();
    prisma.commercialTaskBillingProjectionEvent.findUnique.mockResolvedValue({
      organization_id: ORG_ID,
      task_id: TASK_ID,
    });
    const service = new CommercialTaskBillingProjectionService(prisma as never);

    const result = await service.apply(event("Contratado"));

    expect(result).toMatchObject({ duplicate: true, applied: false });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it("rejeita evento repetido associado a outro tenant", async () => {
    const prisma = createPrismaMock();
    prisma.commercialTaskBillingProjectionEvent.findUnique.mockResolvedValue({
      organization_id: "d0000000-0000-4000-8000-000000000001",
      task_id: TASK_ID,
    });
    const service = new CommercialTaskBillingProjectionService(prisma as never);

    await expect(service.apply(event("Contratado"))).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });
});
