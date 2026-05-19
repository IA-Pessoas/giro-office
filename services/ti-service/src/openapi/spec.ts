import type { OpenApiDocument } from "@workspace/shared/http";

import type { TiServiceEnv } from "../config/env.js";

export function buildTiServiceOpenApiSpec(env?: Pick<TiServiceEnv, "port">): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "ti-service",
      version: "1.0.0",
      description: "Servico de Tecnologia da Informacao.",
    },
    servers: [{ url: `http://localhost:${env?.port ?? 3040}` }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "TI Requests", description: "Chamados e mensagens de TI" },
      { name: "TI Request Categories", description: "Categorias de chamados de TI" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrao do workspace",
          additionalProperties: true,
        },
        TiRequestInput: {
          type: "object",
          required: ["title", "description", "category_id"],
          properties: {
            title: { type: "string", minLength: 1 },
            description: { type: "string", minLength: 1 },
            category_id: { type: "string", format: "uuid" },
            requester_id: { type: "string", format: "uuid" },
            assigned_to_id: { type: "string", format: "uuid" },
            urgency: {
              type: "string",
              enum: ["Low", "Medium", "High", "Critical"],
              default: "Medium",
            },
            attachment: { type: "string", format: "uri" },
          },
          additionalProperties: false,
        },
        TiRequestUpdateInput: {
          type: "object",
          properties: {
            title: { type: "string", minLength: 1 },
            description: { type: "string", minLength: 1 },
            category_id: { type: "string", format: "uuid" },
            urgency: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
            attachment: { type: "string", format: "uri" },
          },
          additionalProperties: false,
        },
        TiRequestAssignInput: {
          type: "object",
          required: ["assigned_to_id"],
          properties: {
            assigned_to_id: { type: "string", format: "uuid" },
          },
          additionalProperties: false,
        },
        TiRequestStatusInput: {
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["New", "In_Progress", "Waiting", "Resolved", "Closed"],
            },
          },
          additionalProperties: false,
        },
        TiMessageInput: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string", minLength: 1 },
            attachment: { type: "string", format: "uri" },
            type: {
              type: "string",
              enum: ["Message", "Solution", "Rejection", "Acceptance"],
              default: "Message",
            },
          },
          additionalProperties: false,
        },
        TiRequestCategoryInput: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1 },
          },
          additionalProperties: false,
        },
        TiRequestCategoryUpdateInput: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            active: { type: "boolean" },
          },
          additionalProperties: false,
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
              description: "Servico disponivel",
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
              description: "Servico pronto",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/requests/list": {
        get: {
          tags: ["TI Requests"],
          summary: "Lista chamados de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "status",
              schema: {
                type: "string",
                enum: ["New", "In_Progress", "Waiting", "Resolved", "Closed"],
              },
              required: false,
            },
            {
              in: "query",
              name: "urgency",
              schema: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
              required: false,
            },
            {
              in: "query",
              name: "category_id",
              schema: { type: "string", format: "uuid" },
              required: false,
            },
            {
              in: "query",
              name: "requester_id",
              schema: { type: "string", format: "uuid" },
              required: false,
            },
            {
              in: "query",
              name: "assigned_to_id",
              schema: { type: "string", format: "uuid" },
              required: false,
            },
            {
              in: "query",
              name: "created_from",
              schema: { type: "string", format: "date-time" },
              required: false,
            },
            {
              in: "query",
              name: "created_to",
              schema: { type: "string", format: "date-time" },
              required: false,
            },
          ],
          responses: {
            "200": {
              description: "Chamados listados",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/requests": {
        post: {
          tags: ["TI Requests"],
          summary: "Cria chamado de TI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiRequestInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Chamado criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/requests/{id}": {
        get: {
          tags: ["TI Requests"],
          summary: "Busca chamado de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              schema: { type: "string", format: "uuid" },
              required: true,
            },
          ],
          responses: {
            "200": {
              description: "Chamado encontrado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        patch: {
          tags: ["TI Requests"],
          summary: "Atualiza chamado de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              schema: { type: "string", format: "uuid" },
              required: true,
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiRequestUpdateInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Chamado atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/requests/{id}/assign": {
        patch: {
          tags: ["TI Requests"],
          summary: "Atribui responsavel ao chamado de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              schema: { type: "string", format: "uuid" },
              required: true,
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiRequestAssignInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Chamado atribuido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/requests/{id}/status": {
        patch: {
          tags: ["TI Requests"],
          summary: "Atualiza status do chamado de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              schema: { type: "string", format: "uuid" },
              required: true,
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiRequestStatusInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Status atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/requests/{id}/messages": {
        get: {
          tags: ["TI Requests"],
          summary: "Lista mensagens de um chamado de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              schema: { type: "string", format: "uuid" },
              required: true,
            },
            {
              in: "query",
              name: "created_from",
              schema: { type: "string", format: "date-time" },
              required: false,
            },
            {
              in: "query",
              name: "created_to",
              schema: { type: "string", format: "date-time" },
              required: false,
            },
          ],
          responses: {
            "200": {
              description: "Mensagens listadas",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        post: {
          tags: ["TI Requests"],
          summary: "Cria mensagem em chamado de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              schema: { type: "string", format: "uuid" },
              required: true,
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiMessageInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Mensagem criada",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/request-categories/list": {
        get: {
          tags: ["TI Request Categories"],
          summary: "Lista categorias de chamados de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "active",
              schema: { type: "string", enum: ["true", "false"] },
              required: false,
            },
          ],
          responses: {
            "200": {
              description: "Categorias listadas",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/request-categories": {
        post: {
          tags: ["TI Request Categories"],
          summary: "Cria categoria de chamado de TI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiRequestCategoryInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Categoria criada",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/request-categories/{id}": {
        patch: {
          tags: ["TI Request Categories"],
          summary: "Atualiza categoria de chamado de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              schema: { type: "string", format: "uuid" },
              required: true,
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiRequestCategoryUpdateInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Categoria atualizada",
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
