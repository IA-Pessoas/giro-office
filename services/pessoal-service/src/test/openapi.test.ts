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

  it("documenta o contrato interno de reporting pessoal", () => {
    const spec = buildPessoalServiceOpenApiSpec(getPessoalServiceEnv());
    const paths = spec.paths as Record<
      string,
      Record<
        string,
        { security?: unknown; requestBody?: { content?: Record<string, { schema?: unknown }> } }
      >
    >;

    expect(paths["/internal/reporting/catalog"]?.get?.security).toEqual([
      { internalServiceToken: [] },
    ]);
    expect(paths["/internal/reporting/extract"]?.post?.security).toEqual([
      { internalServiceToken: [] },
    ]);
    const extractSchema = (
      spec.paths as Record<
        string,
        {
          post?: {
            requestBody?: {
              content?: Record<
                string,
                { schema?: { properties?: { source?: { enum?: unknown } } } }
              >;
            };
          };
        }
      >
    )["/internal/reporting/extract"]?.post?.requestBody?.content?.["application/json"]?.schema;
    expect(extractSchema?.properties?.source?.enum).toEqual([
      "pessoal.ldd",
      "pessoal.payroll",
      "pessoal.obligations",
      "pessoal.unions",
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

  it("documenta busca e resposta dual de sindicatos", () => {
    const spec = buildPessoalServiceOpenApiSpec(getPessoalServiceEnv());
    const operation = (spec.paths as Record<string, { get?: Record<string, unknown> }>)[
      "/pessoal/unions"
    ]?.get as {
      parameters?: Array<{ name?: string }>;
      responses?: Record<string, { content?: Record<string, { schema?: { oneOf?: unknown[] } }> }>;
    };

    expect(operation.parameters?.map((parameter) => parameter.name)).toEqual([
      "search",
      "page",
      "limit",
    ]);
    expect(operation.responses?.["200"]?.content?.["application/json"]?.schema?.oneOf).toHaveLength(
      2,
    );
  });

  it("documenta exclusao de sindicato e seus erros de contrato", () => {
    const spec = buildPessoalServiceOpenApiSpec(getPessoalServiceEnv());
    const operation = (
      spec.paths as Record<
        string,
        {
          delete?: {
            operationId?: string;
            parameters?: unknown[];
            responses?: Record<string, unknown>;
          };
        }
      >
    )["/pessoal/unions/{id}"]?.delete;

    expect(operation?.operationId).toBe("deletePessoalUnion");
    expect(operation?.parameters).toHaveLength(1);
    expect(operation?.responses?.["200"]).toBeDefined();
    expect(operation?.responses?.["400"]).toBeDefined();
    expect(operation?.responses?.["404"]).toBeDefined();
    expect(operation?.responses?.["409"]).toBeDefined();
  });

  it("documenta a exclusao de situacao sem conflito de dominio", () => {
    const spec = buildPessoalServiceOpenApiSpec(getPessoalServiceEnv());
    const operation = (
      spec.paths as Record<
        string,
        { delete?: { parameters?: Array<{ name?: string }>; responses?: Record<string, unknown> } }
      >
    )["/pessoal/situations/{id}"]?.delete;

    expect(operation?.parameters).toEqual([
      expect.objectContaining({ name: "id", in: "path", required: true }),
    ]);
    expect(operation?.responses).toMatchObject({
      "200": expect.any(Object),
      "400": expect.any(Object),
      "404": expect.any(Object),
    });
    expect(operation?.responses?.["409"]).toBeUndefined();
  });
});
