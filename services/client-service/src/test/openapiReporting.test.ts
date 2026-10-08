import { describe, expect, it } from "vitest";

import { buildClientServiceOpenApiSpec } from "../openapi/spec.js";

describe("OpenAPI de relatórios internos", () => {
  it("documenta catálogo, extract e headers do grant", () => {
    const spec = buildClientServiceOpenApiSpec({ port: 3035 } as never) as {
      paths: Record<string, { get?: { parameters?: { name: string }[] }; post?: unknown }>;
    };
    const catalog = spec.paths["/internal/reporting/catalog"]?.get;

    expect(catalog).toBeDefined();
    expect(spec.paths["/internal/reporting/extract"]?.post).toBeDefined();
    expect(catalog?.parameters?.map((parameter) => parameter.name)).toEqual([
      "x-request-id",
      "x-reports-grant",
      "x-reports-grant-signature",
    ]);
  });

  it("documenta os campos de endereço nos fluxos normal e de integração", () => {
    type RequestSchema = {
      properties?: Record<string, { type?: string | string[] }>;
    };
    type Operation = {
      requestBody?: {
        content?: { "application/json"?: { schema?: RequestSchema } };
      };
    };
    const spec = buildClientServiceOpenApiSpec({ port: 3035 } as never) as {
      paths: Record<string, { post?: Operation; patch?: Operation }>;
    };
    const addressFields = ["address", "cep", "neighborhood", "state", "city"];
    const operations = [
      spec.paths["/client"]?.post,
      spec.paths["/client/{id}"]?.patch,
      spec.paths["/client/integration"]?.post,
      spec.paths["/client/{id}/integration"]?.patch,
    ];

    for (const operation of operations) {
      const properties = operation?.requestBody?.content?.["application/json"]?.schema?.properties;
      expect(properties).toBeDefined();
      for (const field of addressFields) {
        expect(properties?.[field]?.type).toEqual(["string", "null"]);
      }
    }
  });
});
