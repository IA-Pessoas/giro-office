import type { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { deriveReportCatalogGrant } from "../catalog/types.js";
import { ReportModelService } from "../services/reportModelService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
const definition = {
  sources: ["finance.ledger"],
  columns: [{ source: "finance.ledger", field: "balance", alias: "balance" }],
  joins: [],
  parameters: [],
  filters: [],
  filter_groups: [],
  aggregations: [],
  order_by: [],
};

describe("ReportModelService", () => {
  it("mantém no grant a fonte usada somente por uma relação", () => {
    expect(
      deriveReportCatalogGrant({
        ...definition,
        sources: ["finance.ledger", "finance.accounts"],
        joins: [{ relation: "ledger-account", type: "inner" }],
      }),
    ).toEqual({
      sources: { "finance.ledger": ["balance"], "finance.accounts": [] },
      relations: ["ledger-account"],
    });
  });

  it("cria modelo compartilhado no departamento autorizado", async () => {
    const transaction = {
      reportModel: {
        create: vi.fn().mockResolvedValue({ id: "shared-model-1" }),
      },
      reportModelVersion: {
        create: vi.fn().mockResolvedValue({
          id: "shared-version-1",
          version: 1,
          definition_json: definition,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new ReportModelService(prisma as never);

    await expect(
      service.createShared({
        organizationId,
        departmentId: "department-1",
        name: "Saldo compartilhado",
        definition,
      }),
    ).resolves.toMatchObject({
      id: "shared-model-1",
      department_id: "department-1",
      version: 1,
      definition,
      grant: { sources: { "finance.ledger": ["balance"] }, relations: [] },
    });
    expect(transaction.reportModel.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        department_id: "department-1",
        name: "Saldo compartilhado",
      },
    });
  });

  it("lista somente modelos compartilhados do departamento atual", async () => {
    const prisma = {
      reportModel: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ReportModelService(prisma as never);

    await expect(
      service.listShared({ organizationId, departmentId: "department-1" }),
    ).resolves.toEqual([]);

    expect(prisma.reportModel.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        department_id: "department-1",
      },
      orderBy: { updated_at: "desc" },
    });
  });

  it("edita modelo compartilhado criando nova versão sem mudar departamento", async () => {
    const transaction = {
      reportModel: {
        findFirst: vi.fn().mockResolvedValue({
          id: "shared-model-1",
          organization_id: organizationId,
          department_id: "department-1",
          name: "Saldo",
        }),
        update: vi.fn().mockResolvedValue({
          id: "shared-model-1",
          organization_id: organizationId,
          department_id: "department-1",
          name: "Novo saldo",
        }),
      },
      reportModelVersion: {
        findFirst: vi.fn().mockResolvedValue({ version: 1 }),
        create: vi.fn().mockResolvedValue({ version: 2, definition_json: definition }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new ReportModelService(prisma as never);

    await expect(
      service.updateShared({
        id: "shared-model-1",
        organizationId,
        departmentId: "department-1",
        name: "Novo saldo",
        definition,
      }),
    ).resolves.toMatchObject({ version: 2, department_id: "department-1" });

    expect(transaction.reportModel.update).toHaveBeenCalledWith({
      where: { id: "shared-model-1" },
      data: { name: "Novo saldo" },
    });
    expect(transaction.reportModelVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        report_model_id: "shared-model-1",
        version: 2,
        definition_json: definition,
      }),
    });
  });

  it("não abre modelo compartilhado de outro departamento", async () => {
    const prisma = { reportModel: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new ReportModelService(prisma as never);

    await expect(
      service.getShared({
        id: "shared-model-1",
        organizationId,
        departmentId: "department-1",
      }),
    ).rejects.toEqual(expect.objectContaining<ServiceError>({ statusCode: 404 }));
  });

  it("cria cabeçalho pessoal sem departamento e versão 1", async () => {
    const transaction = {
      reportModel: {
        create: vi.fn().mockResolvedValue({ id: "model-1" }),
      },
      reportModelVersion: {
        create: vi.fn().mockResolvedValue({
          id: "version-1",
          version: 1,
          definition_json: definition,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new ReportModelService(prisma as never);

    await expect(
      service.create({ organizationId, userId, name: "Saldo", definition }),
    ).resolves.toMatchObject({ id: "model-1", version: 1, definition });

    expect(transaction.reportModel.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        created_by_user_id: userId,
        department_id: null,
        name: "Saldo",
      },
    });
    expect(transaction.reportModelVersion.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        report_model_id: "model-1",
        version: 1,
        definition_json: definition,
      },
    });
  });

  it("não expõe modelo de outro autor", async () => {
    const prisma = {
      reportModel: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new ReportModelService(prisma as never);

    await expect(service.get({ id: "model-1", organizationId, userId })).rejects.toEqual(
      expect.objectContaining<ServiceError>({ statusCode: 404 }),
    );
    expect(prisma.reportModel.findFirst).toHaveBeenCalledWith({
      where: {
        id: "model-1",
        organization_id: organizationId,
        created_by_user_id: userId,
        department_id: null,
      },
    });
  });

  it("lista somente modelos pessoais sem departamento", async () => {
    const prisma = {
      reportModel: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ReportModelService(prisma as never);

    await expect(service.list({ organizationId, userId })).resolves.toEqual([]);

    expect(prisma.reportModel.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        created_by_user_id: userId,
        department_id: null,
      },
      orderBy: { updated_at: "desc" },
    });
  });

  it("não atualiza nem exclui modelo de outro autor", async () => {
    const transaction = {
      reportModel: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        delete: vi.fn(),
      },
      reportModelVersion: {
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new ReportModelService(prisma as never);

    await expect(
      service.update({ id: "model-1", organizationId, userId, definition }),
    ).rejects.toEqual(expect.objectContaining<ServiceError>({ statusCode: 404 }));
    await expect(service.delete({ id: "model-1", organizationId, userId })).rejects.toEqual(
      expect.objectContaining<ServiceError>({ statusCode: 404 }),
    );

    expect(transaction.reportModel.findFirst).toHaveBeenCalledWith({
      where: {
        id: "model-1",
        organization_id: organizationId,
        created_by_user_id: userId,
        department_id: null,
      },
    });
    expect(transaction.reportModel.update).not.toHaveBeenCalled();
    expect(transaction.reportModel.delete).not.toHaveBeenCalled();
  });

  it("rejeita atualização concorrente após esgotar as tentativas", async () => {
    const transaction = {
      reportModel: {
        findFirst: vi.fn().mockResolvedValue({ id: "model-1", organization_id: organizationId }),
        update: vi.fn(),
      },
      reportModelVersion: {
        findFirst: vi.fn().mockResolvedValue({ version: 1 }),
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new ReportModelService(prisma as never);

    await expect(
      service.update({ id: "model-1", organizationId, userId, definition }),
    ).rejects.toEqual(expect.objectContaining<ServiceError>({ statusCode: 409 }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
