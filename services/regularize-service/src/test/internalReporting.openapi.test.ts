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
});
