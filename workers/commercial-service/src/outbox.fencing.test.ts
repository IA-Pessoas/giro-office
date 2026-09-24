import { expect, it, vi } from "vitest";
import { CommercialOutboxWorkerService } from "./outbox.js";

const EVENT_ID = "10000000-0000-4000-8000-000000000010";

it("não permite que uma conclusão estale sobrescreva o lease mais novo", async () => {
  const state = {
    id: EVENT_ID,
    payload: {
      event_id: EVENT_ID,
      event_type: "commercial.task_billing.updated" as const,
      event_version: 1 as const,
      organization_id: "a0000000-0000-4000-8000-000000000001",
      task_id: "b0000000-0000-4000-8000-000000000001",
      hiring_status: "Contratado" as const,
      payment: null,
      billing_description: null,
      audit_correlation_id: "request-fence-1",
      occurred_at: "2026-09-22T00:00:00.000Z",
    },
    status: "pending",
    attempts: 0,
    available_at: new Date("2026-09-22T00:00:00.000Z"),
    locked_at: null as Date | null,
    created_at: new Date("2026-09-22T00:00:00.000Z"),
  };
  const matches = (where: Record<string, unknown>): boolean => {
    if (where.id && where.id !== state.id) return false;
    if (where.status && where.status !== state.status) return false;
    if (where.attempts && where.attempts !== state.attempts) return false;
    const lockedAt = where.locked_at as { lt?: Date } | undefined;
    if (lockedAt?.lt && (!state.locked_at || state.locked_at >= lockedAt.lt)) return false;
    return true;
  };
  const update = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!matches(where)) return { count: 0 };
      if (data.attempts && typeof data.attempts === "object" && "increment" in data.attempts) {
        state.attempts += Number(data.attempts.increment);
        const nextData = { ...data };
        delete nextData.attempts;
        Object.assign(state, nextData);
        return { count: 1 };
      }
      Object.assign(state, data);
      return { count: 1 };
    },
  );
  const prisma = {
    commercialOutboxEvent: {
      findFirst: vi.fn(async () =>
        state.status === "pending" && state.available_at <= new Date("2026-09-22T00:02:01.000Z")
          ? { ...state }
          : null,
      ),
      updateMany: update,
    },
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
  };
  let releaseStale!: () => void;
  const staleDelivery = new Promise<void>((resolve) => {
    releaseStale = resolve;
  });
  const staleWorker = new CommercialOutboxWorkerService(
    prisma as never,
    { deliver: vi.fn(async () => staleDelivery) },
    { now: () => new Date("2026-09-22T00:00:00.000Z"), leaseMs: 120_000 },
  );
  const freshWorker = new CommercialOutboxWorkerService(
    prisma as never,
    { deliver: vi.fn().mockResolvedValue(undefined) },
    { now: () => new Date("2026-09-22T00:02:01.000Z"), leaseMs: 120_000 },
  );

  const staleRun = staleWorker.processNext();
  await vi.waitFor(() => expect(state.status).toBe("processing"));
  await freshWorker.processNext();
  expect(state.status).toBe("delivered");
  expect(state.attempts).toBe(2);

  releaseStale();
  await staleRun;

  expect(state.status).toBe("delivered");
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ attempts: 1 }) }),
  );
});
