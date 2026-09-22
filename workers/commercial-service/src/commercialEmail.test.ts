import { expect, it, vi } from "vitest";
import {
  CommercialEmailHttpAdapter,
  CommercialEmailNotificationService,
  createCommercialEmailAdapter,
  MissingCommercialEmailAdapter,
} from "./commercialEmail.js";

const EVENT = {
  event_id: "10000000-0000-4000-8000-000000000020",
  event_type: "commercial.prospecting.transition" as const,
  event_version: 1 as const,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  client_id: "b0000000-0000-4000-8000-000000000001",
  prospecting_id: "c0000000-0000-4000-8000-000000000001",
  from_status: "Envio de Proposta" as const,
  to_status: "Fechado" as const,
  status_date: "2026-09-22T00:00:00.000Z",
  description: null,
  audit_correlation_id: "request-email-1",
  occurred_at: "2026-09-22T00:00:00.000Z",
};
const CLIENT = {
  id: EVENT.client_id,
  name: "Cliente",
  company_name: "Cliente SA",
  fantasy_name: null,
  service_unique: false,
  type_registration: "Novo",
};

function prisma() {
  const row = { id: "notification-1", status: "processing", attempts: 1, locked_at: new Date() };
  return {
    emails: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ email: "commercial@example.test", responsible: "Equipe" }]),
    },
    commercialEmailNotification: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (tx: ReturnType<typeof prisma>) => unknown) =>
      callback(prismaInstance),
    ),
  };
}

const prismaInstance = prisma();

it("persiste falha observável quando o adapter de email não existe", async () => {
  await expect(
    new CommercialEmailNotificationService(
      prismaInstance as never,
      new MissingCommercialEmailAdapter(),
    ).notify(EVENT, CLIENT, "2026-09"),
  ).rejects.toThrow("COMMERCIAL_EMAIL_ADAPTER_URL");

  expect(prismaInstance.commercialEmailNotification.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: "failed",
        last_error: expect.stringContaining("ADAPTER"),
      }),
    }),
  );
});

it("envia pelo adapter configurado com idempotência do evento", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
  const adapter = new CommercialEmailHttpAdapter(
    "https://email.example.test/send",
    "email-token",
    "from@example.test",
    fetchImpl,
  );
  await new CommercialEmailNotificationService(prismaInstance as never, adapter).notify(
    EVENT,
    CLIENT,
    "2026-09",
  );

  expect(fetchImpl).toHaveBeenCalledWith(
    "https://email.example.test/send",
    expect.objectContaining({
      headers: expect.objectContaining({
        "idempotency-key": EVENT.event_id,
        "x-internal-service-token": "email-token",
      }),
    }),
  );
});

it("faz claim com fencing atômico e envia apenas uma vez em concorrência", async () => {
  const initial = {
    id: "notification-concurrent",
    status: "failed",
    attempts: 3,
    locked_at: new Date("2026-09-22T00:00:00.000Z"),
  };
  const state = { ...initial };
  let findCalls = 0;
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (data.status === "processing") {
        if (where.attempts !== initial.attempts || state.status !== "failed") return { count: 0 };
        state.status = "processing";
        state.attempts += Number((data.attempts as { increment: number }).increment);
        state.locked_at = data.locked_at as Date;
        return { count: 1 };
      }
      if (
        where.status === "processing" &&
        where.attempts === state.attempts &&
        state.status === "processing"
      ) {
        state.status = data.status as string;
        state.locked_at = null;
        return { count: 1 };
      }
      return { count: 0 };
    },
  );
  const sends = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    emails: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ email: "commercial@example.test", responsible: "Equipe" }]),
    },
    commercialEmailNotification: {
      findUnique: vi.fn(async () => {
        findCalls += 1;
        return findCalls <= 2 ? { ...initial } : { ...state };
      }),
      updateMany,
      create: vi.fn(),
    },
  };
  const service = new CommercialEmailNotificationService(prisma as never, { send: sends });

  await Promise.all([
    service.notify(EVENT, CLIENT, "2026-09"),
    service.notify(EVENT, CLIENT, "2026-09"),
  ]);

  expect(sends).toHaveBeenCalledOnce();
  expect(updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id: initial.id, attempts: initial.attempts }),
    }),
  );
});

it("aceita HTTP somente fora de produção e exige HTTPS em produção", () => {
  const base = {
    COMMERCIAL_EMAIL_ADAPTER_TOKEN: "email-token",
    COMMERCIAL_EMAIL_FROM: "from@example.test",
  };

  expect(() =>
    createCommercialEmailAdapter({
      ...base,
      NODE_ENV: "production",
      COMMERCIAL_EMAIL_ADAPTER_URL: "http://email.example.test/send",
    } as never),
  ).toThrow("HTTPS");

  expect(
    createCommercialEmailAdapter({
      ...base,
      NODE_ENV: "test",
      COMMERCIAL_EMAIL_ADAPTER_URL: "http://email.example.test/send",
    } as never),
  ).toBeInstanceOf(CommercialEmailHttpAdapter);
});
