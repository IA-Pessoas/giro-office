import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportSourceAdapter } from "../catalog/types.js";
import { RhVacationAdapter } from "../integrations/rhVacationAdapter.js";
import { ReportAuthorizationService } from "../services/reportAuthorizationService.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";

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
const vacationDefinition = {
  sources: ["rh.vacationHistory"],
  columns: [
    {
      source: "rh.vacationHistory",
      field: "employee_name",
      alias: "employee_name",
    },
  ],
  joins: [],
  parameters: [],
  filters: [],
  filter_groups: [],
  aggregations: [],
  order_by: [],
};

const adapter: ReportSourceAdapter = {
  sources: [
    {
      key: "finance.ledger",
      label: "Livro razão",
      module: "financeiro",
      minimum_permission: 1,
      fields: [
        {
          key: "balance",
          label: "Saldo",
          value_type: "number",
          filter_operators: ["eq"],
          aggregations: ["sum"],
        },
      ],
    },
  ],
  relations: [],
  isEnabled: vi.fn(() => true),
  preview: vi.fn(),
};

describe("ReportAuthorizationService", () => {
  it("exige nível RH 3 para consultar histórico de férias", async () => {
    const vacationAdapter = new RhVacationAdapter({
      rhServiceUrl: "http://rh-service.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 1000,
    });
    const createService = (rhLevel: number) =>
      new ReportAuthorizationService(
        {
          getAccessContext: vi.fn().mockResolvedValue({
            organization: { id: organizationId },
            modules: { rh: rhLevel },
          }),
        },
        new ReportDefinitionService(new SourceCatalogService([vacationAdapter])),
      );

    await expect(
      createService(2).validateDefinition({
        userId,
        organizationId,
        requestId: "vacation-history-level-2",
        definition: vacationDefinition,
      }),
    ).rejects.toEqual(expect.objectContaining<ServiceError>({ statusCode: 403 }));

    await expect(
      createService(3).validateDefinition({
        userId,
        organizationId,
        requestId: "vacation-history-level-3",
        definition: vacationDefinition,
      }),
    ).resolves.toMatchObject({ definition: vacationDefinition });
  });

  it("bloqueia acervo compartilhado sem departamento atual", async () => {
    const service = new ReportAuthorizationService(
      {
        getAccessContext: vi.fn().mockResolvedValue({
          organization: { id: organizationId },
          departmentModule: null,
          modules: { financeiro: 3 },
        }),
      },
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );

    await expect(
      service.getSharedDepartment({ userId, organizationId, requestId: "request-departure" }),
    ).rejects.toEqual(expect.objectContaining<ServiceError>({ statusCode: 403 }));
  });

  it("exige nível 3 do módulo do departamento para publicar modelo compartilhado", async () => {
    const accessContextClient = {
      getAccessContext: vi.fn().mockResolvedValue({
        organization: { id: organizationId },
        department: { id: "department-1", name: "Financeiro" },
        departmentModule: "financeiro",
        modules: { financeiro: 2 },
      }),
    };
    const service = new ReportAuthorizationService(
      accessContextClient,
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );

    await expect(
      service.authorizeSharedModel({ userId, organizationId, requestId: "request-3", definition }),
    ).rejects.toEqual(expect.objectContaining<ServiceError>({ statusCode: 403 }));
  });

  it("aceita definição quando fonte tem permissão atual de nível 1", async () => {
    const accessContextClient = {
      getAccessContext: vi.fn().mockResolvedValue({
        organization: { id: organizationId },
        modules: { financeiro: 1 },
      }),
    };
    const service = new ReportAuthorizationService(
      accessContextClient,
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );

    await expect(
      service.validateDefinition({ userId, organizationId, requestId: "request-1", definition }),
    ).resolves.toMatchObject({ definition });
  });

  it("bloqueia owner sem permissão atual da fonte", async () => {
    const accessContextClient = {
      getAccessContext: vi.fn().mockResolvedValue({
        organization: { id: organizationId },
        type: "owner",
        department: { module: "financeiro" },
        modules: { financeiro: 0 },
      }),
    };
    const service = new ReportAuthorizationService(
      accessContextClient,
      new ReportDefinitionService(new SourceCatalogService([adapter])),
    );

    await expect(
      service.validateDefinition({ userId, organizationId, requestId: "request-2", definition }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
