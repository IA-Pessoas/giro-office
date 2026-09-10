import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    task: { findFirst: vi.fn() },
    commercialTaskBilling: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    commercialOutboxEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  auditMock: { createLog: vi.fn(), logUpdateIfChanged: vi.fn() },
}));

vi.mock("../integrations/prisma.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { CommercialTaskBillingService } from "../services/taskBillingService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const TASK_ID = "b0000000-0000-4000-8000-000000000001";

describe("CommercialTaskBillingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prismaMock),
    );
    prismaMock.task.findFirst.mockResolvedValue({
      id: TASK_ID,
      organization_id: ORG_ID,
      name: "Tarefa comercial",
      status: "A Realizar",
      billing: "Realizar",
    });
    prismaMock.commercialTaskBilling.findUnique.mockResolvedValue(null);
    prismaMock.commercialTaskBilling.upsert.mockResolvedValue({
      id: "c0000000-0000-4000-8000-000000000001",
      task_id: TASK_ID,
      hiring_status: "Contratado",
      payment: "Pago",
      billing_description: "Contrato confirmado",
      task: {
        id: TASK_ID,
        name: "Tarefa comercial",
        status: "A Realizar",
        billing: "Realizar",
      },
    });
  });

  it("persiste a decisão comercial e o evento outbox na mesma transação", async () => {
    const service = new CommercialTaskBillingService(prismaMock as never, auditMock);

    await service.update({
      user_id: "user-1",
      organization_id: ORG_ID,
      task_id: TASK_ID,
      hiring_status: "Contratado",
      payment: "Pago",
      billing_description: "Contrato confirmado",
    });

    expect(prismaMock.commercialTaskBilling.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { task_id: TASK_ID },
        create: expect.objectContaining({ organization_id: ORG_ID, task_id: TASK_ID }),
        update: expect.objectContaining({ hiring_status: "Contratado" }),
      }),
    );
    expect(prismaMock.commercialOutboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: ORG_ID,
          aggregate_id: TASK_ID,
          event_type: "commercial.task_billing.updated",
          payload: expect.objectContaining({
            task_id: TASK_ID,
            hiring_status: "Contratado",
            payment: "Pago",
          }),
        }),
      }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("não permite operar uma tarefa de outro tenant", async () => {
    prismaMock.task.findFirst.mockResolvedValue(null);
    const service = new CommercialTaskBillingService(prismaMock as never, auditMock);

    await expect(
      service.update({
        user_id: "user-1",
        organization_id: ORG_ID,
        task_id: TASK_ID,
        hiring_status: "A Realizar",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.commercialTaskBilling.upsert).not.toHaveBeenCalled();
    expect(prismaMock.commercialOutboxEvent.create).not.toHaveBeenCalled();
  });
});
