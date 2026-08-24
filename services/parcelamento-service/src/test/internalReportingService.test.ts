import { describe, expect, it, vi } from "vitest";

import { internalReportingCatalog } from "../reporting/internalReportingCatalog.js";
import { InternalReportingService } from "../services/internalReportingService.js";

describe("InternalReportingService", () => {
  it("publica somente fontes e campos governados de parcelamento", () => {
    const fields = internalReportingCatalog.sources.flatMap((source) =>
      source.fields.map((field) => field.key),
    );
    expect(internalReportingCatalog.sources.map((source) => source.key)).toEqual([
      "parcelamento.installments",
      "parcelamento.installment_competencies",
      "parcelamento.panoramas",
    ]);
    expect(fields).not.toContain("document_url");
    expect(fields).not.toContain("organization_id");
    expect(fields).not.toContain("client_id");
    expect(fields).not.toContain("installment_id");
    expect(fields).not.toContain("responsavel_id");
    expect(fields).toContain("agreement_number");
    expect(internalReportingCatalog.relations).toEqual([]);
    expect(
      internalReportingCatalog.sources.map((source) => source.keys.map((key) => key.key)),
    ).toEqual([["client_id"], ["installment_id"], ["client_id"]]);
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
