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
});
