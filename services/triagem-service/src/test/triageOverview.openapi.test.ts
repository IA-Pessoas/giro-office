import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { getTriagemServiceEnv } from "../config/env.js";
import { buildTriagemServiceOpenApiSpec } from "../openapi/spec.js";

describe("contrato OpenAPI do painel consolidado da Triagem", () => {
  it("publica filtros, paginação, indicadores e precedência", () => {
    const spec = buildTriagemServiceOpenApiSpec(getTriagemServiceEnv());
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    const overview = paths["/triagem/overview"]?.get as Record<string, unknown>;

    expect(overview).toBeDefined();
    expect(overview.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "page" }),
        expect.objectContaining({ name: "page_size" }),
        expect.objectContaining({ name: "client_id" }),
        expect.objectContaining({ name: "competence" }),
        expect.objectContaining({ name: "status" }),
      ]),
    );
    expect(spec.components?.schemas).toHaveProperty("TriageOverviewItem");
    expect(spec.components?.schemas).toHaveProperty("TriageOverviewIndicators");
    expect(JSON.stringify(overview)).toContain("URGENT_OPEN");
    expect(JSON.stringify(overview)).toContain("ROUTINE_PENDING");
    expect(JSON.stringify(overview)).toContain("BANK_PENDING");
    expect(JSON.stringify(overview)).toContain("COMPLETE");
  });
});
