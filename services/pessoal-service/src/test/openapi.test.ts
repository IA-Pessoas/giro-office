import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { getPessoalServiceEnv } from "../config/env.js";
import { buildPessoalServiceOpenApiSpec } from "../openapi/spec.js";

describe("pessoal-service OpenAPI", () => {
  it("documenta health e readiness", () => {
    const spec = buildPessoalServiceOpenApiSpec(getPessoalServiceEnv());
    const paths = spec.paths as Record<string, { get?: unknown; post?: { security?: unknown } }>;

    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("pessoal-service");
    expect(paths["/health"]?.get).toBeDefined();
    expect(paths["/ready"]?.get).toBeDefined();
  });

  it("documenta gatilho interno de notificacoes de sindicato", () => {
    const spec = buildPessoalServiceOpenApiSpec(getPessoalServiceEnv());
    const components = spec.components as {
      securitySchemes?: Record<string, unknown>;
    };
    const paths = spec.paths as Record<string, { post?: { security?: unknown } }>;

    expect(components.securitySchemes?.internalServiceToken).toEqual({
      type: "apiKey",
      in: "header",
      name: "x-internal-service-token",
    });
    expect(paths["/internal/pessoal/union-notifications/run"]?.post?.security).toEqual([
      { internalServiceToken: [] },
    ]);
  });
});
