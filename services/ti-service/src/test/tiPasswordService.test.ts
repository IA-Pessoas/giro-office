import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiPasswordService } from "../services/tiPasswordService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const passwordId = "40000000-0000-4000-8000-000000000001";

const context = {
  organizationId,
  userId,
  permission: 3,
};

function passwordRecord() {
  return {
    id: passwordId,
    local: "VPN",
    user_id: userId,
    password: "segredo-vpn",
    notes: "Acesso remoto",
    organization_id: organizationId,
    user: {
      id: userId,
      name: "Usuario TI",
      organization_id: organizationId,
    },
  };
}

describe("TiPasswordService", () => {
  it("list omite password dos resultados", async () => {
    const prisma = {
      passwordTecnologia: {
        findMany: vi.fn(async () => [passwordRecord()]),
      },
    };
    const service = new TiPasswordService(prisma as never);

    const result = (await service.list(context, {})) as Array<Record<string, unknown>>;

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("password");
    expect(result[0]).toMatchObject({ id: passwordId, local: "VPN", user_id: userId });
    expect(prisma.passwordTecnologia.findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            full_name: true,
            department_id: true,
            organization_id: true,
          },
        },
      },
      orderBy: { local: "asc" },
    });
  });

  it("getById omite password para permissao menor que 3", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => passwordRecord()),
      },
    };
    const service = new TiPasswordService(prisma as never);

    const result = (await service.getById({ ...context, permission: 1 }, passwordId)) as Record<
      string,
      unknown
    >;

    expect(result).not.toHaveProperty("password");
    expect(result).toMatchObject({ id: passwordId, local: "VPN" });
  });

  it("getById retorna password para permissao 3", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => passwordRecord()),
      },
    };
    const service = new TiPasswordService(prisma as never);

    const result = (await service.getById(context, passwordId)) as Record<string, unknown>;

    expect(result).toMatchObject({ id: passwordId, password: "segredo-vpn" });
  });

  it("create valida usuario na mesma organizacao", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn(async () => ({ id: userId, organization_id: organizationId })),
      },
      passwordTecnologia: {
        create: vi.fn(async ({ data }) => ({ id: passwordId, ...data })),
      },
    };
    const service = new TiPasswordService(prisma as never);

    const result = await service.create(context, {
      local: "VPN",
      user_id: userId,
      password: "segredo-vpn",
      notes: "Acesso remoto",
    });

    expect(result).toMatchObject({
      id: passwordId,
      local: "VPN",
      user_id: userId,
      password: "segredo-vpn",
      organization_id: organizationId,
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: userId, organization_id: organizationId },
    });
  });

  it("update valida usuario informado na mesma organizacao", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn(async () => ({ id: userId, organization_id: organizationId })),
      },
      passwordTecnologia: {
        findFirst: vi.fn(async () => passwordRecord()),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...passwordRecord(), ...data })),
      },
    };
    const service = new TiPasswordService(prisma as never);

    const result = await service.update(context, passwordId, {
      user_id: userId,
      notes: "Atualizado",
    });

    expect(result).toMatchObject({ id: passwordId, user_id: userId, notes: "Atualizado" });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: userId, organization_id: organizationId },
    });
  });
});
