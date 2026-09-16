import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLicenseBody } from "../schemas/license.schemas.js";
import { listLicensesQuerySchema } from "../schemas/license.schemas.js";
import { getLicenseDueDateBounds } from "../schemas/status.schemas.js";
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

  it("applies due-date filters without treating derived states as stored status", async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    const prisma = {
      license: { findMany, count },
    } as unknown as PrismaClient;
    const service = new LicenseService(prisma, {} as never);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));

    try {
      await service.list({
        organizationId: "org-1",
        status: "Vencido",
        page: 1,
        limit: 20,
        paginationRequested: true,
      });

      const expectedWhere = {
        organization_id: "org-1",
        due_date: { lt: getLicenseDueDateBounds().today },
      };
      expect(findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: { entry_date: "desc" },
        skip: 0,
        take: 20,
      });
      expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a task from another organization before creating a license", async () => {
    const create = vi.fn();
    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1" })),
      },
      task: {
        findFirst: vi.fn(async () => null),
      },
      license: {
        findFirst: vi.fn(async () => null),
        create,
      },
      user: {
        findFirst: vi.fn(async () => null),
      },
    } as unknown as PrismaClient;
    const service = new LicenseService(prisma, {} as never);
    const body: CreateLicenseBody = {
      client_id: "client-1",
      has: true,
      type_license: "Alvará",
      entry_date: new Date("2026-01-01T00:00:00.000Z"),
      protocol: "PROTO-1",
      status: "Em Processo de Solicitação",
      current_situation: "Em análise",
      contact: "contato",
      urgency: "Normal",
      type: "Municipal",
      task_id: "task-from-other-org",
    };

    await expect(
      service.create({
        organizationId: "org-1",
        userId: "user-1",
        body,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(create).not.toHaveBeenCalled();
  });
});
