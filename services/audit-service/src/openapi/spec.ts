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
                schema: {
                  type: "object",
                  properties: {
                    requestId: { type: "string" },
                    organizationId: { type: ["string", "null"] },
                    userId: { type: ["string", "null"] },
                    permission: { type: ["integer", "null"] },
                    method: { type: "string" },
                    path: { type: "string" },
                    query: { type: "object", additionalProperties: true },
                    statusCode: { type: ["integer", "null"] },
                    outcome: { type: "string" },
                    durationMs: { type: ["integer", "null"] },
                    ip: { type: ["string", "null"] },
                    userAgent: { type: ["string", "null"] },
                    origin: { type: ["string", "null"] },
                    errorCode: { type: ["string", "null"] },
                    errorMessage: { type: ["string", "null"] },
                    serviceSource: { type: "string" },
                    createdAt: { type: "string", format: "date-time" },
                    finishedAt: { type: ["string", "null"], format: "date-time" },
                    metadata: { type: ["object", "null"], additionalProperties: true },
                    action: { type: ["string", "null"] },
                    referring: { type: ["string", "null"] },
                    referringId: { type: ["string", "null"] },
                    changes: {
                      oneOf: [
                        { type: "object", additionalProperties: true },
                        { type: "string" },
                        { type: "null" },
                      ],
                    },
                    department: { type: ["string", "null"] },
                  },
                  required: [
                    "requestId",
                    "method",
                    "path",
                    "outcome",
                    "serviceSource",
                    "createdAt",
                  ],
                  additionalProperties: true,
                  example: {
                    requestId: "request-uuid",
                    organizationId: "organization-uuid",
                    userId: "user-uuid",
                    permission: 3,
                    method: "GET",
                    path: "/users",
                    query: { page: "1" },
                    statusCode: 200,
                    outcome: "success",
                    durationMs: 42,
                    ip: "127.0.0.1",
                    userAgent: "Mozilla/5.0",
                    origin: "http://localhost:3000",
                    errorCode: null,
                    errorMessage: null,
                    serviceSource: "gateway",
                    createdAt: "2026-04-02T10:00:00.000Z",
                    finishedAt: "2026-04-02T10:00:00.042Z",
                    metadata: {
                      responseSizeBytes: 512,
                      routeTarget: "user-service",
                    },
                    action: "user.updated",
                    referring: "user",
                    referringId: "user-uuid",
                    changes: {
                      status: {
                        from: "inactive",
                        to: "active",
                      },
                    },
                    department: "Tecnologia",
                  },
                },
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
