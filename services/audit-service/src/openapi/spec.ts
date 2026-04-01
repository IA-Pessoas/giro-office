import type { OpenApiDocument } from "@workspace/shared/http";

import type { AuditServiceEnv } from "../config/env.js";

export function buildAuditServiceOpenApiSpec(env: AuditServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.auditServicePort}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "audit-service",
      version: "1.0.0",
      description:
        "Auditoria interna. Rotas /internal/* e /audit/* exigem token de serviço (header configurado no gateway/serviços).",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Audit", description: "Requisições de auditoria" },
    ],
    components: {
      securitySchemes: {
        internalServiceToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
          description: "Valor igual a AUDIT_SERVICE_TOKEN.",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrão do workspace",
          additionalProperties: true,
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": {
              description: "Serviço disponível",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness",
          responses: {
            "200": {
              description: "Pronto",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/internal/audit/requests": {
        post: {
          tags: ["Audit"],
          summary: "Registrar requisição de auditoria (interno)",
          security: [{ internalServiceToken: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          responses: {
            "201": {
              description: "Criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/audit/requests": {
        get: {
          tags: ["Audit"],
          summary: "Buscar requisições de auditoria (paginação / filtros via query)",
          security: [{ internalServiceToken: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "pageSize", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            "200": {
              description: "Lista",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/audit/requests/{requestId}": {
        get: {
          tags: ["Audit"],
          summary: "Detalhe de uma requisição de auditoria",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "requestId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Registro",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
    },
  };
}
