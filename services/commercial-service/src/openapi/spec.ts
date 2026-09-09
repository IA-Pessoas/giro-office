import type { OpenApiDocument } from "@workspace/shared/http";

import type { CommercialServiceEnv } from "../config/env.js";

const successResponse = {
  description: "Resposta padronizada.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
} as const;

export function buildCommercialServiceOpenApiSpec(env: CommercialServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Commercial Service",
      version: "1.0.0",
      description: "Catálogo mínimo de configurações de proposta do módulo Comercial.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [{ name: "Commercial", description: "Catálogo do módulo Comercial" }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          required: ["success", "data"],
          properties: { success: { type: "boolean" }, data: {} },
        },
        ProposalConfig: {
          type: "object",
          required: ["id", "name", "minimum_wage"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", minLength: 1, maxLength: 120 },
            minimum_wage: { type: "number", minimum: 0 },
          },
        },
        ProposalConfigInput: {
          type: "object",
          additionalProperties: false,
          required: ["name", "minimum_wage"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            minimum_wage: { type: "number", minimum: 0 },
          },
        },
        ProposalConfigPatch: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            minimum_wage: { type: "number", minimum: 0 },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          responses: { "200": successResponse },
        },
      },
      "/commercial/proposal-configs": {
        get: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          responses: { "200": successResponse, "401": { description: "Não autenticado." } },
        },
        post: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProposalConfigInput" } },
            },
          },
          responses: {
            "201": successResponse,
            "400": { description: "Payload inválido." },
            "409": { description: "Nome duplicado." },
          },
        },
      },
      "/commercial/proposal-configs/{id}": {
        get: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": successResponse, "404": { description: "Não encontrado." } },
        },
        patch: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProposalConfigPatch" } },
            },
          },
          responses: {
            "200": successResponse,
            "400": { description: "Payload inválido." },
            "404": { description: "Não encontrado." },
            "409": { description: "Nome duplicado." },
          },
        },
      },
    },
  };
}
