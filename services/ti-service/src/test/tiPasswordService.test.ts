import "./envBootstrap.js";

import { EncryptionService } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { TiPasswordService } from "../services/tiPasswordService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const passwordId = "40000000-0000-4000-8000-000000000001";
const TI_ADMIN_PERMISSION = 2;

const context = {
  organizationId,
  userId,
  permission: TI_ADMIN_PERMISSION,
};
const encryption = new EncryptionService("MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=");

function passwordRecord() {
  return {
    id: passwordId,
    local: "VPN",
    user_id: userId,
    password: encryption.encrypt("segredo-vpn"),
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
        count: vi.fn(async () => 1),
        findMany: vi.fn(async () => [passwordRecord()]),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    const result = (await service.list(context, {})) as {
      items: Array<Record<string, unknown>>;
      total: number;
      page: number;
      page_size: number;
      hasMore: boolean;
    };

    expect(result).toMatchObject({ total: 1, page: 1, page_size: 50, hasMore: false });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("password");
    expect(result.items[0]).toMatchObject({ id: passwordId, local: "VPN", user_id: userId });
    expect(prisma.passwordTecnologia.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
    });
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
      skip: 0,
      take: 50,
    });
  });

  it("list busca por local, usuario e notas antes da paginacao", async () => {
    const prisma = {
      passwordTecnologia: {
        count: vi.fn(async () => 12),
        findMany: vi.fn(async () => [passwordRecord()]),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    const result = (await service.list(context, {
      search: "discord",
      page: 2,
      page_size: 10,
    })) as {
      items: Array<Record<string, unknown>>;
      total: number;
      page: number;
      page_size: number;
      hasMore: boolean;
    };

    expect(result).toMatchObject({ total: 12, page: 2, page_size: 10, hasMore: true });
    expect(prisma.passwordTecnologia.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organization_id: organizationId,
        OR: expect.arrayContaining([
          { local: { contains: "discord", mode: "insensitive" } },
          { notes: { contains: "discord", mode: "insensitive" } },
          {
            user: {
              is: {
                OR: [
                  { name: { contains: "discord", mode: "insensitive" } },
                  { full_name: { contains: "discord", mode: "insensitive" } },
                ],
              },
            },
          },
        ]),
      }),
    });
    expect(prisma.passwordTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
  });

  it("getById omite password para permissao menor que admin", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => passwordRecord()),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    const result = (await service.getById({ ...context, permission: 1 }, passwordId)) as Record<
      string,
      unknown
    >;

    expect(result).not.toHaveProperty("password");
    expect(result).toMatchObject({ id: passwordId, local: "VPN" });
  });

  it("getById retorna password para permissao administrativa 2", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => passwordRecord()),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

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
    const service = new TiPasswordService(prisma as never, encryption);

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
      organization_id: organizationId,
    });
    expect(result).not.toHaveProperty("password");
    expect(prisma.passwordTecnologia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        password: expect.not.stringMatching(/^segredo-vpn$/),
      }),
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
    const service = new TiPasswordService(prisma as never, encryption);

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
