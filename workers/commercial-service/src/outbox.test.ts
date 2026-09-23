import { describe, expect, it, vi } from "vitest";
import { CommercialOutboxWorkerService } from "./outbox.js";

const event = {
  id: "10000000-0000-4000-8000-000000000001",
  status: "pending",
  attempts: 0,
  created_at: new Date("2026-09-22T00:00:00.000Z"),
  payload: {
    event_id: "10000000-0000-4000-8000-000000000001",
    event_type: "commercial.task_billing.updated",
    event_version: 1,
    organization_id: "a0000000-0000-4000-8000-000000000001",
    task_id: "b0000000-0000-4000-8000-000000000001",
    hiring_status: "Contratado",
    payment: null,
    billing_description: null,
    audit_correlation_id: "audit-1",
    occurred_at: "2026-09-22T00:00:00.000Z",
  },
};

describe("commercial outbox Worker", () => {
  it("reclama com lease, reprocessa falha e evita duplicação após sucesso", async () => {
    let current = { ...event };
    const prisma = {
      commercialOutboxEvent: {
        findFirst: vi.fn(async () => (current.status === "pending" ? current : null)),
        updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          current = { ...current, ...data, attempts: Number(data.attempts ?? current.attempts) };
          return { count: 1 };
        }),
      },
      $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
    };
    const delivery = { deliver: vi.fn().mockRejectedValueOnce(new Error("temporário")) };
    const worker = new CommercialOutboxWorkerService(prisma as never, delivery, {
      retryBaseMs: 100,
      now: () => new Date("2026-09-22T00:00:00.000Z"),
    });

    await worker.processNext();

    expect(current.status).toBe("pending");
    expect(current.last_error).toBe("temporário");
    delivery.deliver.mockResolvedValueOnce(undefined);
    current.available_at = new Date("2026-09-22T00:00:00.000Z");
    await worker.processNext();

    expect(current.status).toBe("delivered");
    expect(delivery.deliver).toHaveBeenCalledTimes(2);
  });
});
