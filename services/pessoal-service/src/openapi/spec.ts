import type { OpenApiDocument } from "@workspace/shared/http";

import type { PessoalServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

export function buildPessoalServiceOpenApiSpec(env: PessoalServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "pessoal-service",
      version: "1.0.0",
      description: "Servico de Pessoal com contratos modernos para rotinas trabalhistas.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [{ name: "Health", description: "Saude do servico" }],
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
          description: "Resposta de sucesso padrao do workspace",
          additionalProperties: true,
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          operationId: "getPessoalHealth",
          responses: {
            "200": { description: "OK", ...successJson },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          operationId: "getPessoalReadiness",
          responses: {
            "200": { description: "Ready", ...successJson },
          },
        },
      },
    },
  };
}
