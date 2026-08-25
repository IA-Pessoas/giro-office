import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

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
      where: { id: "model-1", organization_id: organizationId, created_by_user_id: userId },
    });
  });
});
