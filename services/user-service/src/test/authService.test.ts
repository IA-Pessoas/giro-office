import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, passwordHashMock, jwtMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
      expect.objectContaining({ where: { login: "account" } }),
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
      }),
      "jwt-secret",
      expect.any(Object),
    );
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
  });

  it("refresh rotaciona o vínculo CSRF sem alterar session_version", async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());
    jwtMock.sign.mockReturnValue("jwt-token");
    const service = new AuthService();
    const identity = {
      user_id: "user-1",
      organization_id: "org-1",
      session_version: 1,
    };

    const first = await service.refreshSession(identity);
    const second = await service.refreshSession(identity);

    expect(first.csrfToken).not.toBe(second.csrfToken);
    expect(jwtMock.sign).toHaveBeenCalledTimes(2);
    expect(jwtMock.sign).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ session_version: 1 }),
      "jwt-secret",
      expect.any(Object),
    );
  });

  it("logout incrementa somente a versão ativa correspondente", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await new AuthService().revokeSession("user-1", 3);

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", session_version: 3 },
      data: { session_version: { increment: 1 } },
    });
  });

  it("logout rejeita versão de sessão obsoleta", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(new AuthService().revokeSession("user-1", 3)).rejects.toMatchObject({
      statusCode: 401,
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
    prismaMock.user.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(user, data);
        return user;
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
    prismaMock.user.findUnique.mockResolvedValue({
      ...activeUser(),
      session_version: 2,
    });
    const service = new AuthService();

    await expect(
      service.validateSession({ user_id: "user-1", organization_id: "org-1", session_version: 1 }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it.each([
    activeUser({ status: "inactive" }),
    activeUser({ organization: { id: "org-1", status: "inactive" } }),
    activeUser({ department: { organization_id: "org-2" } }),
  ])("rejeita sessão para contexto persistido inválido", async (user) => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("aceita sessão para usuário e organização ativos com associação compatível", async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id: "org-1",
        session_version: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("mantém login e sessão de usuário legado vinculados pela organização do departamento", async () => {
    const legacyUser = activeUser({ organization_id: null, organization: null });
    prismaMock.user.findFirst.mockResolvedValue(legacyUser);
    prismaMock.user.findUnique.mockResolvedValue(legacyUser);
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
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    undefined,
    "org-2",
  ])("rejeita sessão quando a claim de organização está ausente ou não coincide", async (organization_id) => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());

    await expect(
      new AuthService().validateSession({
        user_id: "user-1",
        organization_id,
        session_version: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
