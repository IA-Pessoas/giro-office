import type { Logger } from "@workspace/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAuditRecorderMock, recordAuditMock } = vi.hoisted(() => ({
  createAuditRecorderMock: vi.fn(),
  recordAuditMock: vi.fn(),
}));

vi.mock("@workspace/shared/audit", () => ({
  createAuditRecorder: createAuditRecorderMock,
}));

import { createOrganizationAudit } from "../integrations/audit.js";

describe("organization domain audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAuditRecorderMock.mockReturnValue(recordAuditMock);
    recordAuditMock.mockResolvedValue(undefined);
  });

  it("envia somente identidade técnica do ator e mudanças allowlisted", async () => {
    // Falha detectada: o evento envia e-mail, CNPJ, cookie, token ou campos fora da allowlist.
    const logger = {} as Logger;
    const audit = createOrganizationAudit({
      enabled: true,
      serviceUrl: "http://audit-service:3020",
      serviceToken: "internal-token",
      logger,
    });

    await audit({
      actorPlatformUserId: "platform-user-1",
      organizationId: "org-1",
      action: "organization.status.updated",
      changes: { status: { from: "active", to: "suspended" } },
    });

    expect(createAuditRecorderMock).toHaveBeenCalledWith({
      enabled: true,
      serviceUrl: "http://audit-service:3020",
      serviceToken: "internal-token",
      logger,
    });
    expect(recordAuditMock).toHaveBeenCalledWith({
      requestId: expect.any(String),
      organizationId: "org-1",
      userId: null,
      method: "ENTITY_CHANGE",
      path: "/platform/organizations/org-1",
      outcome: "success",
      serviceSource: "organization-service",
      createdAt: expect.any(String),
      finishedAt: expect.any(String),
      metadata: { actorPlatformUserId: "platform-user-1" },
      action: "organization.status.updated",
      referring: "organization",
      referringId: "org-1",
      changes: { status: { from: "active", to: "suspended" } },
    });
  });
});
