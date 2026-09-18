import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { getTriagemServiceEnv } from "../config/env.js";
import { buildTriagemServiceOpenApiSpec } from "../openapi/spec.js";

describe("contrato OpenAPI dos catálogos da Triagem", () => {
  it("publica CRUD, arquivamento e os três tipos governados", () => {
    const spec = buildTriagemServiceOpenApiSpec(getTriagemServiceEnv());
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths["/triagem/catalogs"]).toMatchObject({
      get: expect.any(Object),
      post: expect.any(Object),
    });
    expect(paths["/triagem/catalogs/{id}"]?.patch).toBeDefined();
    expect(paths["/triagem/catalogs/{id}/archive"]?.patch).toBeDefined();
    expect(spec.components?.schemas).toHaveProperty("TriageCatalogItem");
    expect(JSON.stringify(spec)).toContain("JUSTIFICATION");
    expect(JSON.stringify(spec)).toContain("LINK_TYPE");
    expect(JSON.stringify(spec)).toContain("STATE_SITE");
  });
});
