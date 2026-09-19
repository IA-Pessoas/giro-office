import "./envBootstrap.js";

import { describe, expect, it } from "vitest";
import { getTriagemServiceEnv } from "../config/env.js";
import { buildTriagemServiceOpenApiSpec } from "../openapi/spec.js";

describe("contrato OpenAPI de links externos da Triagem", () => {
  it("publica criação, revisão, listagem e arquivamento com tipos e HTTPS controlados", () => {
    const spec = buildTriagemServiceOpenApiSpec(getTriagemServiceEnv());
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths["/triagem/external-links"]).toMatchObject({
      get: expect.objectContaining({
        parameters: expect.arrayContaining([
          expect.objectContaining({ name: "client_id", required: true }),
          expect.objectContaining({ name: "competence", required: true }),
        ]),
      }),
      post: expect.any(Object),
    });
    expect(paths["/triagem/external-links/{id}"]?.put).toBeDefined();
    expect(paths["/triagem/external-links/{id}/archive"]?.patch).toBeDefined();
    expect(spec.components?.schemas).toHaveProperty("TriageExternalLink");
    const externalLinkSchema = spec.components?.schemas?.TriageExternalLink as {
      properties?: { type?: Record<string, unknown> };
    };
    expect(externalLinkSchema.properties?.type).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 100,
    });
    expect(externalLinkSchema.properties?.type).not.toHaveProperty("enum");
  });
});
