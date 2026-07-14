import type { OpenApiDocument } from "@workspace/shared/http";

import type { ParcelamentoServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

export function buildParcelamentoServiceOpenApiSpec(env: ParcelamentoServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Parcelamento Service",
      version: "1.0.0",
      description: "Fundacao do servico de parcelamento.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [{ name: "Health", description: "Saude do servico" }],
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          operationId: "getParcelamentoHealth",
          responses: {
            "200": { description: "OK", ...successJson },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          operationId: "getParcelamentoReadiness",
          responses: {
            "200": { description: "Ready", ...successJson },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object", additionalProperties: true },
          },
        },
      },
    },
  };
}
