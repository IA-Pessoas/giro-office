import { describe, expect, it } from "vitest";

import { buildTaskServiceOpenApiSpec } from "../openapi/spec.js";

describe("OpenAPI de relatórios internos", () => {
  it("documenta catálogo, extract e headers do grant", () => {
    const spec = buildTaskServiceOpenApiSpec({ port: 3032 } as never) as {
      paths: Record<string, { get?: { parameters?: { name: string }[] }; post?: unknown }>;
    };
    const catalog = spec.paths["/internal/reporting/catalog"]?.get;

    expect(catalog).toBeDefined();
    expect(spec.paths["/internal/reporting/extract"]?.post).toBeDefined();
    expect(catalog?.parameters?.map((parameter) => parameter.name)).toEqual([
      "x-internal-service-token",
      "x-request-id",
      "x-reports-grant",
      "x-reports-grant-signature",
    ]);
  });
});
