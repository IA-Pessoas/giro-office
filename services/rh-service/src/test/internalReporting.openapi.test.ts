import { describe, expect, it } from "vitest";

import { buildRhServiceOpenApiSpec } from "../openapi/spec.js";

describe("rh internal reporting OpenAPI", () => {
  it("documenta catálogo, extração, headers e apenas fontes seguras", () => {
    const spec = buildRhServiceOpenApiSpec({
      port: 3034,
      reportsInternalToken: "token",
      reportsGrantSecret: "secret",
    } as never) as {
      paths: Record<
        string,
        {
          get?: { parameters?: { name: string }[] };
          post?: {
            parameters?: { name: string }[];
            requestBody?: {
              content?: {
                "application/json"?: { schema?: { properties?: Record<string, unknown> } };
              };
            };
          };
        }
      >;
    };

    expect(spec.paths["/internal/reporting/catalog"]?.get).toBeDefined();
    expect(spec.paths["/internal/reporting/extract"]?.post).toBeDefined();
    expect(spec.paths["/internal/reporting/catalog"]?.get?.parameters?.map((p) => p.name)).toEqual([
      "x-internal-service-token",
      "x-request-id",
      "x-reports-grant",
      "x-reports-grant-signature",
    ]);
    expect(
      spec.paths["/internal/reporting/extract"]?.post?.requestBody?.content?.["application/json"]
        ?.schema?.properties?.source,
    ).toEqual({ type: "string", enum: ["rh.requests", "rh.attendance"] });
    expect(
      spec.paths["/internal/reporting/extract"]?.post?.requestBody?.content?.["application/json"]
        ?.schema?.properties,
    ).not.toHaveProperty("id");
  });
});
