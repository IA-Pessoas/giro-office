import "./envBootstrap.js";

import type { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { TiRequestCategoryService } from "../services/tiRequestCategoryService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

describe("TiRequestCategoryService", () => {
  it("creates an active category scoped to organization", async () => {
    const prisma = {
      tICategoryRequest: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "cat-1", ...data })),
      },
    };
    const service = new TiRequestCategoryService(prisma as never);

    const result = await service.create({ organizationId }, { name: "Hardware" });

    expect(result).toMatchObject({
      id: "cat-1",
      name: "Hardware",
      active: true,
      organization_id: organizationId,
    });
    expect(prisma.tICategoryRequest.create).toHaveBeenCalledWith({
      data: {
        name: "Hardware",
        active: true,
        organization_id: organizationId,
      },
    });
  });

  it("throws 409 for active duplicate category", async () => {
    const prisma = {
      tICategoryRequest: {
        findFirst: vi.fn(async () => ({ id: "cat-1" })),
        create: vi.fn(),
      },
    };
    const service = new TiRequestCategoryService(prisma as never);

    await expect(service.create({ organizationId }, { name: "Hardware" })).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
  });
});
