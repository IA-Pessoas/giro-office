import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiTermService } from "../services/tiTermService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const departmentId = "20000000-0000-4000-8000-000000000001";
const termId = "30000000-0000-4000-8000-000000000001";
const TI_ADMIN_PERMISSION = 2;

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

  it("creates term for organization", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn(async () => ({ id: userId, organization_id: organizationId })),
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
      user_name: "Maria Silva",
      user_cpf: "12345678900",
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
    });
  });

  it("rejects permission 1 signing another user's term", async () => {
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
      statusCode: 403,
      message: "Permissao insuficiente para assinar termo de outro usuario.",
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
