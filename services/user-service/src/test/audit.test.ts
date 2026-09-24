import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordAuditMock, recordRequiredMock } = vi.hoisted(() => ({
  recordRequiredMock: vi.fn(),
  recordAuditMock: Object.assign(vi.fn(), { recordRequired: vi.fn() }),
}));
recordAuditMock.recordRequired = recordRequiredMock;

vi.mock("@workspace/shared/audit", () => ({
  createAuditRecorder: vi.fn(() => recordAuditMock),
}));

import { createUserAudit } from "../integrations/audit.js";

describe("createUserAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("não relaciona ator de plataforma ao usuário organizacional", async () => {
    const audit = createUserAudit({
      enabled: true,
      serviceUrl: "http://audit.test",
      serviceToken: "test-token",
      logger: {} as never,
    });

    await audit({
      platformActorUserId: "platform-user-1",
      organizationId: "org-1",
      action: "platform.user.permissions.updated",
      referring: "user",
      referringId: "user-1",
      changes: { modules: { before: { rh: 1 }, after: { rh: 2 } } },
      outcome: "success",
    });

    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { actorPlatformUserId: "platform-user-1" },
      }),
    );
    expect(recordAuditMock.mock.calls[0][0]).not.toHaveProperty("userId");
  });

  it("registra uma alteração global da plataforma sem forjar uma organização", async () => {
    const audit = createUserAudit({
      enabled: true,
      serviceUrl: "http://audit.test",
      serviceToken: "test-token",
      logger: {} as never,
    });

    await audit({
      requestId: "outbox-request-1",
      platformActorUserId: "platform-user-1",
      organizationId: null,
      action: "platform.super_admin.impersonation_permission.updated",
      referring: "platform_user",
      referringId: "platform-user-2",
      changes: { can_impersonate: { from: false, to: true } },
      outcome: "success",
      required: true,
    });

    expect(recordRequiredMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        requestId: "outbox-request-1",
        metadata: { actorPlatformUserId: "platform-user-1" },
        referringId: "platform-user-2",
        changes: { can_impersonate: { from: false, to: true } },
      }),
    );
  });

  it("persiste eventos obrigatórios ou retorna indisponibilidade", async () => {
    const logger = { error: vi.fn() };
    const audit = createUserAudit({
      enabled: true,
      serviceUrl: "http://audit.test",
      serviceToken: "test-token",
      logger: logger as never,
    });
    recordRequiredMock.mockResolvedValueOnce(undefined);

    await audit({
      actorUserId: "user-1",
      platformActorUserId: "platform-user-1",
      organizationId: "org-1",
      action: "platform.impersonation.started",
      referring: "user",
      referringId: "user-1",
      changes: { target: { id: "user-1" } },
      outcome: "success",
      required: true,
    });

    expect(recordRequiredMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "platform.impersonation.started" }),
    );
    expect(recordAuditMock).not.toHaveBeenCalled();

    recordRequiredMock.mockRejectedValueOnce(new Error("Audit persistence unavailable"));
    await expect(
      audit({
        actorUserId: "user-1",
        platformActorUserId: "platform-user-1",
        organizationId: "org-1",
        action: "platform.impersonation.started",
        referring: "user",
        referringId: "user-1",
        changes: { target: { id: "user-1" } },
        outcome: "success",
        required: true,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Falha na auditoria obrigatória para ação de plataforma.",
    );
  });
});
