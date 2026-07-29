import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock, jwtMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    userOrganization: {
      create: vi.fn(),
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

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login lança 401 quando usuário não existe", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const service = new AuthService();

    await expect(service.login({ login: "admin", password: "secret" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("login retorna sessão com token quando credenciais são válidas", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Admin",
      login: "admin",
      password: "hash",
      permission: 2,
      type: "admin",
      department_id: "dep-1",
      organization_id: "org-1",
      department: { organization_id: "org-1" },
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
    });
    bcryptMock.compare.mockResolvedValue(true);
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

  it("login carrega somente a permissão da organização ativa", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Usuário",
      login: "user",
      password: "hash",
      permission: 0,
      type: "user",
      department_id: "dep-1",
      organization_id: "org-b",
      department: { organization_id: "org-b" },
      permissions: [
        { organization_id: "org-a", fiscal: 3 },
        { organization_id: "org-b", fiscal: 1 },
      ],
    });
    bcryptMock.compare.mockResolvedValue(true);
    jwtMock.sign.mockReturnValue("jwt-token");
    const service = new AuthService();

    const result = await service.login({ login: "user", password: "secret" });

    expect(result.organization_id).toBe("org-b");
    expect(result.modules.fiscal).toBe(1);
    expect(result.modules.comercial).toBe(0);
  });

  it("createSession emite token com a organização e o departamento selecionados", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Usuário",
      login: "user",
      password: "hash",
      permission: 1,
      status: "active",
      type: "user",
      session_version: 4,
      permissions: [{ organization_id: "org-b", fiscal: 2 }],
    });
    jwtMock.sign.mockReturnValue("jwt-org-b");
    const service = new AuthService();

    const result = await service.createSession({
      userId: "user-1",
      organizationId: "org-b",
      departmentId: "dep-b",
    });

    expect(result).toMatchObject({
      organization_id: "org-b",
      department_id: "dep-b",
      token: "jwt-org-b",
      modules: { fiscal: 2 },
    });
    expect(jwtMock.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-b",
        session_version: 4,
        modules: expect.objectContaining({ fiscal: 2 }),
      }),
      "jwt-secret",
      expect.any(Object),
    );
  });

  it("firstCreate cria admin inicial quando banco está vazio", async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    prismaMock.organization.findFirst.mockResolvedValue({ id: "org-1" });
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-1" });
    bcryptMock.hash.mockResolvedValue("hashed");
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
    prismaMock.user.findUnique.mockResolvedValue({ status: "active", session_version: 2 });
    const service = new AuthService();

    await expect(
      service.validateSession({ user_id: "user-1", session_version: 1 }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
