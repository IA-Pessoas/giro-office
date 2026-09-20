import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { CommercialEmailNotificationService } from "../services/commercialEmailNotificationService.js";

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

const client = {
  id: EVENT.client_id,
  name: "Cliente",
  company_name: "Empresa & Filhos",
  fantasy_name: null,
  service_unique: false,
  type_registration: "Novo",
};

describe("CommercialEmailNotificationService", () => {
  it("envia apenas para fechamento elegível e preserva competência no conteúdo", async () => {
    const prisma = {
      emails: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ email: "destino@example.test", responsible: "Destino" }]),
      },
      commercialEmailNotification: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "notification-1",
          event_id: EVENT.event_id,
          status: "processing",
          attempts: 1,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    const adapter = { send: vi.fn().mockResolvedValue(undefined) };

    await new CommercialEmailNotificationService(prisma as never, adapter, {
      createLog: vi.fn().mockResolvedValue(undefined),
    }).notify(EVENT, client, "2026-10");

    expect(adapter.send).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: EVENT.event_id,
        subject: "CLIENTE NOVO - Empresa & Filhos",
        html: expect.stringContaining("2026-10"),
      }),
    );
    expect(prisma.commercialEmailNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "sent" }) }),
    );
  });

  it.each([
    [{ service_unique: true, type_registration: "Novo" }],
    [{ service_unique: false, type_registration: "Existente" }],
  ])("não envia quando o cliente não é elegível", async (flags) => {
    const prisma = {
      emails: { findMany: vi.fn() },
      commercialEmailNotification: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(),
    };
    const adapter = { send: vi.fn() };

    await new CommercialEmailNotificationService(prisma as never, adapter, {
      createLog: vi.fn().mockResolvedValue(undefined),
    }).notify(EVENT, { ...client, ...flags }, "2026-10");

    expect(adapter.send).not.toHaveBeenCalled();
    expect(prisma.emails.findMany).not.toHaveBeenCalled();
  });

  it("não reenvia uma notificação já marcada como enviada", async () => {
    const prisma = {
      emails: { findMany: vi.fn() },
      commercialEmailNotification: {
        findUnique: vi.fn().mockResolvedValue({ status: "sent" }),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };
    const adapter = { send: vi.fn() };

    await new CommercialEmailNotificationService(prisma as never, adapter, {
      createLog: vi.fn().mockResolvedValue(undefined),
    }).notify(EVENT, client, "2026-10");

    expect(adapter.send).not.toHaveBeenCalled();
    expect(prisma.commercialEmailNotification.create).not.toHaveBeenCalled();
  });

  it("não reclama uma notificação que ainda está sendo processada", async () => {
    const prisma = {
      emails: { findMany: vi.fn() },
      commercialEmailNotification: {
        findUnique: vi.fn().mockResolvedValue({
          id: "notification-1",
          status: "processing",
          attempts: 1,
          locked_at: new Date(),
        }),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };
    const adapter = { send: vi.fn() };

    await new CommercialEmailNotificationService(prisma as never, adapter, {
      createLog: vi.fn().mockResolvedValue(undefined),
    }).notify(EVENT, client, "2026-10");

    expect(adapter.send).not.toHaveBeenCalled();
    expect(prisma.commercialEmailNotification.updateMany).not.toHaveBeenCalled();
  });

  it("registra falha do adaptador para permitir reprocessamento", async () => {
    const prisma = {
      emails: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ email: "destino@example.test", responsible: "Destino" }]),
      },
      commercialEmailNotification: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "notification-1",
          event_id: EVENT.event_id,
          status: "processing",
          attempts: 1,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };
    const adapter = { send: vi.fn().mockRejectedValue(new Error("mailer indisponível")) };

    await expect(
      new CommercialEmailNotificationService(prisma as never, adapter, {
        createLog: vi.fn().mockResolvedValue(undefined),
      }).notify(EVENT, client, "2026-10"),
    ).rejects.toThrow("mailer indisponível");
    expect(prisma.commercialEmailNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }),
    );
  });
});
