import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock, jwtMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
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
});
