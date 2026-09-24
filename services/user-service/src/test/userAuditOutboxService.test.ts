import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserAuditOutboxStatus } from "../generated/prisma/enums.js";

const { prismaMock, loggerMock } = vi.hoisted(() => ({
  prismaMock: {
    userAuditOutboxEvent: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
      callback(prismaMock),
    ),
  },
  loggerMock: { error: vi.fn(), warn: vi.fn() },
}));

import {
  type UserAuditOutboxPrisma,
  UserAuditOutboxService,
} from "../services/userAuditOutboxService.js";

describe("UserAuditOutboxService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userAuditOutboxEvent.updateMany.mockResolvedValue({ count: 1 });
  });

  it("entrega o evento persistido usando o requestId idempotente", async () => {
    const payload = {
      requestId: "stable-request-id",
      organizationId: "org-1",
      action: "platform.impersonation.ended",
      referring: "user",
      referringId: "user-1",
      changes: { reason: "revogação" },
      outcome: "success",
      required: true,
    };
    prismaMock.userAuditOutboxEvent.findFirst.mockResolvedValue({
      id: "outbox-1",
      payload,
      attempts: 0,
    });
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = new UserAuditOutboxService(
      prismaMock as unknown as UserAuditOutboxPrisma,
      audit,
      loggerMock as never,
      () => new Date("2026-09-24T12:00:00.000Z"),
    );

    await expect(service.processNext()).resolves.toBe(true);

    expect(audit).toHaveBeenCalledWith(payload);
    expect(prismaMock.userAuditOutboxEvent.updateMany).toHaveBeenLastCalledWith({
      where: { id: "outbox-1", status: UserAuditOutboxStatus.processing },
      data: {
        status: UserAuditOutboxStatus.delivered,
        processed_at: new Date("2026-09-24T12:00:00.000Z"),
        locked_at: null,
        last_error: null,
      },
    });
  });

  it("reagenda a entrega quando o audit-service falha", async () => {
    prismaMock.userAuditOutboxEvent.findFirst.mockResolvedValue({
      id: "outbox-2",
      payload: {
        requestId: "stable-request-id",
        action: "platform.impersonation.ended",
        referring: "user",
        referringId: "user-1",
        changes: { reason: "expiração" },
        outcome: "success",
        required: true,
      },
      attempts: 0,
    });
    const audit = vi.fn().mockRejectedValue(new Error("audit indisponível"));
    const now = new Date("2026-09-24T12:00:00.000Z");
    const service = new UserAuditOutboxService(
      prismaMock as unknown as UserAuditOutboxPrisma,
      audit,
      loggerMock as never,
      () => now,
    );

    await expect(service.processNext()).resolves.toBe(true);

    expect(prismaMock.userAuditOutboxEvent.updateMany).toHaveBeenLastCalledWith({
      where: { id: "outbox-2", status: UserAuditOutboxStatus.processing },
      data: {
        status: UserAuditOutboxStatus.pending,
        available_at: new Date(now.getTime() + 1_000),
        locked_at: null,
        last_error: "audit indisponível",
      },
    });
    expect(loggerMock.warn).toHaveBeenCalledOnce();
  });
});
