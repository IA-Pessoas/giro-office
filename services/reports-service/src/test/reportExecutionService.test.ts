import { describe, expect, it, vi } from "vitest";

import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportSourceAdapter } from "../catalog/types.js";
import { reportDefinitionSchema } from "../schemas/reportDefinition.schemas.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";
import { ReportExecutionService } from "../services/reportExecutionService.js";

const adapter: ReportSourceAdapter = {
  sources: [
    {
      key: "regularize.licenses",
      label: "Licenças do Regularize",
      module: "regularize",
      minimum_permission: 1,
      fields: [
        {
          key: "protocol",
          label: "Protocolo",
          value_type: "string",
          filter_operators: ["eq"],
          aggregations: [],
        },
      ],
    },
  ],
  relations: [],
  isEnabled: vi.fn(() => true),
  preview: vi.fn().mockResolvedValue({ rows: [{ protocol: "P-1" }], reachedLimit: true }),
};

describe("ReportExecutionService", () => {
  it("recusa persistência quando a origem informa truncamento", async () => {
    const catalog = new SourceCatalogService([adapter]);
    const service = new ReportExecutionService(catalog, new ReportDefinitionService(catalog));
    const definition = reportDefinitionSchema.parse({
      sources: ["regularize.licenses"],
      columns: [{ source: "regularize.licenses", field: "protocol", alias: "protocol" }],
    });

    await expect(
      service.execute({
        definition,
        scope: {
          organization_id: "10000000-0000-4000-8000-000000000001",
          modules: { regularize: 1 },
        },
        parameterValues: {},
        requestId: "request-847",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A origem excedeu seu limite de linhas para o snapshot.",
    });
  });
});
