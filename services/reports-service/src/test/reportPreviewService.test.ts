import { describe, expect, it, vi } from "vitest";

import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportSourceAdapter } from "../catalog/types.js";
import { reportDefinitionSchema } from "../schemas/reportDefinition.schemas.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";
import { ReportPreviewService } from "../services/reportPreviewService.js";

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

const definition = reportDefinitionSchema.parse({
  sources: ["finance.ledger"],
  columns: [{ source: "finance.ledger", field: "balance", alias: "balance" }],
});
const scope = {
  organization_id: "00000000-0000-4000-8000-000000000002",
  modules: { financeiro: 1 },
};

describe("ReportPreviewService", () => {
  it("não extrai quando a definição não está autorizada", async () => {
    const catalog = new SourceCatalogService([adapter]);
    const service = new ReportPreviewService(catalog, new ReportDefinitionService(catalog), 2);

    await expect(
      service.preview(definition, { ...scope, modules: { financeiro: 0 } }),
    ).rejects.toThrow("fonte não está autorizada");
    expect(adapter.preview).not.toHaveBeenCalled();
  });

  it("limita linhas, informa hasMore e aceita preview vazio", async () => {
    const catalog = new SourceCatalogService([adapter]);
    const service = new ReportPreviewService(catalog, new ReportDefinitionService(catalog), 2);
    vi.mocked(adapter.preview).mockResolvedValue([{ balance: 1 }, { balance: 2 }, { balance: 3 }]);

    await expect(service.preview(definition, scope)).resolves.toEqual({
      rows: [{ balance: 1 }, { balance: 2 }],
      presentation: { columns: [{ key: "balance", label: "balance" }] },
      limit: 2,
      hasMore: true,
    });
    expect(adapter.preview).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));

    vi.mocked(adapter.preview).mockResolvedValue([]);
    await expect(service.preview(definition, scope)).resolves.toEqual({
      rows: [],
      presentation: { columns: [{ key: "balance", label: "balance" }] },
      limit: 2,
      hasMore: false,
    });

    vi.mocked(adapter.preview).mockResolvedValue({
      rows: [{ balance: 1 }],
      reachedLimit: true,
    });
    await expect(service.preview(definition, scope)).resolves.toEqual({
      rows: [{ balance: 1 }],
      presentation: { columns: [{ key: "balance", label: "balance" }] },
      limit: 2,
      hasMore: true,
    });
  });
});
