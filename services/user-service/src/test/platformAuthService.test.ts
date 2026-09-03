import { beforeEach, describe, expect, it, vi } from "vitest";

const { jwtMock, passwordHashMock } = vi.hoisted(() => ({
  jwtMock: { sign: vi.fn() },
  passwordHashMock: { verifyPassword: vi.fn() },
}));

vi.mock("../config/env.js", () => ({
  getUserServiceEnv: () => ({ jwtSecret: "jwt-secret" }),
}));

vi.mock("../security/passwordHashService.js", () => passwordHashMock);

vi.mock("jsonwebtoken", () => ({ default: jwtMock }));

import { PlatformAuthService } from "../services/platformAuthService.js";

const validLogin = { email: "admin@example.com", password: "safe-password" };
const validClaims = {
  user_id: "platform-user-1",
  auth_kind: "platform" as const,
  platform_role: "super_admin" as const,
  session_version: 1,
  session_id: "platform-session-1",
  csrf_hash: "a".repeat(64),
};

const repository = {
  findByEmail: vi.fn(),
  findById: vi.fn(),
  createSession: vi.fn(),
  findActiveSession: vi.fn(),
  rotateSession: vi.fn(),
  revokeSession: vi.fn(),
};

function activePlatformUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "platform-user-1",
    name: "Platform Administrator",
    email: validLogin.email,
    password: "password-hash",
    platform_role: "super_admin",
    status: "active",
    session_version: 1,
    ...overrides,
  };
}

describe("PlatformAuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByEmail.mockResolvedValue(activePlatformUser());
    repository.findById.mockResolvedValue(activePlatformUser());
    repository.createSession.mockResolvedValue(undefined);
    repository.findActiveSession.mockResolvedValue({
      csrf_hash: validClaims.csrf_hash,
      platformUser: activePlatformUser(),
    });
    repository.rotateSession.mockResolvedValue(1);
    repository.revokeSession.mockResolvedValue(1);
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    jwtMock.sign.mockReturnValue("platform.jwt");
  });

  it("issues a persisted platform session", async () => {
    const service = new PlatformAuthService(repository);

    const issued = await service.login(validLogin);

    expect(issued.identity).toMatchObject({
      id: "platform-user-1",
      name: "Platform Administrator",
      email: validLogin.email,
      auth_kind: "platform",
      platform_role: "super_admin",
    });
    expect(issued.token).toBe("platform.jwt");
    expect(repository.createSession).toHaveBeenCalledOnce();
    expect(jwtMock.sign).toHaveBeenCalledWith(
      {
        user_id: "platform-user-1",
        auth_kind: "platform",
        platform_role: "super_admin",
        session_version: 1,
        session_id: expect.any(String),
        csrf_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        name: "Platform Administrator",
        login: validLogin.email,
      },
      "jwt-secret",
      { expiresIn: 86_400 },
    );
  });

  it("rejects revoked/version-mismatched sessions", async () => {
    repository.findActiveSession.mockResolvedValue(null);
    const service = new PlatformAuthService(repository);

    await expect(service.validateSession(validClaims)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rotates CSRF with compare-and-swap", async () => {
    repository.rotateSession.mockResolvedValue(0);
    repository.findActiveSession
      .mockResolvedValueOnce({
        csrf_hash: validClaims.csrf_hash,
        platformUser: activePlatformUser(),
      })
      .mockResolvedValueOnce({ csrf_hash: "b".repeat(64) });
    const service = new PlatformAuthService(repository);

    await expect(service.refreshSession(validClaims)).rejects.toMatchObject({ statusCode: 409 });
  });
});
