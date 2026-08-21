import type { OpenApiDocument } from "@workspace/shared/http";

import type { ReportsServiceEnv } from "../config/env.js";

const successResponse = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

export function buildReportsServiceOpenApiSpec(env: ReportsServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Reports Service",
      version: "1.0.0",
      description: "Contrato do servico de relatorios.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Reports", description: "Catalogo de relatorios" },
    ],
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
        ErrorEnvelope: {
          type: "object",
          required: ["success", "error", "code"],
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string" },
            code: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: { "200": { description: "OK", ...successResponse } },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          responses: { "200": { description: "Ready", ...successResponse } },
        },
      },
      "/reports/catalog": {
        get: {
          tags: ["Reports"],
          summary: "Listar catalogo de relatorios",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Catalogo de relatorios", ...successResponse },
            "401": {
              description: "Contexto autenticado ausente",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                },
              },
            },
          },
        },
      },
      "/reports/preview": {
        post: {
          tags: ["Reports"],
          summary: "Gerar prévia limitada de relatório",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["definition"],
                  properties: { definition: { type: "object", additionalProperties: true } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Prévia limitada", ...successResponse },
            "400": { description: "Definição inválida" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Fonte ou campo não autorizado" },
          },
        },
      },
    },
  };
}
