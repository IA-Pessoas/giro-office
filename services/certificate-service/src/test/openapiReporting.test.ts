import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import { getCertificateServiceEnv } from "../config/env.js";
import { buildCertificateServiceOpenApiSpec } from "../openapi/spec.js";

describe("certificate-service reporting OpenAPI", () => {
  it("documenta as rotas internas de catálogo e extração", () => {
    const spec = buildCertificateServiceOpenApiSpec(getCertificateServiceEnv());

    expect(spec.paths["/internal/reporting/catalog"]?.get).toMatchObject({
      "x-internal": true,
      security: [{ internalToken: [] }],
    });
    expect(spec.paths["/internal/reporting/catalog"]?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "x-request-id", in: "header", required: true }),
        expect.objectContaining({ name: "x-reports-grant", in: "header", required: true }),
        expect.objectContaining({
          name: "x-reports-grant-signature",
          in: "header",
          required: true,
        }),
      ]),
    );
    expect(spec.paths["/internal/reporting/extract"]?.post).toMatchObject({
      "x-internal": true,
      security: [{ internalToken: [] }],
    });
    expect(spec.paths["/internal/reporting/extract"]?.post?.responses).toHaveProperty("403");
    expect(spec.paths["/internal/reporting/extract"]?.post?.responses).toHaveProperty("400");
  });
});
