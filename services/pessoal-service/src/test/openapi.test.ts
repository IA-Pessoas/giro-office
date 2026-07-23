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
    expect(paths["/pessoal/overview"]?.get).toBeDefined();
  });

  it("documenta detalhes opcionais de folha e obrigacao sem 404 esperado", () => {
    const spec = buildPessoalServiceOpenApiSpec(getPessoalServiceEnv());
    const paths = spec.paths as Record<
      string,
      Record<string, { responses?: Record<string, unknown> }>
    >;

    expect(paths["/pessoal/payroll/{client_id}"]?.get?.responses?.["200"]).toBeDefined();
    expect(paths["/pessoal/payroll/{client_id}"]?.get?.responses?.["404"]).toBeUndefined();
    expect(paths["/pessoal/obrigations"]?.get?.responses?.["200"]).toBeDefined();
    expect(paths["/pessoal/obrigations"]?.get?.responses?.["404"]).toBeUndefined();
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

  it("documenta request bodies estritos para mutacoes do dominio", () => {
    const spec = buildPessoalServiceOpenApiSpec(getPessoalServiceEnv());
    const paths = spec.paths as Record<
      string,
      Record<string, { requestBody?: { content?: Record<string, { schema?: unknown }> } }>
    >;

    const mutationSchemas = [
      paths["/pessoal/ldd"]?.post?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/ldd/{id}"]?.patch?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/situations"]?.post?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/situations/{id}"]?.patch?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/unions"]?.post?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/unions/{id}"]?.patch?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/payroll"]?.post?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/payroll/{client_id}"]?.patch?.requestBody?.content?.["application/json"]
        ?.schema,
      paths["/pessoal/obrigations"]?.post?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/obrigations/{id}"]?.patch?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/passwords"]?.post?.requestBody?.content?.["application/json"]?.schema,
      paths["/pessoal/passwords/{id}"]?.patch?.requestBody?.content?.["application/json"]?.schema,
    ] as Array<Record<string, unknown> | undefined>;

    expect(mutationSchemas).not.toContain(undefined);
    for (const schema of mutationSchemas) {
      expect(schema).toMatchObject({
        type: "object",
        additionalProperties: false,
        properties: expect.any(Object),
      });
    }
  });
});
