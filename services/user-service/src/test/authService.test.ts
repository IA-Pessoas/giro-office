import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock, jwtMock } = vi.hoisted(() => ({
  prismaMock: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (action: (transaction: unknown) => unknown) => {
      return await action(prismaMock);
    }),
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
    department: {
      findFirst: vi.fn(),
    },
  },
  bcryptMock: {
    compare: vi.fn(),
    hash: vi.fn(),
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

vi.mock("bcryptjs", () => ({
  default: bcryptMock,
}));

vi.mock("jsonwebtoken", () => ({
  default: jwtMock,
}));

import { AuthService } from "../services/authService.js";
import { UserService } from "../services/userService.js";

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([]);
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

  function loginSession(overrides: Record<string, unknown> = {}) {
    return {
      id: "user-1",
      name: "Usuário ativo",
      login: "account",
      permission: 1,
      type: "user",
      session_version: 1,
      department_id: "dep-1",
      organization_id: "org-1",
      modules: { ti: 1 },
      ...overrides,
    };
  }

  it("login lança 401 quando usuário não existe", async () => {
    const service = new AuthService();

    await expect(service.login({ login: "admin", password: "secret" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("login mantém a mesma falha pública para credencial ou contexto inválido", async () => {
    const failures: Array<{ statusCode: number; code: string; message: string }> = [];

    for (let attempt = 0; attempt < 5; attempt += 1) {
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
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(5);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(bcryptMock.compare).not.toHaveBeenCalled();
  });

  it("login retorna sessão com token quando credenciais são válidas", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      loginSession({
        name: "Admin",
        login: "admin",
        permission: 2,
        type: "admin",
        modules: { ti: 2 },
      }),
    ]);
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

  it("login delega a verificação de credenciais para a função privada do banco", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      loginSession({
        name: "Admin",
        login: "admin",
        permission: 2,
        type: "admin",
        modules: { ti: 2 },
      }),
    ]);
    jwtMock.sign.mockReturnValue("jwt-token");

    await expect(
      new AuthService().login({ login: "  admin  ", password: "secret" }),
    ).resolves.toMatchObject({
      id: "user-1",
      organization_id: "org-1",
      token: "jwt-token",
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(bcryptMock.compare).not.toHaveBeenCalled();
  });

  it("login carrega somente a permissão da organização ativa", async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      loginSession({
        name: "Usuário",
        login: "user",
        permission: 0,
        type: "user",
        organization_id: "org-b",
        modules: { fiscal: 1 },
      }),
    ]);
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
    bcryptMock.hash.mockImplementation(async (password: string) => `hash:${password}`);
    bcryptMock.compare.mockImplementation(
      async (password: string, hash: string) => hash === `hash:${password}`,
    );
    prismaMock.$queryRaw.mockImplementation(
      async (_query: TemplateStringsArray, _login: string, password: string) =>
        user.password === `hash:${password}` ? [loginSession({ login: "user" })] : [],
    );
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

  it("validateSession fixa o tenant antes de consultar o usuário", async () => {
    prismaMock.user.findUnique.mockResolvedValue(activeUser());

    await new AuthService().validateSession({
      user_id: "user-1",
      organization_id: "org-1",
      session_version: 1,
    });

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.$executeRaw).toHaveBeenCalledBefore(prismaMock.user.findUnique);
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
