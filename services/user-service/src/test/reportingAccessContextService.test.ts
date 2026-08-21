import { ServiceError } from "@workspace/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, permissionServiceMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
    },
  },
  permissionServiceMock: {
    getByUserId: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

vi.mock("../services/permissionService.js", () => ({
  PermissionService: vi.fn(function PermissionService() {
    return permissionServiceMock;
  }),
}));

import { UserService } from "../services/userService.js";

const userId = "a0000000-0000-4000-8000-000000000001";
const organizationId = "b0000000-0000-4000-8000-000000000002";

describe("UserService.getReportingAccessContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reavalia departamento e módulos atuais no escopo da organização", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: userId,
      name: "Ana",
      login: "ana@example.com",
      type: "admin",
      department: {
        id: "c0000000-0000-4000-8000-000000000003",
        name: "Contabilidade",
        organization: { id: organizationId, name: "Acme" },
      },
    });
    permissionServiceMock.getByUserId.mockResolvedValue({
      contabil: 3,
      fiscal: null,
      rh: 1,
      atendimento: 3,
    });

    const result = await new UserService().getReportingAccessContext(userId, organizationId);

    expect(result).toEqual({
      user: { id: userId, name: "Ana", login: "ana@example.com" },
      organization: { id: organizationId, name: "Acme" },
      type: "admin",
      department: {
        id: "c0000000-0000-4000-8000-000000000003",
        name: "Contabilidade",
      },
      departmentModule: "contabil",
      modules: expect.objectContaining({ contabil: 3, fiscal: 0, rh: 1 }),
    });
    expect(result.modules).not.toHaveProperty("atendimento");
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: userId,
          department: { organization_id: organizationId },
        }),
      }),
    );
    expect(permissionServiceMock.getByUserId).toHaveBeenCalledWith(
      userId,
      undefined,
      organizationId,
    );
  });

  it("rejeita usuário, departamento ou organização incompatíveis sem devolver contexto parcial", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      new UserService().getReportingAccessContext(userId, organizationId),
    ).rejects.toEqual(expect.objectContaining(new ServiceError(404, "Usuario nao encontrado.")));
    expect(permissionServiceMock.getByUserId).not.toHaveBeenCalled();
  });
});
