import { describe, expect, it, vi } from "vitest";

import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportSourceAdapter } from "../catalog/types.js";
import { reportCompositionSchema } from "../schemas/reportComposition.schemas.js";
import { reportDefinitionSchema } from "../schemas/reportDefinition.schemas.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";
import {
  type ReportAreaExecutionError,
  ReportExecutionService,
} from "../services/reportExecutionService.js";

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

  it("executa uma composição em blocos independentes e preserva área vazia", async () => {
    const composedAdapter: ReportSourceAdapter = {
      sources: [
        adapter.sources[0],
        {
          key: "regularize.processes",
          label: "Processos do Regularize",
          module: "regularize",
          minimum_permission: 1,
          fields: [
            {
              key: "number",
              label: "Número",
              value_type: "string",
              filter_operators: ["eq"],
              aggregations: [],
            },
          ],
        },
      ],
      relations: [],
      isEnabled: vi.fn(() => true),
      preview: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ protocol: "P-1" }], reachedLimit: false })
        .mockResolvedValueOnce({ rows: [], reachedLimit: false }),
    };
    const catalog = new SourceCatalogService([composedAdapter]);
    const service = new ReportExecutionService(catalog, new ReportDefinitionService(catalog));
    const definition = reportCompositionSchema.parse({
      version: 2,
      areas: [
        { source: "regularize.licenses", fields: ["protocol"] },
        { source: "regularize.processes", fields: ["number"] },
      ],
    });

    await expect(
      service.executeComposition({
        definition,
        scope: {
          organization_id: "10000000-0000-4000-8000-000000000001",
          modules: { regularize: 1 },
        },
        requestId: "request-composed",
      }),
    ).resolves.toEqual({
      blocks: [
        {
          source: "regularize.licenses",
          label: "Licenças do Regularize",
          columns: [{ key: "protocol", label: "Protocolo" }],
          rows: [{ protocol: "P-1" }],
        },
        {
          source: "regularize.processes",
          label: "Processos do Regularize",
          columns: [{ key: "number", label: "Número" }],
          rows: [],
        },
      ],
    });
  });

  it("falha indicando a área sem devolver blocos parciais", async () => {
    const failingAdapter: ReportSourceAdapter = {
      ...adapter,
      sources: [
        adapter.sources[0],
        {
          key: "regularize.processes",
          label: "Processos do Regularize",
          module: "regularize",
          minimum_permission: 1,
          fields: [
            {
              key: "number",
              label: "Número",
              value_type: "string",
              filter_operators: ["eq"],
              aggregations: [],
            },
          ],
        },
      ],
      preview: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ protocol: "P-1" }], reachedLimit: false })
        .mockRejectedValueOnce(new Error("upstream secret error")),
    };
    const catalog = new SourceCatalogService([failingAdapter]);
    const service = new ReportExecutionService(catalog, new ReportDefinitionService(catalog));
    const definition = reportCompositionSchema.parse({
      version: 2,
      areas: [
        { source: "regularize.licenses", fields: ["protocol"] },
        { source: "regularize.processes", fields: ["number"] },
      ],
    });

    await expect(
      service.executeComposition({
        definition,
        scope: {
          organization_id: "10000000-0000-4000-8000-000000000001",
          modules: { regularize: 1 },
        },
        requestId: "request-failure",
      }),
    ).rejects.toMatchObject<Partial<ReportAreaExecutionError>>({
      source: "regularize.processes",
      label: "Processos do Regularize",
      userMessage:
        "Não foi possível gerar o bloco Processos do Regularize. Confira o acesso e os critérios e tente novamente.",
    });
  });
});
