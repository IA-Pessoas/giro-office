import "./envBootstrap.js";

import { EncryptionService } from "@workspace/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    active: true,
    deactivated_at: null,
    deactivated_by_user_id: null,
    deactivation_reason: null,
    user: {
      id: userId,
      name: "Usuario TI",
      organization_id: organizationId,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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
      where: { organization_id: organizationId, active: true },
    });
    expect(prisma.passwordTecnologia.findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId, active: true },
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

  it.each([
    [undefined, { active: true }],
    ["active", { active: true }],
    ["inactive", { active: false }],
    ["all", {}],
  ] as const)("list maps status %s into one shared predicate", async (status, statusWhere) => {
    const prisma = {
      passwordTecnologia: {
        count: vi.fn(async () => 1),
        findMany: vi.fn(async () => [passwordRecord()]),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    await service.list(context, {
      ...(status ? { status } : {}),
      search: "vpn",
      page: 1,
      page_size: 20,
    });

    const expectedWhere = expect.objectContaining({
      organization_id: organizationId,
      ...statusWhere,
      OR: expect.any(Array),
    });
    expect(prisma.passwordTecnologia.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.passwordTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere, skip: 0, take: 20 }),
    );
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

  it("getById returns not found when the tenant-scoped safe lookup misses", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => null),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    await expect(service.getById(context, passwordId)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.passwordTecnologia.findFirst).toHaveBeenCalledWith({
      where: { id: passwordId, organization_id: organizationId },
      include: expect.any(Object),
    });
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

  it("rejects inactive reveal before decrypt", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => ({ ...passwordRecord(), active: false })),
      },
    };
    const decrypt = vi.spyOn(encryption, "decrypt");
    const service = new TiPasswordService(prisma as never, encryption);

    await expect(service.getById(context, passwordId)).rejects.toMatchObject({ statusCode: 409 });
    expect(decrypt).not.toHaveBeenCalled();
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
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(passwordRecord())
          .mockResolvedValueOnce({ ...passwordRecord(), notes: "Atualizado" }),
        updateMany: vi.fn(async () => ({ count: 1 })),
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
    expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledWith({
      where: { id: passwordId, organization_id: organizationId, active: true },
      data: { user_id: userId, notes: "Atualizado" },
    });
  });

  it("rejects inactive update before user validation, encryption, or mutation", async () => {
    const inactive = { ...passwordRecord(), active: false };
    const prisma = {
      user: { findFirst: vi.fn() },
      passwordTecnologia: {
        findFirst: vi.fn(async () => inactive),
        updateMany: vi.fn(),
      },
    };
    const encrypt = vi.spyOn(encryption, "encrypt");
    const service = new TiPasswordService(prisma as never, encryption);

    await expect(
      service.update(context, passwordId, { user_id: userId, password: "replacement" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
    expect(prisma.passwordTecnologia.updateMany).not.toHaveBeenCalled();
  });

  it("uses tenant and active state in the final update predicate", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(passwordRecord())
          .mockResolvedValueOnce({ ...passwordRecord(), notes: "Updated" }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    await service.update(context, passwordId, { notes: "Updated" });

    expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledWith({
      where: { id: passwordId, organization_id: organizationId, active: true },
      data: { notes: "Updated" },
    });
  });

  it("returns conflict when deactivation wins the update race", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => passwordRecord()),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    await expect(service.update(context, passwordId, { notes: "Too late" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("atomically deactivates with tenant, actor, one timestamp, and safe output", async () => {
    const deactivatedAt = new Date("2026-07-27T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(deactivatedAt);
    const inactive = {
      ...passwordRecord(),
      active: false,
      deactivated_at: deactivatedAt,
      deactivated_by_user_id: userId,
      deactivation_reason: "Vendor retired",
    };
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn().mockResolvedValueOnce(passwordRecord()).mockResolvedValueOnce(inactive),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const decrypt = vi.spyOn(encryption, "decrypt");
    const service = new TiPasswordService(prisma as never, encryption);

    const result = (await service.deactivate(context, passwordId, {
      reason: "Vendor retired",
    })) as Record<string, unknown>;

    expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledWith({
      where: { id: passwordId, organization_id: organizationId, active: true },
      data: {
        active: false,
        deactivated_at: deactivatedAt,
        deactivated_by_user_id: userId,
        deactivation_reason: "Vendor retired",
      },
    });
    expect(result).toMatchObject({
      id: passwordId,
      active: false,
      deactivated_by_user_id: userId,
      deactivation_reason: "Vendor retired",
    });
    expect(result).not.toHaveProperty("password");
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("rejects repeated deactivation without touching the original audit", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => ({
          ...passwordRecord(),
          active: false,
          deactivated_at: new Date("2026-07-27T12:00:00.000Z"),
          deactivated_by_user_id: "first-admin",
          deactivation_reason: "First reason",
        })),
        updateMany: vi.fn(),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    await expect(
      service.deactivate(context, passwordId, { reason: "Second reason" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.passwordTecnologia.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a losing concurrent deactivation without a second write", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => passwordRecord()),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    await expect(
      service.deactivate(context, passwordId, { reason: "Losing reason" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns the same not-found result for cross-tenant or missing IDs", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => null),
      },
    };
    const service = new TiPasswordService(prisma as never, encryption);

    await expect(
      service.deactivate(context, passwordId, { reason: "Not accessible" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.passwordTecnologia.findFirst).toHaveBeenCalledWith({
      where: { id: passwordId, organization_id: organizationId },
      include: expect.any(Object),
    });
  });

  it("wraps an unexpected deactivation database failure without exposing a secret", async () => {
    const prisma = {
      passwordTecnologia: {
        findFirst: vi.fn(async () => passwordRecord()),
        updateMany: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      },
    };
    const decrypt = vi.spyOn(encryption, "decrypt");
    const service = new TiPasswordService(prisma as never, encryption);

    await expect(
      service.deactivate(context, passwordId, { reason: "Vendor retired" }),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Erro ao inativar senha de TI.",
    });
    expect(decrypt).not.toHaveBeenCalled();
  });
});
