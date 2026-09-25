import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiExtensionService } from "../services/tiExtensionService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";

const context = {
  organizationId,
  userId,
  permission: 2,
};

describe("TiExtensionService", () => {
  it("does not expose user password in list results", async () => {
    const prisma = {
      extensionsTecnologia: {
        findMany: vi.fn(async () => [
          {
            id: "extension-1",
            user_id: userId,
            number: "1234",
            organization_id: organizationId,
            user: {
              id: userId,
              name: "Usuario TI",
              password: "senha-do-usuario",
              organization_id: organizationId,
            },
          },
        ]),
      },
    };
    const service = new TiExtensionService(prisma as never);

    const result = (await service.list(context, {})) as Array<Record<string, unknown>>;

    expect(result[0]).toMatchObject({
      id: "extension-1",
      user: {
        id: userId,
        name: "Usuario TI",
      },
    });
    expect(result[0]?.user).not.toHaveProperty("password");
  });

  it("creates extension with unique number", async () => {
    const prisma = {
      extensionsTecnologia: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "extension-1", ...data })),
      },
      user: {
        findFirst: vi.fn(async ({ where }) => ({
          id: where.id,
          organization_id: where.organization_id,
        })),
      },
    };
    const service = new TiExtensionService(prisma as never);

    const result = await service.create(context, {
      user_id: userId,
      number: "1234",
    });

    expect(result).toMatchObject({
      id: "extension-1",
      user_id: userId,
      number: "1234",
      organization_id: organizationId,
    });
  });

  it("throws 409 for duplicated number in organization", async () => {
    const prisma = {
      extensionsTecnologia: {
        findFirst: vi.fn(async () => ({ id: "extension-1" })),
      },
      user: {
        findFirst: vi.fn(async () => ({ id: userId, organization_id: organizationId })),
      },
    };
    const service = new TiExtensionService(prisma as never);

    await expect(
      service.create(context, {
        user_id: userId,
        number: "1234",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Já existe um ramal de TI com este número.",
    });
  });
});
