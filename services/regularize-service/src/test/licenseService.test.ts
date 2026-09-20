import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateLicenseBody } from "../schemas/license.schemas.js";
import { listLicensesQuerySchema } from "../schemas/license.schemas.js";
import { getLicenseDueDateBounds } from "../schemas/status.schemas.js";
import type { LicenseProtocolStorage } from "../services/licenseProtocolStorage.js";
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
      select: expect.any(Object),
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { organization_id: "org-1", status: "Ativo" },
      orderBy: { entry_date: "desc" },
      select: expect.any(Object),
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
      select: expect.any(Object),
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
        select: expect.any(Object),
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

  it("ativa o novo protocolo no banco antes de remover o anterior e audita só metadados", async () => {
    const events: string[] = [];
    const oldPath =
      "regularize/organizations/org-1/licenses/license-1/protocols/10000000-0000-4000-8000-000000000001.pdf";
    const newPath =
      "regularize/organizations/org-1/licenses/license-1/protocols/20000000-0000-4000-8000-000000000002.pdf";
    const logsCreate = vi.fn(async () => {
      events.push("audit");
      return {};
    });
    const transaction = {
      license: {
        updateMany: vi.fn(async () => {
          events.push("db");
          return { count: 1 };
        }),
      },
      logs: { create: logsCreate },
    };
    const prisma = {
      license: {
        findFirst: vi.fn(async () => ({ id: "license-1", protocol_file_path: oldPath })),
      },
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<void>) =>
        operation(transaction),
      ),
    } as unknown as PrismaClient;
    const storage = {
      upload: vi.fn(async () => {
        events.push("upload");
        return newPath;
      }),
      deleteObject: vi.fn(async (objectPath: string) => {
        events.push(`delete:${objectPath}`);
      }),
      createSignedAccessUrl: vi.fn(),
    } as unknown as LicenseProtocolStorage;
    const service = new LicenseService(prisma, {} as never, storage);

    const result = await service.replaceProtocol({
      organizationId: "org-1",
      userId: "user-1",
      licenseId: "license-1",
      file: {
        buffer: Buffer.from("%PDF-1.7"),
        mimetype: "application/pdf",
        originalname: "protocolo.pdf",
        size: 8,
      },
    });

    expect(events).toEqual(["upload", "db", "audit", `delete:${oldPath}`]);
    expect(result).toMatchObject({
      original_name: "protocolo.pdf",
      mime_type: "application/pdf",
      size_bytes: 8,
    });
    expect(result).not.toHaveProperty("path");
    expect(logsCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "Substituição de protocolo",
        changes: {
          had_previous_protocol: true,
          mime_type: "application/pdf",
          size_bytes: 8,
        },
      }),
    });
  });

  it("limpa o arquivo novo e preserva o anterior quando a transação falha", async () => {
    const oldPath =
      "regularize/organizations/org-1/licenses/license-1/protocols/10000000-0000-4000-8000-000000000001.pdf";
    const newPath =
      "regularize/organizations/org-1/licenses/license-1/protocols/20000000-0000-4000-8000-000000000002.pdf";
    const prisma = {
      license: {
        findFirst: vi.fn(async () => ({ id: "license-1", protocol_file_path: oldPath })),
      },
      $transaction: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    } as unknown as PrismaClient;
    const storage = {
      upload: vi.fn(async () => newPath),
      deleteObject: vi.fn(async () => undefined),
      createSignedAccessUrl: vi.fn(),
    } as unknown as LicenseProtocolStorage;
    const service = new LicenseService(prisma, {} as never, storage);

    await expect(
      service.replaceProtocol({
        organizationId: "org-1",
        userId: "user-1",
        licenseId: "license-1",
        file: {
          buffer: Buffer.from("%PDF-1.7"),
          mimetype: "application/pdf",
          originalname: "protocolo.pdf",
          size: 8,
        },
      }),
    ).rejects.toThrow("database unavailable");

    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(newPath);
    expect(storage.deleteObject).not.toHaveBeenCalledWith(oldPath);
  });

  it("gera acesso assinado apenas para a licença da organização", async () => {
    const objectPath =
      "regularize/organizations/org-1/licenses/license-1/protocols/10000000-0000-4000-8000-000000000001.pdf";
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ protocol_file_path: objectPath })
      .mockResolvedValueOnce(null);
    const prisma = { license: { findFirst } } as unknown as PrismaClient;
    const storage = {
      upload: vi.fn(),
      deleteObject: vi.fn(),
      createSignedAccessUrl: vi.fn(async () => "https://storage.example/signed"),
    } as unknown as LicenseProtocolStorage;
    const service = new LicenseService(prisma, {} as never, storage);

    await expect(
      service.createProtocolAccess({ organizationId: "org-1", licenseId: "license-1" }),
    ).resolves.toEqual({
      url: "https://storage.example/signed",
      expires_in_seconds: 300,
    });
    await expect(
      service.createProtocolAccess({ organizationId: "org-2", licenseId: "license-1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { id: "license-1", organization_id: "org-2" },
      select: { protocol_file_path: true },
    });
    expect(storage.createSignedAccessUrl).toHaveBeenCalledTimes(1);
  });
});
