import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { buildTiServiceOpenApiSpec } from "../openapi/spec.js";

describe("TI internal reporting OpenAPI", () => {
  it("documenta catálogo, extração, headers do grant e somente a fonte segura", () => {
    const spec = buildTiServiceOpenApiSpec({ port: 3040 });
    const catalog = spec.paths["/internal/reporting/catalog"] as {
      get?: { parameters?: { name: string }[] };
    };
    const extract = spec.paths["/internal/reporting/extract"] as {
      post?: {
        requestBody?: {
          content?: {
            "application/json"?: {
              schema?: { properties?: Record<string, unknown> };
            };
          };
        };
      };
    };

    expect(catalog.get).toBeDefined();
    expect(extract.post).toBeDefined();
    expect(catalog.get?.parameters?.map((parameter) => parameter.name)).toEqual([
      "x-internal-service-token",
      "x-request-id",
      "x-reports-grant",
      "x-reports-grant-signature",
    ]);
    expect(
      extract.post?.requestBody?.content?.["application/json"]?.schema?.properties?.source,
    ).toEqual({ type: "string", enum: ["ti.stock"] });
    expect(
      extract.post?.requestBody?.content?.["application/json"]?.schema?.properties,
    ).not.toHaveProperty("id");
  });
});
