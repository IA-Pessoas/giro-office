import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import type { ProjectServiceEnv } from "../config/env.js";
import { buildProjectServiceOpenApiSpec } from "../openapi/spec.js";

function createEnv(): ProjectServiceEnv {
  return {
    port: 3033,
    databaseUrl: "postgresql://user:pass@localhost:5432/db",
    jwtSecret: "test-jwt-secret",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    auditEnabled: true,
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "test-audit-token",
    reportsInternalToken: "test-reports-internal-token",
    reportsGrantSecret: "test-reports-grant-secret",
    allowedOrigins: ["*"],
    enableApiDocs: true,
  };
}

describe("project-service OpenAPI reporting", () => {
  it("documenta as rotas internas com headers obrigatórios de grant", () => {
    const spec = buildProjectServiceOpenApiSpec(createEnv());
    const operations = [
      spec.paths["/internal/reporting/catalog"]?.get,
      spec.paths["/internal/reporting/extract"]?.post,
    ];

    for (const operation of operations) {
      expect(operation?.security).toEqual([{ internalServiceToken: [] }]);
      expect(operation?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "x-internal-service-token", required: true }),
          expect.objectContaining({ name: "x-request-id", required: true }),
          expect.objectContaining({ name: "x-reports-grant", required: true }),
          expect.objectContaining({ name: "x-reports-grant-signature", required: true }),
        ]),
      );
    }
    expect(spec.components?.schemas).toHaveProperty("ReportingGrantV1");
  });
});
