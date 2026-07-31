import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { LicenseService } from "../services/licenseService.js";

describe("LicenseService", () => {
  it("omits the status filter for Todos and preserves explicit status filters", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = {
      license: { findMany },
    } as unknown as PrismaClient;
    const service = new LicenseService(prisma, {} as never);

    await service.list("org-1", "Todos");
    await service.list("org-1", "Ativo");

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { organization_id: "org-1" },
      orderBy: { entry_date: "desc" },
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { organization_id: "org-1", status: "Ativo" },
      orderBy: { entry_date: "desc" },
    });
  });
});
