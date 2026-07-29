import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    userOrganization: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    permission: {
      findFirst: vi.fn(),
    },
  },
}));

const { authServiceMock } = vi.hoisted(() => ({
  authServiceMock: { createSession: vi.fn() },
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

vi.mock("../services/authService.js", () => ({
  AuthService: vi.fn(function AuthService() {
    return authServiceMock;
  }),
}));

import { UserOrganizationService } from "../services/userOrganizationService.js";

describe("UserOrganizationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista apenas associações ativas do usuário", async () => {
    prismaMock.userOrganization.findMany.mockResolvedValue([
      {
        user_id: "user-1",
        organization_id: "org-a",
        status: "active",
        department_id: "department-a",
        organization: { id: "org-a", name: "Organização A", slug: "org-a", status: "active" },
        department: { id: "department-a", organization_id: "org-a" },
      },
    ]);
    const service = new UserOrganizationService();

    const result = await service.listForUser("user-1");

    expect(result).toEqual([
      {
        organization_id: "org-a",
        name: "Organização A",
        slug: "org-a",
        status: "active",
        department_id: "department-a",
      },
    ]);
    expect(prismaMock.userOrganization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: "user-1",
          status: "active",
          organization: { status: "active" },
        },
      }),
    );
  });

  it("rejeita troca para organização sem associação ativa", async () => {
    prismaMock.userOrganization.findFirst.mockResolvedValue(null);
    const service = new UserOrganizationService();

    await expect(service.switchOrganization("user-1", "org-b")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMock.userOrganization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: "user-1", organization_id: "org-b", status: "active" },
      }),
    );
  });

  it("emite sessão com departamento e permissões da organização selecionada", async () => {
    prismaMock.userOrganization.findFirst.mockResolvedValue({
      organization_id: "org-b",
      department_id: "department-b",
      organization: { status: "active" },
      department: { id: "department-b", organization_id: "org-b" },
    });
    prismaMock.permission.findFirst.mockResolvedValue({ id: "permission-b" });
    authServiceMock.createSession.mockResolvedValue({
      organization_id: "org-b",
      department_id: "department-b",
      modules: { ti: 2 },
      token: "jwt-b",
    });
    const service = new UserOrganizationService();

    const result = await service.switchOrganization("user-1", "org-b");

    expect(result).toMatchObject({ organization_id: "org-b", department_id: "department-b" });
    expect(prismaMock.permission.findFirst).toHaveBeenCalledWith({
      where: { user_id: "user-1", organization_id: "org-b" },
      select: { id: true },
    });
    expect(authServiceMock.createSession).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-b",
      departmentId: "department-b",
    });
  });
});
