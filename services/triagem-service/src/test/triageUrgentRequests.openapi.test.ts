import "./envBootstrap.js";

import { describe, expect, it } from "vitest";
import { getTriagemServiceEnv } from "../config/env.js";
import { buildTriagemServiceOpenApiSpec } from "../openapi/spec.js";

describe("contrato OpenAPI de solicitações urgentes da Triagem", () => {
  it("publica consulta, ciclo de vida e schema com filtros obrigatórios", () => {
    const spec = buildTriagemServiceOpenApiSpec(getTriagemServiceEnv());
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths["/triagem/urgent-requests"]).toMatchObject({
      get: expect.objectContaining({
        parameters: expect.arrayContaining([
          expect.objectContaining({ name: "client_id", required: true }),
          expect.objectContaining({ name: "competence", required: true }),
        ]),
      }),
      post: expect.any(Object),
    });
    expect(paths["/triagem/urgent-requests/{id}"]?.put).toBeDefined();
    expect(paths["/triagem/urgent-requests/{id}/close"]?.patch).toBeDefined();
    expect(paths["/triagem/urgent-requests/{id}/reopen"]?.patch).toBeDefined();
    expect(spec.components?.schemas).toHaveProperty("TriageUrgentRequest");
    expect(JSON.stringify(spec)).toContain("CRITICAL");
    expect(JSON.stringify(spec)).toContain("resolution_note");
    expect(JSON.stringify(spec)).toContain("responsible_id");
  });
});
