import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { listLicensesQuerySchema } from "../schemas/license.schemas.js";
import { LicenseService } from "../services/licenseService.js";

describe("LicenseService", () => {
  it("omits the status filter for Todos and preserves explicit status filters", async () => {
    const findMany = vi.fn(async () => [
      { status: "Ativo" },
      { status: "Vencido" },
    ]);
    const prisma = {
      license: { findMany },
    } as unknown as PrismaClient;
    const service = new LicenseService(prisma, {} as never);

    const allLicenses = await service.list("org-1", "Todos");
    await service.list("org-1", "Ativo");

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
});
