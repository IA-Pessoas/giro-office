import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, passwordHashMock, jwtMock } = vi.hoisted(() => ({
  prismaMock: {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (callback) => callback(prismaMock)),
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    authSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
    platformAuthSession: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
    department: {
      findFirst: vi.fn(),
    },
  },
  passwordHashMock: {
    verifyPassword: vi.fn(),
    hashPassword: vi.fn(),
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
    adminPassword: "admin-secret",
  }),
}));

vi.mock("../security/passwordHashService.js", () => ({
  PASSWORD_HASH_VERSION: "argon2id-v1",
  ...passwordHashMock,
}));

vi.mock("jsonwebtoken", () => ({
  default: jwtMock,
}));

import { AuthService } from "../services/authService.js";
import { UserService } from "../services/userService.js";

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: false, needsRehash: false });
    prismaMock.authSession.findFirst.mockResolvedValue({ id: "session-1" });
  });

  function activeUser(overrides: Record<string, unknown> = {}) {
    return {
      id: "user-1",
      name: "Usuário ativo",
      login: "account",
      password: "hash-active",
      permission: 1,
      type: "user",
      status: "active",
      session_version: 1,
      version: 1,
      department_id: "dep-1",
      organization_id: "org-1",
      organization: { id: "org-1", status: "active" },
      department: {
        organization_id: "org-1",
        organization: { id: "org-1", status: "active" },
      },
      permissions: [{ organization_id: "org-1", ti: 1 }],
      ...overrides,
    };
  }

  it("login lança 401 quando usuário não existe", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const service = new AuthService();

    await expect(service.login({ login: "admin", password: "secret" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("login mantém a mesma falha pública para credencial ou contexto inválido", async () => {
    const cases = [
      { user: null, passwordMatches: false },
      { user: activeUser({ password: "hash-wrong" }), passwordMatches: false },
      { user: activeUser({ status: "inactive" }), passwordMatches: true },
      {
        user: activeUser({ organization: { id: "org-1", status: "inactive" } }),
        passwordMatches: true,
      },
      {
        user: activeUser({ department: { organization_id: "org-2" } }),
        passwordMatches: true,
      },
    ];
    const failures: Array<{ statusCode: number; code: string; message: string }> = [];

    for (const testCase of cases) {
      prismaMock.user.findFirst.mockResolvedValueOnce(testCase.user);
      passwordHashMock.verifyPassword.mockResolvedValueOnce({
        valid: testCase.passwordMatches,
        needsRehash: false,
      });

      try {
        await new AuthService().login({ login: "  account  ", password: "secret" });
      } catch (err: unknown) {
        failures.push({
          statusCode: (err as { statusCode: number }).statusCode,
          code: (err as { code: string }).code,
          message: (err as Error).message,
        });
      }
    }

    expect(failures).toEqual([
      { statusCode: 401, code: "UNAUTHORIZED", message: "Login ou senha inválidos." },
      { statusCode: 401, code: "UNAUTHORIZED", message: "Login ou senha inválidos." },
      { statusCode: 401, code: "UNAUTHORIZED", message: "Login ou senha inválidos." },
      { statusCode: 401, code: "UNAUTHORIZED", message: "Login ou senha inválidos." },
      { statusCode: 401, code: "UNAUTHORIZED", message: "Login ou senha inválidos." },
    ]);
    expect(passwordHashMock.verifyPassword).toHaveBeenCalledTimes(5);
    expect(passwordHashMock.verifyPassword).toHaveBeenNthCalledWith(
      1,
      "secret",
      "$argon2id$v=19$m=19456,p=1,t=2$lktGNqJmnbIyj6tMoe+a8Q$HRtIIMh3LPpaIs9yyun/WOjqfivhgr4Nt3m9wsIkTsQ",
    );
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { login: { equals: "account", mode: "insensitive" } },
      }),
    );
  });

  it("login retorna sessão com token quando credenciais são válidas", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      activeUser({
        name: "Admin",
        login: "admin",
        password: "hash",
        permission: 2,
        type: "admin",
        permissions: [
          {
            organization_id: "org-1",
            certificado: null,
            comercial: null,
            contabil: null,
            financeiro: null,
            fiscal: null,
            integracao: null,
            marketing: null,
            parcelamento: null,
            pessoal: null,
            regularize: null,
            rh: null,
            ti: 2,
            triagem: null,
          },
        ],
      }),
    );
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    jwtMock.sign.mockReturnValue("jwt-token");
    const service = new AuthService();

    const result = await service.login({ login: "admin", password: "secret" });

    expect(result).toEqual({
      id: "user-1",
      name: "Admin",
      login: "admin",
      permission: 2,
      type: "admin",
      modules: {
        certificado: 0,
        comercial: 0,
        contabil: 0,
        financeiro: 0,
        fiscal: 0,
        integracao: 0,
        marketing: 0,
        parcelamento: 0,
        pessoal: 0,
        regularize: 0,
        rh: 0,
        ti: 2,
        triagem: 0,
      },
      department_id: "dep-1",
      organization_id: "org-1",
      token: "jwt-token",
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
    });
    expect(jwtMock.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        organization_id: "org-1",
        permission: 2,
        type: "admin",
        modules: expect.objectContaining({ ti: 2 }),
        session_id: expect.any(String),
      }),
      "jwt-secret",
      expect.any(Object),
    );
  });

  it("inicia personificação com claims do alvo, expiração de 60 minutos e sessão do operador revogada", async () => {
    const startedAt = new Date();
    prismaMock.platformUser.findUnique.mockResolvedValue({
      id: "platform-1",
      platform_role: "super_admin",
      status: "active",
      can_impersonate: true,
    });
    prismaMock.user.findUnique.mockResolvedValue(
      activeUser({
        name: "Ana",
        login: "ana",
        permission: 2,
        type: "owner",
        permissions: [{ organization_id: "org-1", ti: 2 }],
      }),
    );
    prismaMock.platformAuthSession.updateMany.mockResolvedValue({ count: 1 });
    jwtMock.sign.mockReturnValue("impersonation.jwt");
    const recordStartEvent = vi.fn(async () => {});

    const issued = await new AuthService().startImpersonation(
      {
        organizationId: "org-1",
        targetUserId: "user-1",
        platformUserId: "platform-1",
        platformSessionId: "platform-session-1",
        platformSessionCsrfHash: "a".repeat(64),
      },
      recordStartEvent,
    );

    expect(issued).toMatchObject({
      id: "user-1",
      name: "Ana",
      login: "ana",
      permission: 2,
      organization_id: "org-1",
      token: "impersonation.jwt",
    });
    expect(jwtMock.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        organization_id: "org-1",
        name: "Ana",
        login: "ana",
        permission: 2,
        type: "owner",
        modules: expect.objectContaining({ ti: 2 }),
        impersonator_platform_user_id: "platform-1",
      }),
      "jwt-secret",
      expect.objectContaining({ subject: "user-1", expiresIn: 3600 }),
    );
    expect(prismaMock.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: "user-1",
        impersonator_platform_user_id: "platform-1",
        expires_at: expect.any(Date),
      }),
    });
    const sessionData = prismaMock.authSession.create.mock.calls[0][0].data;
    expect(sessionData.expires_at.getTime() - issued.impersonationStartedAt.getTime()).toBe(
      3_600_000,
    );
    expect(prismaMock.authSession.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.platformAuthSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "platform-session-1",
        platform_user_id: "platform-1",
        csrf_hash: "a".repeat(64),
      }),
      data: { revoked_at: issued.impersonationStartedAt },
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(recordStartEvent).toHaveBeenCalledWith({
      organizationId: "org-1",
      targetUserId: "user-1",
      targetName: "Ana",
      platformUserId: "platform-1",
      startedAt: issued.impersonationStartedAt,
    });
    expect(issued.impersonationStartedAt.getTime()).toBeGreaterThanOrEqual(startedAt.getTime());
  });

  it("encerra personificação, audita a organização-alvo e emite sessão sem senha", async () => {
    const createdAt = new Date(Date.now() - 60_000);
    const session = {
      id: "impersonation-session-1",
      created_at: createdAt,
      impersonator_platform_user_id: "platform-1",
      impersonatorPlatformUser: {
        id: "platform-1",
        name: "Operador",
        email: "operator@example.com",
        platform_role: "super_admin",
        status: "active",
        can_impersonate: true,
        session_version: 3,
      },
      user: {
        id: "user-1",
        name: "Ana",
        organization_id: "org-1",
        department: { organization_id: "org-1" },
      },
    };
    prismaMock.authSession.findFirst.mockResolvedValueOnce(session).mockResolvedValueOnce(null);
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 1 });
    jwtMock.sign.mockReturnValue("platform.jwt");
    const recordExitEvent = vi.fn(async () => {});
    const identity = {
      user_id: "user-1",
      organization_id: "org-1",
      session_id: "impersonation-session-1",
      csrf_hash: "a".repeat(64),
    };

    const result = await new AuthService().exitImpersonation(identity, recordExitEvent);

    expect(result.platformSession).toMatchObject({
      identity: { id: "platform-1", auth_kind: "platform", platform_role: "super_admin" },
      token: "platform.jwt",
    });
    expect(prismaMock.authSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: identity.session_id,
        user_id: identity.user_id,
        csrf_hash: identity.csrf_hash,
        impersonator_platform_user_id: "platform-1",
      }),
      data: { revoked_at: expect.any(Date) },
    });
    expect(prismaMock.platformAuthSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform_user_id: "platform-1",
        csrf_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        expires_at: expect.any(Date),
      }),
    });
    expect(jwtMock.sign).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "platform-1", session_version: 3 }),
      "jwt-secret",
      expect.objectContaining({ expiresIn: expect.any(Number) }),
    );
    expect(recordExitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        targetUserId: "user-1",
        platformUserId: "platform-1",
        startedAt: createdAt,
        reason: "saída",
        durationMs: expect.any(Number),
      }),
    );
    expect(passwordHashMock.verifyPassword).not.toHaveBeenCalled();
    await expect(
      new AuthService().validateSession({
        ...identity,
        session_version: 1,
        impersonator_platform_user_id: "platform-1",
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("encerra a personificação sem recriar sessão quando o operador foi inativado", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "impersonation-session-1",
      created_at: new Date(Date.now() - 30_000),
      impersonator_platform_user_id: "platform-1",
      impersonatorPlatformUser: {
        id: "platform-1",
        name: "Operador",
        email: "operator@example.com",
        platform_role: "super_admin",
        status: "inactive",
        can_impersonate: true,
        session_version: 2,
      },
      user: {
        id: "user-1",
        name: "Ana",
        organization_id: "org-1",
        department: { organization_id: "org-1" },
      },
    });
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 1 });
    const recordExitEvent = vi.fn(async () => {});

    const result = await new AuthService().exitImpersonation(
      {
        user_id: "user-1",
        organization_id: "org-1",
        session_id: "impersonation-session-1",
        csrf_hash: "a".repeat(64),
      },
      recordExitEvent,
    );

    expect(result.platformSession).toBeNull();
    expect(prismaMock.authSession.updateMany).toHaveBeenCalledOnce();
    expect(prismaMock.platformAuthSession.create).not.toHaveBeenCalled();
    expect(recordExitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: "platform-1", reason: "saída" }),
    );
  });

  it("recusa sessão comum e não revoga outra sessão ao tentar sair da personificação", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue(null);
    const recordExitEvent = vi.fn(async () => {});

    await expect(
      new AuthService().exitImpersonation(
        {
          user_id: "user-1",
          organization_id: "org-1",
          session_id: "ordinary-session",
          csrf_hash: "a".repeat(64),
        },
        recordExitEvent,
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(prismaMock.authSession.updateMany).not.toHaveBeenCalled();
    expect(recordExitEvent).not.toHaveBeenCalled();
  });

  it("revoga e audita sessão de personificação expirada com a organização-alvo", async () => {
    const startedAt = new Date(Date.now() - 3_660_000);
    const expiresAt = new Date(startedAt.getTime() + 3_600_000);
    prismaMock.authSession.findMany.mockResolvedValue([
      {
        id: "expired-impersonation-session",
        user_id: "user-1",
        created_at: startedAt,
        expires_at: expiresAt,
        impersonator_platform_user_id: "platform-1",
        user: {
          name: "Ana",
          organization_id: null,
          department: { organization_id: "org-1" },
        },
      },
    ]);
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 1 });
    const recordEndEvent = vi.fn(async () => {});

    const expiredCount = await new AuthService().expireImpersonationSessions(recordEndEvent);

    expect(expiredCount).toBe(1);
    expect(prismaMock.authSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "expired-impersonation-session",
        impersonator_platform_user_id: "platform-1",
        revoked_at: null,
        expires_at: { lte: expect.any(Date) },
      }),
      data: { revoked_at: expect.any(Date) },
    });
    expect(recordEndEvent).toHaveBeenCalledWith({
      organizationId: "org-1",
      targetUserId: "user-1",
      targetName: "Ana",
      platformUserId: "platform-1",
      startedAt,
      endedAt: expiresAt,
      durationMs: 3_600_000,
      reason: "expiração",
    });
  });

  it("recusa operador sem permissão e alvo ou organização inativos", async () => {
    const recordStartEvent = vi.fn(async () => {});
    const input = {
      organizationId: "org-1",
      targetUserId: "user-1",
      platformUserId: "platform-1",
      platformSessionId: "platform-session-1",
      platformSessionCsrfHash: "a".repeat(64),
    };

    prismaMock.platformUser.findUnique.mockResolvedValue({
      id: "platform-1",
      platform_role: "super_admin",
      status: "active",
      can_impersonate: false,
    });
    await expect(
      new AuthService().startImpersonation(input, recordStartEvent),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();

    prismaMock.platformUser.findUnique.mockResolvedValue({
      id: "platform-1",
      platform_role: "super_admin",
      status: "active",
      can_impersonate: true,
    });
    for (const target of [
      activeUser({ status: "inactive" }),
      activeUser({ organization: { id: "org-1", status: "suspended" } }),
    ]) {
      prismaMock.user.findUnique.mockResolvedValueOnce(target);
      await expect(
        new AuthService().startImpersonation(input, recordStartEvent),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    }
    expect(prismaMock.authSession.create).not.toHaveBeenCalled();
    expect(prismaMock.platformAuthSession.updateMany).not.toHaveBeenCalled();
    expect(recordStartEvent).not.toHaveBeenCalled();
  });

  it("login permite organização em trial", async () => {
    // Quebra detectada: tratar trial como inativo impede um usuário elegível de autenticar.
    prismaMock.user.findFirst.mockResolvedValue(
      activeUser({ organization: { id: "org-1", status: "trial" } }),
    );
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    jwtMock.sign.mockReturnValue("jwt-token");

    await expect(
      new AuthService().login({ login: "account", password: "secret" }),
    ).resolves.toMatchObject({ organization_id: "org-1", token: "jwt-token" });
  });

  it.each([
    "past_due",
    "suspended",
    "cancelled",
  ])("login bloqueia organização com status %s", async (status) => {
    // Quebra detectada: ampliar demais a regra permite login de organizações bloqueadas.
    prismaMock.user.findFirst.mockResolvedValue(
      activeUser({ organization: { id: "org-1", status } }),
    );
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });

    await expect(
      new AuthService().login({ login: "account", password: "secret" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("login assina sessão de um dia vinculada ao CSRF retornado", async () => {
    prismaMock.user.findFirst.mockResolvedValue(activeUser());
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    jwtMock.sign.mockReturnValue("jwt-token");

    const result = await new AuthService().login({ login: "account", password: "secret" });

    expect(jwtMock.sign).toHaveBeenCalledWith(
      expect.objectContaining({ csrf_hash: expect.stringMatching(/^[a-f0-9]{64}$/u) }),
      "jwt-secret",
      expect.objectContaining({ expiresIn: 86_400, subject: "user-1" }),
    );
    expect(result.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(result.token).toBe("jwt-token");
    expect(prismaMock.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: "user-1",
        csrf_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        expires_at: expect.any(Date),
      }),
    });
    expect(prismaMock.$executeRaw).toHaveBeenCalledOnce();
  });

  it("refresh rotaciona apenas a sessão atual com CAS do vínculo CSRF", async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 1 });
    jwtMock.sign.mockReturnValue("jwt-token");
    const identity = {
      user_id: "user-1",
      organization_id: "org-1",
      session_version: 1,
      session_id: "session-1",
      csrf_hash: "a".repeat(64),
    };

    const refreshed = await new AuthService().refreshSession(identity);

    expect(refreshed.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(prismaMock.authSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "session-1",
        user_id: "user-1",
        csrf_hash: "a".repeat(64),
        revoked_at: null,
      }),
      data: expect.objectContaining({
        csrf_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        expires_at: expect.any(Date),
      }),
    });
    expect(jwtMock.sign).toHaveBeenCalledWith(
      expect.objectContaining({ session_version: 1, session_id: "session-1" }),
      "jwt-secret",
      expect.any(Object),
    );
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("refresh permite organização em trial", async () => {
    // Quebra detectada: tratar trial como inativo invalida uma sessão ainda elegível.
    prismaMock.user.findUnique.mockResolvedValue(
      activeUser({ organization: { id: "org-1", status: "trial" } }),
    );
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 1 });
    jwtMock.sign.mockReturnValue("jwt-token");

    await expect(
      new AuthService().refreshSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).resolves.toMatchObject({ organization_id: "org-1", token: "jwt-token" });
  });

  it.each([
    "past_due",
    "suspended",
    "cancelled",
  ])("refresh bloqueia organização com status %s", async (status) => {
    // Quebra detectada: ampliar demais a regra renova sessões de organizações bloqueadas.
    prismaMock.user.findUnique.mockResolvedValue(
      activeUser({ organization: { id: "org-1", status } }),
    );

    await expect(
      new AuthService().refreshSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refresh rejeita replay concorrente da versão já rotacionada", async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.authSession.findFirst.mockResolvedValue({ csrf_hash: "b".repeat(64) });

    await expect(
      new AuthService().refreshSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(jwtMock.sign).not.toHaveBeenCalled();
  });

  it("logout revoga somente a sessão atual", async () => {
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 1 });

    await new AuthService().revokeSession("user-1", "session-1");

    expect(prismaMock.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        user_id: "user-1",
        revoked_at: null,
      },
      data: { revoked_at: expect.any(Date) },
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("logout rejeita sessão já revogada", async () => {
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(new AuthService().revokeSession("user-1", "session-1")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("logout revoga a sessão mesmo após rotação concorrente do CSRF", async () => {
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 1 });

    await new AuthService().revokeSession("user-1", "session-1");

    expect(prismaMock.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: "session-1", user_id: "user-1", revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it("rehash de bcrypt válido uma única vez sem sobrescrever uma troca concorrente", async () => {
    prismaMock.user.findFirst.mockResolvedValue(activeUser({ password: "$2b$10$legacy" }));
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: true, needsRehash: true });
    passwordHashMock.hashPassword.mockResolvedValue("$argon2id$v=19$new-hash");
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    jwtMock.sign.mockReturnValue("jwt-token");

    await expect(
      new AuthService().login({ login: "account", password: "secret" }),
    ).resolves.toMatchObject({
      token: "jwt-token",
    });

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", password: "$2b$10$legacy" },
      data: { password: "$argon2id$v=19$new-hash" },
    });
  });

  it("não rehash senha inválida", async () => {
    prismaMock.user.findFirst.mockResolvedValue(activeUser({ password: "$2b$10$legacy" }));
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: false, needsRehash: true });

    await expect(
      new AuthService().login({ login: "account", password: "wrong" }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(passwordHashMock.hashPassword).not.toHaveBeenCalled();
  });

  it("login carrega somente a permissão da organização ativa", async () => {
    prismaMock.user.findFirst.mockResolvedValue(
      activeUser({
        name: "Usuário",
        login: "user",
        password: "hash",
        permission: 0,
        type: "user",
        organization_id: "org-b",
        organization: { id: "org-b", status: "active" },
        department: {
          organization_id: "org-b",
          organization: { id: "org-b", status: "active" },
        },
        permissions: [
          { organization_id: "org-a", fiscal: 3 },
          { organization_id: "org-b", fiscal: 1 },
        ],
      }),
    );
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    jwtMock.sign.mockReturnValue("jwt-token");
    const service = new AuthService();

    const result = await service.login({ login: "user", password: "secret" });

    expect(result.organization_id).toBe("org-b");
    expect(result.modules.fiscal).toBe(1);
    expect(result.modules.comercial).toBe(0);
  });

  it("login autentica a nova senha persistida pelo fluxo de atualização", async () => {
    const user = activeUser({
      name: "Usuário",
      login: "user",
      password: "hash:senha-antiga",
      permission: 0,
      type: "user",
      photo_url: null,
      joined_at: null,
      first_owner_flag: false,
      permission_id: "permission-1",
      permissions: [{ organization_id: "org-1" }],
    });
    prismaMock.user.findFirst.mockResolvedValue(user);
    prismaMock.user.updateMany.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        const { version, ...fields } = data;
        Object.assign(user, fields);
        if (typeof version === "object" && version !== null && "increment" in version) {
          user.version = (typeof user.version === "number" ? user.version : 1) + 1;
        }
        return { count: 1 };
      },
    );
    passwordHashMock.hashPassword.mockImplementation(
      async (password: string) => `hash:${password}`,
    );
    passwordHashMock.verifyPassword.mockImplementation(async (password: string, hash: string) => ({
      valid: hash === `hash:${password}`,
      needsRehash: false,
    }));
    jwtMock.sign.mockReturnValue("jwt-token");

    await new UserService().update("user-1", { password: "nova-senha" }, "org-1", "user-1");

    await expect(
      new AuthService().login({ login: "user", password: "nova-senha" }),
    ).resolves.toMatchObject({
      id: "user-1",
      token: "jwt-token",
    });
    await expect(
      new AuthService().login({ login: "user", password: "senha-antiga" }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("firstCreate cria admin inicial quando banco está vazio", async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    prismaMock.organization.findFirst.mockResolvedValue({ id: "org-1" });
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-1" });
    passwordHashMock.hashPassword.mockResolvedValue("hashed");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      name: "Admin",
      login: "Admin",
      permission: 2,
      department_id: "dep-1",
    });
    const service = new AuthService();

    const result = await service.firstCreate();

    expect(result).toEqual({
      user: {
        id: "user-1",
        name: "Admin",
        login: "Admin",
        permission: 2,
        department_id: "dep-1",
      },
    });
  });

  it("rejeita token quando a versão persistida da sessão mudou", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      user: activeUser({ session_version: 2 }),
    });
    const service = new AuthService();

    await expect(
      service.validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it.each([
    activeUser({ status: "inactive" }),
    activeUser({ organization: { id: "org-1", status: "inactive" } }),
    activeUser({ department: { organization_id: "org-2" } }),
  ])("rejeita sessão para contexto persistido inválido", async (user) => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      user,
    });

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("aceita sessão para usuário e organização ativos com associação compatível", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      user: activeUser(),
    });

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).resolves.toBeUndefined();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("vincula a claim do operador à sessão de personificação persistida", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      impersonator_platform_user_id: "platform-1",
      impersonatorPlatformUser: {
        platform_role: "super_admin",
        status: "active",
        can_impersonate: true,
      },
      user: activeUser(),
    });

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
        impersonator_platform_user_id: "platform-1",
      }),
    ).resolves.toBeUndefined();
    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("retorna operador, organização e expiração da sessão de personificação ativa", async () => {
    const expiresAt = new Date("2026-09-24T14:00:00.000Z");
    prismaMock.authSession.findFirst.mockResolvedValue({
      expires_at: expiresAt,
      impersonator_platform_user_id: "platform-1",
      impersonatorPlatformUser: {
        id: "platform-1",
        name: "Operador",
        platform_role: "super_admin",
        status: "active",
        can_impersonate: true,
      },
      user: activeUser({
        organization: { id: "org-1", name: "Organização Aurora", status: "active" },
        department: {
          organization_id: "org-1",
          organization: { id: "org-1", name: "Organização Aurora", status: "active" },
        },
      }),
    });

    const result = await new AuthService().getImpersonationSessionInfo({
      user_id: "user-1",
      organization_id: "org-1",
      session_id: "session-1",
    });

    expect(result).toEqual({
      operator: { id: "platform-1", name: "Operador" },
      expires_at: expiresAt.toISOString(),
      organization_name: "Organização Aurora",
    });
    expect(prismaMock.authSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "session-1",
          user_id: "user-1",
          impersonator_platform_user_id: { not: null },
          revoked_at: null,
        }),
      }),
    );
  });

  it("não retorna contexto de personificação sem uma sessão ativa", async () => {
    const service = new AuthService();

    await expect(
      service.getImpersonationSessionInfo({
        user_id: "user-1",
        organization_id: "org-1",
        session_id: undefined,
      }),
    ).resolves.toBeNull();
    expect(prismaMock.authSession.findFirst).not.toHaveBeenCalled();

    prismaMock.authSession.findFirst.mockResolvedValue(null);
    await expect(
      service.getImpersonationSessionInfo({
        user_id: "user-1",
        organization_id: "org-1",
        session_id: "session-1",
      }),
    ).resolves.toBeNull();
  });

  it.each([
    ["perde permissão", { platform_role: "super_admin", status: "active", can_impersonate: false }],
    ["é desativado", { platform_role: "super_admin", status: "inactive", can_impersonate: true }],
    [
      "deixa de ser super admin",
      { platform_role: "support", status: "active", can_impersonate: true },
    ],
  ])("derruba a personificação quando o operador %s", async (_reason, operator) => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      impersonator_platform_user_id: "platform-1",
      impersonatorPlatformUser: operator,
      user: activeUser(),
    });

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
        impersonator_platform_user_id: "platform-1",
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("não renova uma sessão de personificação", async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());
    prismaMock.authSession.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.authSession.findFirst.mockResolvedValue({
      csrf_hash: "a".repeat(64),
      impersonator_platform_user_id: "platform-1",
    });

    await expect(
      new AuthService().refreshSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
        impersonator_platform_user_id: "platform-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ impersonator_platform_user_id: null }),
      }),
    );
  });

  it("aceita sessão para organização em trial", async () => {
    // Quebra detectada: tratar trial como inativo derruba uma sessão ainda elegível.
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      user: activeUser({ organization: { id: "org-1", status: "trial" } }),
    });

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    "past_due",
    "suspended",
    "cancelled",
  ])("rejeita sessão para organização com status %s", async (status) => {
    // Quebra detectada: ampliar demais a regra mantém sessões de organizações bloqueadas.
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      user: activeUser({ organization: { id: "org-1", status } }),
    });

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("classifica o JWT anterior como sessão substituída sem aceitá-lo", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "b".repeat(64),
      user: activeUser(),
    });

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("aceita token legado somente durante a compatibilidade Bearer explícita", async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());
    const legacyIdentity = {
      user_id: "user-1",
      organization_id: "org-1",
      session_version: 1,
    };

    await expect(new AuthService().validateSession(legacyIdentity)).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      new AuthService().validateSession(legacyIdentity, { allowLegacyBearer: true }),
    ).resolves.toBeUndefined();
    expect(prismaMock.authSession.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    { session_id: "session-1", csrf_hash: undefined },
    { session_id: undefined, csrf_hash: "a".repeat(64) },
  ])("rejeita vínculo de sessão parcial mesmo na compatibilidade Bearer", async (binding) => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());

    await expect(
      new AuthService().validateSession(
        {
          user_id: "user-1",
          organization_id: "org-1",
          session_version: 1,
          ...binding,
        },
        { allowLegacyBearer: true },
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("mantém login e sessão de usuário legado vinculados pela organização do departamento", async () => {
    const legacyUser = activeUser({ organization_id: null, organization: null });
    prismaMock.user.findFirst.mockResolvedValue(legacyUser);
    prismaMock.user.findUnique.mockResolvedValue(legacyUser);
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      user: legacyUser,
    });
    passwordHashMock.verifyPassword.mockResolvedValue({ valid: true, needsRehash: false });
    jwtMock.sign.mockReturnValue("jwt-token");

    await expect(
      new AuthService().login({ login: "account", password: "secret" }),
    ).resolves.toMatchObject({
      organization_id: "org-1",
      token: "jwt-token",
    });
    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    undefined,
    "org-2",
  ])("rejeita sessão quando a claim de organização está ausente ou não coincide", async (organization_id) => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      csrf_hash: "a".repeat(64),
      user: activeUser(),
    });

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id,
        session_version: 1,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
