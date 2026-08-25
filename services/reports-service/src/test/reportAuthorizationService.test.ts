import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportSourceAdapter } from "../catalog/types.js";
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
