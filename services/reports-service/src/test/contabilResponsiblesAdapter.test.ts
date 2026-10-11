import { describe, expect, it } from "vitest";

import { ContabilResponsiblesAdapter } from "../integrations/contabilResponsiblesAdapter.js";

describe("ContabilResponsiblesAdapter", () => {
  it("publica empresa, responsáveis e movimento, sem ids nem organização", () => {
    const adapter = new ContabilResponsiblesAdapter({
      contabilServiceUrl: "http://contabil.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources.map((source) => source.key)).toEqual(["contabil.responsibles"]);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "responsible_name",
      "posted_by_name",
      "name",
      "company_name",
      "cpf_cnpj",
      "status",
      "regime",
      "competence_entry",
      "deletion_date",
      "contabil",
      "fiscal",
      "customer_with_movement",
    ]);
  });
});
