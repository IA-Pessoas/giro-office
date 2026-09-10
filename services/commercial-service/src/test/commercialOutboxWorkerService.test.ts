import { describe, expect, it, vi } from "vitest";

import { CommercialOutboxWorkerService } from "../services/commercialOutboxWorkerService.js";

function event(id: string, status: string, createdAt: string) {
  return {
    id,
    status: "pending",
    attempts: 0,
    created_at: new Date(createdAt),
    payload: {
      event_id: id,
      event_type: "commercial.prospecting.transition",
      event_version: 1,
      organization_id: "a0000000-0000-4000-8000-000000000001",
      client_id: "b0000000-0000-4000-8000-000000000001",
      prospecting_id: "c0000000-0000-4000-8000-000000000001",
      from_status: null,
      to_status: status,
      status_date: null,
      description: null,
      audit_correlation_id: id,
      occurred_at: createdAt,
    },
  };
}

describe("CommercialOutboxWorkerService", () => {
  it("entrega eventos em ordem e marca cada evento como entregue", async () => {
    const events = [
      event("10000000-0000-4000-8000-000000000001", "Fechado", "2026-09-10T00:00:00.000Z"),
      event("10000000-0000-4000-8000-000000000002", "Paralisado", "2026-09-10T00:00:01.000Z"),
    ];
    const repository = {
      commercialOutboxEvent: {
        findFirst: vi.fn(async () => events.find((item) => item.status === "pending") ?? null),
        updateMany: vi.fn(async ({ where, data }) => {
          const current = events.find((item) => item.id === where.id);
          if (!current) return { count: 0 };
          if (data.status === "processing") current.status = "processing";
          if (data.status === "delivered") current.status = "delivered";
          return { count: 1 };
        }),
        findMany: vi.fn(async () => []),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(repository),
      ),
    } as never;
    const delivered: string[] = [];
    const worker = new CommercialOutboxWorkerService(repository, {
      deliver: vi.fn(async (payload) => delivered.push(payload.event_id)),
    });

    await worker.processNext();
    await worker.processNext();

    expect(delivered).toEqual([events[0].id, events[1].id]);
    expect(events.map((item) => item.status)).toEqual(["delivered", "delivered"]);
  });

  it("reagenda falha temporária e entrega sem duplicar o evento", async () => {
    const item = event(
      "10000000-0000-4000-8000-000000000003",
      "Fechado",
      "2026-09-10T00:00:00.000Z",
    );
    let now = new Date("2026-09-10T00:00:00.000Z");
    const repository = {
      commercialOutboxEvent: {
        findFirst: vi.fn(async () => (item.status === "pending" ? item : null)),
        updateMany: vi.fn(async ({ data }) => {
          if (data.status) item.status = data.status;
          if (data.attempts) item.attempts += 1;
          return { count: 1 };
        }),
        findMany: vi.fn(async () => []),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(repository),
      ),
    } as never;
    const delivery = vi
      .fn()
      .mockRejectedValueOnce(new Error("client-service indisponível"))
      .mockResolvedValueOnce(undefined);
    const worker = new CommercialOutboxWorkerService(
      repository,
      {
        deliver: delivery,
      },
      { retryBaseMs: 100, now: () => now },
    );

    await worker.processNext();
    expect(item.status).toBe("pending");
    now = new Date("2026-09-10T00:00:01.000Z");
    await worker.processNext();

    expect(delivery).toHaveBeenCalledTimes(2);
    expect(item.status).toBe("delivered");
    expect(item.attempts).toBe(2);
  });

  it("encaminha eventos de cobrança de tarefa para a projeção correta", async () => {
    const item = {
      id: "10000000-0000-4000-8000-000000000004",
      status: "pending",
      attempts: 0,
      created_at: new Date("2026-09-10T00:00:00.000Z"),
      payload: {
        event_id: "10000000-0000-4000-8000-000000000004",
        event_type: "commercial.task_billing.updated",
        event_version: 1,
        organization_id: "a0000000-0000-4000-8000-000000000001",
        task_id: "b0000000-0000-4000-8000-000000000001",
        hiring_status: "Contratado",
        payment: "Pago",
        billing_description: null,
        audit_correlation_id: "audit-4",
        occurred_at: "2026-09-10T00:00:00.000Z",
      },
    };
    const repository = {
      commercialOutboxEvent: {
        findFirst: vi.fn(async () => (item.status === "pending" ? item : null)),
        updateMany: vi.fn(async ({ data }) => {
          if (data.status) item.status = data.status;
          return { count: 1 };
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(repository),
      ),
    } as never;
    const delivery = { deliver: vi.fn().mockResolvedValue(undefined) };
    const worker = new CommercialOutboxWorkerService(repository, delivery);

    await worker.processNext();

    expect(delivery.deliver).toHaveBeenCalledWith(item.payload);
    expect(item.status).toBe("delivered");
  });
});
