import "./envBootstrap.js";

import { describe, expect, it } from "vitest";

import type { ParcelamentoServiceEnv } from "../config/env.js";
import { buildParcelamentoServiceOpenApiSpec } from "../openapi/spec.js";

function createEnv(): ParcelamentoServiceEnv {
  return {
    port: 3043,
    nodeEnv: "test",
    databaseUrl: "postgresql://user:pass@localhost:5432/db",
    jwtSecret: "test-jwt-secret",
    auditEnabled: true,
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "test-audit-token",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
    enableApiDocs: true,
  };
}

describe("parcelamento-service OpenAPI", () => {
  it("declara schemas referenciados por health e readiness", () => {
    const spec = buildParcelamentoServiceOpenApiSpec(createEnv());
    const schemaRefs = ["/health", "/ready"].map((path) => {
      const response = spec.paths[path]?.get?.responses["200"];

      return response && "content" in response
        ? response.content?.["application/json"]?.schema
        : undefined;
    });

    expect(schemaRefs).toEqual([
      { $ref: "#/components/schemas/SuccessEnvelope" },
      { $ref: "#/components/schemas/SuccessEnvelope" },
    ]);
    for (const schema of schemaRefs) {
      if (schema && "$ref" in schema && typeof schema.$ref === "string") {
        const schemaName = schema.$ref.replace("#/components/schemas/", "");
        expect(spec.components?.schemas).toHaveProperty(schemaName);
      }
    }
  });
});
