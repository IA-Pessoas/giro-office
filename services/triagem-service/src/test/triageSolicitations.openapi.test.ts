import "./envBootstrap.js";

import { describe, expect, it } from "vitest";
import { getTriagemServiceEnv } from "../config/env.js";
import { buildTriagemServiceOpenApiSpec } from "../openapi/spec.js";

describe("contrato OpenAPI de solicitações da Triagem", () => {
  it("publica cadastro, lista, detalhe e fechamento sem reabertura", () => {
    const spec = buildTriagemServiceOpenApiSpec(getTriagemServiceEnv());
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths["/triagem/solicitations"]).toMatchObject({
      get: expect.any(Object),
      post: expect.any(Object),
    });
    expect(paths["/triagem/solicitations/{id}"]?.get).toBeDefined();
    expect(paths["/triagem/solicitations/{id}/close"]?.patch).toBeDefined();
    expect(paths["/triagem/solicitations/{id}/reopen"]).toBeUndefined();
    expect(spec.components?.schemas).toHaveProperty("TriageSolicitation");
    expect(JSON.stringify(spec)).toContain("REQUEST_CATEGORY");
  });
});
