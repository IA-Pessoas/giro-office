import { describe, expect, it } from "vitest";

import { ContabilResponsiblesAdapter } from "../integrations/contabilResponsiblesAdapter.js";

describe("ContabilResponsiblesAdapter", () => {
  it("publica somente a fonte segura de responsáveis", () => {
    const adapter = new ContabilResponsiblesAdapter({
      contabilServiceUrl: "http://contabil.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources.map((source) => source.key)).toEqual(["contabil.responsibles"]);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "customer_with_movement",
    ]);
  });
});
