import { describe, expect, it } from "vitest";

import { buildFiscalServiceOpenApiSpec } from "../openapi/spec.js";

describe("fiscal internal reporting OpenAPI", () => {
  it("documenta as rotas internas sem publicar IDs", () => {
    const spec = buildFiscalServiceOpenApiSpec({ port: 3037 } as never);
    const catalog = spec.paths["/internal/reporting/catalog"] as {
      get: { security: unknown };
    };
    const extract = spec.paths["/internal/reporting/extract"] as {
      post: {
        requestBody: {
          content: { "application/json": { schema: { properties: Record<string, unknown> } } };
        };
      };
    };

    expect(catalog.get.security).toEqual([{ internalServiceToken: [] }]);
    expect(
      extract.post.requestBody.content["application/json"].schema.properties,
    ).not.toHaveProperty("id");
    expect(extract.post.requestBody.content["application/json"].schema.properties).toHaveProperty(
      "fields",
    );
  });
});
