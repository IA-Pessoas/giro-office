import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import { TiTermService } from "../services/tiTermService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const departmentId = "20000000-0000-4000-8000-000000000001";
const termId = "30000000-0000-4000-8000-000000000001";
const TI_ADMIN_PERMISSION = 3;

const context = {
  organizationId,
  userId,
  permission: TI_ADMIN_PERMISSION,
};

describe("TiTermService", () => {
  it("does not expose user password in list results", async () => {
    const prisma = {
      termTecnologia: {
        findMany: vi.fn(async () => [
          {
            id: termId,
            user_id: userId,
            date: new Date("2026-05-19T00:00:00.000Z"),
            user_name: "Maria Silva",
            user_cpf: "12345678900",
            organization_id: organizationId,
            user: {
              id: userId,
              name: "Maria Silva",
              password: "senha-do-usuario",
              organization_id: organizationId,
            },
          },
        ]),
      },
    };
    const service = new TiTermService(prisma as never);

    const result = (await service.list(context, {})) as Array<Record<string, unknown>>;

    expect(result[0]).toMatchObject({
      id: termId,
      user: {
        id: userId,
        name: "Maria Silva",
      },
    });
    expect(result[0]?.user).not.toHaveProperty("password");
  });

  it("derives pending status from signed_at even when reason is filled", async () => {
    const prisma = {
      termTecnologia: {
        findMany: vi.fn(async () => [
          {
            id: termId,
            user_id: userId,
            organization_id: organizationId,
            reason: "Motivo cadastral",
            signed_at: null,
          },
        ]),
      },
    };
    const service = new TiTermService(prisma as never);

    const result = (await service.list(context, {})) as Array<Record<string, unknown>>;

    expect(result[0]).toMatchObject({
      reason: "Motivo cadastral",
      signed_at: null,
      status: "pending",
    });
  });

  it("filters terms by signed_at instead of reason", async () => {
    const prisma = {
      termTecnologia: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiTermService(prisma as never);

    await service.list(context, { status: "signed" });

    expect(prisma.termTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          signed_at: { not: null },
        }),
      }),
    );
  });

  it("forces user filter for viewer permission", async () => {
    const prisma = {
      termTecnologia: {
        findMany: vi.fn(async () => []),
      },
    };
    const service = new TiTermService(prisma as never);

    await service.list(
      { ...context, permission: TiPermissionLevel.Viewer },
      {
        user_id: "90000000-0000-4000-8000-000000000001",
      },
    );

    expect(prisma.termTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: userId,
        }),
      }),
    );
  });

  it("hides another user's term from viewer permission", async () => {
    const prisma = {
      termTecnologia: {
        findFirst: vi.fn(async ({ where }) => ({
          id: where.id,
          organization_id: where.organization_id,
          user_id: "90000000-0000-4000-8000-000000000001",
        })),
      },
    };
    const service = new TiTermService(prisma as never);

    await expect(
      service.getById({ ...context, permission: TiPermissionLevel.Viewer }, termId),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Termo de TI nao encontrado.",
    });
  });

  it("creates term for organization", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn(async () => ({
          id: userId,
          name: "Maria Silva",
          full_name: "Maria Silva",
          cpf: "12345678900",
          organization_id: organizationId,
        })),
      },
      department: {
        findFirst: vi.fn(async () => ({ id: departmentId, organization_id: organizationId })),
      },
      termTecnologia: {
        create: vi.fn(async ({ data }) => ({ id: termId, ...data })),
      },
    };
    const service = new TiTermService(prisma as never);

    const result = await service.create(context, {
      date: "2026-05-19",
      user_id: userId,
      department_id: departmentId,
      asset_code: "NB-001",
    });

    expect(result).toMatchObject({
      id: termId,
      user_id: userId,
      user_name: "Maria Silva",
      user_cpf: "12345678900",
      department_id: departmentId,
      asset_code: "NB-001",
      organization_id: organizationId,
    });
  });

  it("starts a term as pending even when create receives a reason", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn(async () => ({
          id: userId,
          name: "Maria Silva",
          full_name: "Maria Silva",
          cpf: "12345678900",
          organization_id: organizationId,
        })),
      },
      termTecnologia: {
        create: vi.fn(async ({ data }) => ({ id: termId, ...data })),
      },
    };
    const service = new TiTermService(prisma as never);

    const result = (await service.create(context, {
      date: "2026-05-19",
      user_id: userId,
      reason: "Motivo cadastral",
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      reason: "Motivo cadastral",
      signed_at: null,
      status: "pending",
    });
    expect(prisma.termTecnologia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signed_at: null }),
      }),
    );
  });

  it("keeps a term pending when update changes only its reason", async () => {
    const prisma = {
      termTecnologia: {
        findFirst: vi.fn(async () => ({
          id: termId,
          user_id: userId,
          organization_id: organizationId,
          reason: null,
          signed_at: null,
        })),
        update: vi.fn(async ({ where, data }) => ({
          id: where.id,
          user_id: userId,
          organization_id: organizationId,
          signed_at: null,
          ...data,
        })),
      },
    };
    const service = new TiTermService(prisma as never);

    const result = (await service.update(context, termId, {
      reason: "Motivo cadastral atualizado",
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      reason: "Motivo cadastral atualizado",
      signed_at: null,
      status: "pending",
    });
    expect(prisma.termTecnologia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reason: "Motivo cadastral atualizado" },
      }),
    );
  });

  it("normalizes term user identity from linked user on create", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn(async () => ({
          id: userId,
          name: "Maria Login",
          full_name: "Maria Silva",
          cpf: "12345678900",
          organization_id: organizationId,
        })),
      },
      termTecnologia: {
        create: vi.fn(async ({ data }) => ({ id: termId, ...data })),
      },
    };
    const service = new TiTermService(prisma as never);

    const created = (await service.create(context, {
      date: "2026-05-19",
      user_id: userId,
    })) as Record<string, unknown>;

    expect(prisma.termTecnologia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: userId,
          user_name: "Maria Silva",
          user_cpf: "12345678900",
        }),
      }),
    );
    expect(created.user_name).toBe("Maria Silva");
  });

  it("normalizes legacy linked users without CPF to an empty stored CPF", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn(async () => ({
          id: userId,
          name: "Maria Silva",
          full_name: "Maria Silva",
          cpf: null,
          organization_id: organizationId,
        })),
      },
      termTecnologia: {
        create: vi.fn(async ({ data }) => ({ id: termId, ...data })),
      },
    };
    const service = new TiTermService(prisma as never);

    const created = (await service.create(context, {
      date: "2026-05-19",
      user_id: userId,
    })) as Record<string, unknown>;

    expect(created.user_cpf).toBe("");
    expect(prisma.termTecnologia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: userId,
          user_name: "Maria Silva",
          user_cpf: "",
        }),
      }),
    );
  });

  it("signs term with default reason", async () => {
    const prisma = {
      termTecnologia: {
        findFirst: vi.fn(async ({ where }) => ({
          id: where.id,
          organization_id: where.organization_id,
          user_id: userId,
          reason: null,
        })),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
    };
    const service = new TiTermService(prisma as never);

    const result = await service.sign(context, termId, {});

    expect(result).toMatchObject({
      id: termId,
      reason: "Termo assinado pelo usuario.",
      status: "signed",
    });
    expect(result).toEqual(expect.objectContaining({ signed_at: expect.any(Date) }));
    expect(prisma.termTecnologia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "Termo assinado pelo usuario.",
          signed_at: expect.any(Date),
        }),
      }),
    );
  });

  it("hides another user's term when permission 1 signs it", async () => {
    const prisma = {
      termTecnologia: {
        findFirst: vi.fn(async ({ where }) => ({
          id: where.id,
          organization_id: where.organization_id,
          user_id: "90000000-0000-4000-8000-000000000001",
          reason: null,
        })),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
    };
    const service = new TiTermService(prisma as never);

    await expect(service.sign({ ...context, permission: 1 }, termId, {})).rejects.toMatchObject({
      statusCode: 404,
      message: "Termo de TI nao encontrado.",
    });
    expect(prisma.termTecnologia.update).not.toHaveBeenCalled();
  });

  it("allows admin level 2 signing another user's term", async () => {
    const prisma = {
      termTecnologia: {
        findFirst: vi.fn(async ({ where }) => ({
          id: where.id,
          organization_id: where.organization_id,
          user_id: "90000000-0000-4000-8000-000000000001",
          reason: null,
        })),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
    };
    const service = new TiTermService(prisma as never);

    const result = await service.sign(context, termId, {});

    expect(result).toMatchObject({
      id: termId,
      reason: "Termo assinado pelo usuario.",
    });
  });
});
