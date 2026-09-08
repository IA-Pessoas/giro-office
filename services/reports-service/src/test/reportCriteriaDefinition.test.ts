import { describe, expect, it } from "vitest";
import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import { deriveReportCatalogGrant } from "../catalog/types.js";
import { ProjectAdapter } from "../integrations/projectAdapter.js";
import { reportCriteria } from "../integrations/reportCriteria.js";
import { reportDefinitionSchema } from "../schemas/reportDefinition.schemas.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";

describe("criteria definition", () => {
  it("requires declared parameters even without filtering", () => {
    const definition = reportDefinitionSchema.parse({
      sources: ["integracao.projects"],
      columns: [{ source: "integracao.projects", field: "name", alias: "name" }],
      parameters: [{ name: "required", type: "number" }],
    });
    expect(() => reportCriteria(definition)).toThrow("Preencha os parâmetros");
    expect(() => reportCriteria(definition, { required: "wrong" })).toThrow("tipo declarado");
  });
  const catalog = new SourceCatalogService([new ProjectAdapter({} as never)]);
  const service = new ReportDefinitionService(catalog);
  const scope = {
    organization_id: "00000000-0000-4000-8000-000000000001",
    modules: { integracao: 1 },
  };
  it("publishes executable summaries and authorizes grouping-only fields", () => {
    const definition = reportDefinitionSchema.parse({
      sources: ["integracao.projects"],
      columns: [{ source: "integracao.projects", field: "name", alias: "name" }],
      group_by: [{ source: "integracao.projects", field: "status" }],
      aggregations: [
        { source: "integracao.projects", field: "porcentage", function: "sum", alias: "total" },
      ],
    });
    expect(() => service.validate(definition, scope)).not.toThrow();
    expect(deriveReportCatalogGrant(definition).sources["integracao.projects"]).toContain("status");
    expect(() =>
      service.validate(definition, {
        ...scope,
        grant: { sources: { "integracao.projects": ["name", "porcentage"] }, relations: [] },
      }),
    ).toThrow();
  });
  it("rejects ordering authorized in another area instead of the selected area", () => {
    const other = {
      sources: [
        {
          key: "other.area",
          label: "Other",
          module: "integracao",
          minimum_permission: 1,
          fields: [
            {
              key: "status",
              label: "Status",
              value_type: "string" as const,
              filter_operators: [],
              aggregations: [],
            },
          ],
        },
      ],
      relations: [],
      isEnabled: () => true,
      preview: async () => [],
    };
    const definitions = new ReportDefinitionService(
      new SourceCatalogService([new ProjectAdapter({} as never), other]),
    );
    const definition = reportDefinitionSchema.parse({
      sources: ["integracao.projects"],
      columns: [{ source: "integracao.projects", field: "name", alias: "name" }],
      order_by: [{ source: "other.area", field: "status", direction: "asc" }],
    });
    expect(() =>
      definitions.validate(definition, {
        ...scope,
        grant: {
          sources: { "integracao.projects": ["name"], "other.area": ["status"] },
          relations: [],
        },
      }),
    ).toThrow();
  });
});
