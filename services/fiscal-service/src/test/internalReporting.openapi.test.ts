import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { buildFiscalServiceOpenApiSpec } from "../openapi/spec.js";

describe("fiscal internal reporting OpenAPI", () => {
  it("documenta catálogo, extração, headers do grant e as fontes ICMS/NCM", () => {
    const spec = buildFiscalServiceOpenApiSpec({ port: 3037 } as never) as {
      paths: Record<
        string,
        {
          get?: { parameters?: { name: string }[] };
          post?: {
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
    ).toEqual({ type: "string", enum: ["fiscal.icms", "fiscal.ncm", "fiscal.ipi"] });
    expect(
      spec.paths["/internal/reporting/extract"]?.post?.requestBody?.content?.["application/json"]
        ?.schema?.properties,
    ).not.toHaveProperty("id");
  });
});
