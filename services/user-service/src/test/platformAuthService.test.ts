import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock, jwtMock } = vi.hoisted(() => ({
  prismaMock: {
    platformUser: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    supportSession: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  bcryptMock: {
    compare: vi.fn(),
  },
  jwtMock: {
    sign: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

vi.mock("../config/env.js", () => ({
  getUserServiceEnv: () => ({
    jwtSecret: "jwt-secret",
  }),
}));

vi.mock("bcryptjs", () => ({
  default: bcryptMock,
}));

vi.mock("jsonwebtoken", () => ({
  default: jwtMock,
}));

import { SupportSessionStatus } from "../generated/prisma/enums.js";
import { PlatformAuthService } from "../services/platformAuthService.js";

describe("PlatformAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login retorna token de plataforma para super admin ativo", async () => {
    prismaMock.platformUser.findUnique.mockResolvedValue({
      id: "platform-1",
      name: "Dev Admin",
      email: "dev@example.com",
      password: "hash",
      platform_role: "super_admin",
      status: "active",
    });
    bcryptMock.compare.mockResolvedValue(true);
    jwtMock.sign.mockReturnValue("platform-jwt");
    const service = new PlatformAuthService();

    const result = await service.login({ email: "dev@example.com", password: "secret" });

    expect(prismaMock.platformUser.findUnique).toHaveBeenCalledWith({
      where: { email: "dev@example.com" },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        platform_role: true,
        status: true,
      },
    });
    expect(result).toEqual({
      id: "platform-1",
      name: "Dev Admin",
      email: "dev@example.com",
      platform_role: "super_admin",
      token: "platform-jwt",
    });
    expect(jwtMock.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "platform-1",
        auth_kind: "platform",
        platform_role: "super_admin",
      }),
      "jwt-secret",
      { subject: "platform-1", expiresIn: "1d" },
    );
  });

  it("startSupportSession cria sessao ativa e token de suporte", async () => {
    prismaMock.platformUser.findUnique.mockResolvedValue({
      id: "platform-1",
      name: "Dev Admin",
      email: "dev@example.com",
      platform_role: "super_admin",
      status: "active",
    });
    prismaMock.organization.findUnique.mockResolvedValue({ id: "org-1", status: "active" });
    prismaMock.supportSession.create.mockResolvedValue({
      id: "support-1",
      organization_id: "org-1",
      reason: "debug de permissao",
      expires_at: new Date("2026-07-13T13:00:00.000Z"),
    });
    jwtMock.sign.mockReturnValue("support-jwt");
    const service = new PlatformAuthService();

    const result = await service.startSupportSession({
      platformUserId: "platform-1",
      organizationId: "org-1",
      reason: "debug de permissao",
    });

    expect(prismaMock.supportSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          platform_user_id: "platform-1",
          organization_id: "org-1",
          reason: "debug de permissao",
          expires_at: expect.any(Date),
        }),
      }),
    );
    expect(jwtMock.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "platform-1",
        auth_kind: "platform",
        support_mode: true,
        support_session_id: "support-1",
        support_organization_id: "org-1",
        organization_id: "org-1",
      }),
      "jwt-secret",
      { subject: "platform-1", expiresIn: "1h" },
    );
    expect(result).toEqual({
      support_session_id: "support-1",
      organization_id: "org-1",
      reason: "debug de permissao",
      expires_at: "2026-07-13T13:00:00.000Z",
      token: "support-jwt",
    });
  });

  it("endSupportSession fecha somente sessao ativa do platform user", async () => {
    prismaMock.supportSession.updateMany.mockResolvedValue({ count: 1 });
    const service = new PlatformAuthService();

    const result = await service.endSupportSession("platform-1", "support-1");

    expect(prismaMock.supportSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: "support-1",
        platform_user_id: "platform-1",
        status: SupportSessionStatus.active,
      },
      data: { status: SupportSessionStatus.closed, ended_at: expect.any(Date) },
    });
    expect(result).toEqual({
      platform_user_id: "platform-1",
      support_session_id: "support-1",
    });
  });

  it("endSupportSession lanca 404 quando sessao nao pertence ao platform user", async () => {
    prismaMock.supportSession.updateMany.mockResolvedValue({ count: 0 });
    const service = new PlatformAuthService();

    await expect(service.endSupportSession("platform-1", "support-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
