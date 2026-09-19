import { describe, expect, it } from "vitest";

import { buildRegularizeServiceOpenApiSpec } from "../openapi/spec.js";

describe("regularize license protocol OpenAPI", () => {
  it("documenta upload privado e acesso assinado no mesmo recurso", () => {
    const spec = buildRegularizeServiceOpenApiSpec({ port: 3039 });
    const path = spec.paths["/regularize/license/{id}/protocol"] as {
      get: { security: unknown; description: string };
      post: {
        security: unknown;
        description: string;
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: { properties: { file: { format: string; description: string } } };
            };
          };
        };
      };
    };

    expect(path.get.security).toEqual([{ bearerAuth: [] }]);
    expect(path.get.description).toContain("300 segundos");
    expect(path.post.security).toEqual([{ bearerAuth: [] }]);
    expect(path.post.description).toContain("10 MB");
    expect(
      path.post.requestBody.content["multipart/form-data"].schema.properties.file,
    ).toMatchObject({ format: "binary", description: expect.stringContaining("PDF") });
  });
});
