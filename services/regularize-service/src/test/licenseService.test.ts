import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { listLicensesQuerySchema } from "../schemas/license.schemas.js";
import { LicenseService } from "../services/licenseService.js";

describe("LicenseService", () => {
  it("omits the status filter for Todos and preserves explicit status filters", async () => {
    const findMany = vi.fn(async () => [{ status: "Ativo" }, { status: "Vencido" }]);
    const prisma = {
      license: { findMany },
    } as unknown as PrismaClient;
    const service = new LicenseService(prisma, {} as never);

    const allLicenses = await service.list({
      organizationId: "org-1",
      status: "Todos",
      page: 1,
      limit: 20,
      paginationRequested: false,
    });
    await service.list({
      organizationId: "org-1",
      status: "Ativo",
      page: 1,
      limit: 20,
      paginationRequested: false,
    });

    expect(allLicenses).toEqual([{ status: "Ativo" }, { status: "Vencido" }]);

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { organization_id: "org-1" },
      orderBy: { entry_date: "desc" },
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { organization_id: "org-1", status: "Ativo" },
      orderBy: { entry_date: "desc" },
    });

    expect(listLicensesQuerySchema.safeParse({ status: "Desconhecido" }).success).toBe(false);
  });

  it("returns paginated licenses with hasMore when pagination is requested", async () => {
    const findMany = vi.fn(async () => [{ id: "license-1", status: "Ativo" }]);
    const count = vi.fn(async () => 25);
    const prisma = {
      license: { findMany, count },
    } as unknown as PrismaClient;
    const service = new LicenseService(prisma, {} as never);

    const page = await service.list({
      organizationId: "org-1",
      status: "Ativo",
      page: 2,
      limit: 10,
      paginationRequested: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", status: "Ativo" },
      orderBy: { entry_date: "desc" },
      skip: 10,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({
      where: { organization_id: "org-1", status: "Ativo" },
    });
    expect(page).toEqual({
      data: [{ id: "license-1", status: "Ativo" }],
      total: 25,
      page: 2,
      limit: 10,
      hasMore: true,
    });
  });
});
