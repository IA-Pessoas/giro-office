import { expect, it, vi } from "vitest";
import {
  CommercialEmailHttpAdapter,
  CommercialEmailNotificationService,
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
