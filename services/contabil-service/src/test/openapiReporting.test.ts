import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import type { ContabilServiceEnv } from "../config/env.js";
import { buildContabilServiceOpenApiSpec } from "../openapi/spec.js";

function createEnv(): ContabilServiceEnv {
  return {
    port: 3038,
    databaseUrl: "postgresql://user:pass@localhost:5432/db",
    jwtSecret: "test-jwt-secret",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    auditEnabled: true,
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "test-audit-token",
    internalServiceToken: "test-internal-token",
    reportsInternalToken: "test-reports-internal-token",
    reportsGrantSecret: "test-reports-grant-secret",
    triagemServiceUrl: "http://localhost:3046",
    triagemInternalToken: "test-triagem-internal-token",
    triagemRequestTimeoutMs: 2_000,
    allowedOrigins: ["*"],
    enableApiDocs: true,
  };
}

describe("contabil-service OpenAPI reporting", () => {
  it("documenta rotas internas com headers obrigatórios de grant", () => {
    const spec = buildContabilServiceOpenApiSpec(createEnv());
    const paths = spec.paths as Record<string, { get?: unknown; post?: unknown }>;
    const schemas = (spec.components as { schemas?: Record<string, unknown> } | undefined)?.schemas;
    const operations = [
      paths["/internal/reporting/catalog"]?.get,
      paths["/internal/reporting/extract"]?.post,
    ] as Array<{ security?: unknown; parameters?: unknown } | undefined>;

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
    expect(schemas).toHaveProperty("ReportingGrantV1");
    const extractBody = (
      paths["/internal/reporting/extract"]?.post as {
        requestBody?: {
          content?: { "application/json"?: { schema?: { properties?: Record<string, unknown> } } };
        };
      }
    ).requestBody?.content?.["application/json"]?.schema;
    expect(extractBody?.properties?.source).toEqual({
      type: "string",
      enum: [
        "contabil.control",
        "contabil.responsibles",
        "contabil.relationship",
        "contabil.triage_clouds",
        "contabil.triage_movement",
      ],
    });
  });
});
