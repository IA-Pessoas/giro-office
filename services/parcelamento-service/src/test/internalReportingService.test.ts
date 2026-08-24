import { describe, expect, it, vi } from "vitest";

import { internalReportingCatalog } from "../reporting/internalReportingCatalog.js";
import { InternalReportingService } from "../services/internalReportingService.js";

describe("InternalReportingService", () => {
  it("publica somente fontes e campos governados de parcelamento", () => {
    expect(internalReportingCatalog.sources.map((source) => source.key)).toEqual([
      "parcelamento.installments",
      "parcelamento.installment_competencies",
      "parcelamento.panoramas",
    ]);
    expect(internalReportingCatalog.sources.flatMap((source) => source.fields)).not.toContain(
      "document_url",
    );
    expect(internalReportingCatalog.sources.flatMap((source) => source.fields)).not.toContain(
      "organization_id",
    );
  });

  it("extrai apenas campos permitidos no escopo da organizacao", async () => {
    const installments = { findMany: vi.fn().mockResolvedValue([{ status: "active" }]) };
    const service = new InternalReportingService({ installment: installments } as never);

    await expect(
      service.extract({
        organizationId: "00000000-0000-4000-8000-000000000002",
        source: "parcelamento.installments",
        fields: ["status"],
        limit: 10,
      }),
    ).resolves.toEqual([{ status: "active" }]);
    expect(installments.findMany).toHaveBeenCalledWith({
      where: { organization_id: "00000000-0000-4000-8000-000000000002" },
      select: { status: true },
      take: 10,
    });
  });
});
