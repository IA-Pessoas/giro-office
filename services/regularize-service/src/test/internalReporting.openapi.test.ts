import { describe, expect, it } from "vitest";

import { buildRegularizeServiceOpenApiSpec } from "../openapi/spec.js";

describe("regularize internal reporting OpenAPI", () => {
  it("exige x-request-id não vazio nas operações internas", () => {
    const spec = buildRegularizeServiceOpenApiSpec({ port: 3039 });

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
      const requestId = parameters.find((parameter) => parameter.name === "x-request-id");

      expect(requestId).toMatchObject({
        required: true,
        schema: { minLength: 1 },
      });
    }
  });

  it("documenta processos como fonte interna protegida", () => {
    const spec = buildRegularizeServiceOpenApiSpec({ port: 3039 });
    const operation = spec.paths["/internal/reporting/extract"] as {
      post: {
        security: unknown;
        summary: string;
        requestBody: {
          content: {
            "application/json": {
              schema: { properties: { source: { enum: string[] } } };
            };
          };
        };
      };
    };

    expect(operation.post.security).toEqual([{ internalToken: [] }]);
    expect(operation.post.summary).toContain("processos");
    expect(
      operation.post.requestBody.content["application/json"].schema.properties.source.enum,
    ).toContain("regularize.processes");
  });
});
