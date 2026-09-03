import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordAuditMock } = vi.hoisted(() => ({
  recordAuditMock: vi.fn(),
}));

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
});
