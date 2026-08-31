import { describe, expect, it } from "vitest";

import { buildTiServiceOpenApiSpec } from "../openapi/spec.js";

describe("ti internal reporting OpenAPI", () => {
  it("documenta as operações internas e o request id obrigatório", () => {
    const spec = buildTiServiceOpenApiSpec({ port: 3040 });

    for (const path of ["/internal/reporting/catalog", "/internal/reporting/extract"]) {
      const operation = spec.paths[path] as {
        get?: {
          parameters: Array<{ name: string; required?: boolean; schema: { minLength?: number } }>;
        };
        post?: {
          parameters: Array<{ name: string; required?: boolean; schema: { minLength?: number } }>;
        };
      };
      const parameters = operation.get?.parameters ?? operation.post?.parameters ?? [];

      expect(parameters.find((parameter) => parameter.name === "x-request-id")).toMatchObject({
        required: true,
        schema: { minLength: 1 },
      });
    }

    expect(spec.paths["/internal/reporting/extract"]).toBeDefined();
    const bodySchema = (spec.paths["/internal/reporting/extract"] as { post: { requestBody: { content: { "application/json": { schema: { properties: { source: { enum: string[] } } } } } } } }).post.requestBody.content["application/json"].schema;
    expect(bodySchema.properties.source.enum).toEqual(["ti.inventory", "ti.stock"]);
    expect(spec.paths["/ti/stock"]).toBeDefined();
  });
});
