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
      { name: "TI Inventory", description: "Inventario de TI" },
      { name: "TI Inventory Categories", description: "Categorias de inventario de TI" },
      { name: "TI Inventory Locations", description: "Locais de inventario de TI" },
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
        TiInventoryInput: {
          type: "object",
          required: ["asset_code", "category_id"],
          properties: {
            asset_code: { type: "string", minLength: 1 },
            category_id: { type: "string", format: "uuid" },
            location_id: { type: "string", format: "uuid" },
            user_id: { type: "string", format: "uuid" },
            responsible_it_staff_id: { type: "string", format: "uuid" },
            notes: { type: "string" },
            delivery_date: { type: "string", format: "date-time" },
          },
          additionalProperties: false,
        },
        TiInventoryUpdateInput: {
          type: "object",
          properties: {
            asset_code: { type: "string", minLength: 1 },
            category_id: { type: "string", format: "uuid" },
            location_id: { type: "string", format: "uuid" },
            user_id: { type: "string", format: "uuid" },
            responsible_it_staff_id: { type: "string", format: "uuid" },
            notes: { type: "string" },
            delivery_date: { type: "string", format: "date-time" },
          },
          additionalProperties: false,
        },
        TiInventoryAssignInput: {
          type: "object",
          required: ["user_id"],
          properties: {
            user_id: { type: "string", format: "uuid" },
            delivery_date: { type: "string", format: "date-time" },
          },
          additionalProperties: false,
        },
        TiInventoryReturnInput: {
          type: "object",
          properties: {
            return_date: { type: "string", format: "date-time" },
            notes: { type: "string" },
          },
          additionalProperties: false,
        },
        TiInventoryCategoryInput: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1 },
            tag: { type: "string" },
          },
          additionalProperties: false,
        },
        TiInventoryCategoryUpdateInput: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            tag: { type: "string" },
            active: { type: "boolean" },
          },
          additionalProperties: false,
        },
        TiInventoryLocationInput: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1 },
          },
          additionalProperties: false,
        },
        TiInventoryLocationUpdateInput: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            active: { type: "boolean" },
          },
          additionalProperties: false,
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
      "/ti/inventory/list": {
        get: {
          tags: ["TI Inventory"],
          summary: "Lista ativos de inventario de TI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "category_id",
              schema: { type: "string", format: "uuid" },
              required: false,
            },
            {
              in: "query",
              name: "location_id",
              schema: { type: "string", format: "uuid" },
              required: false,
            },
            {
              in: "query",
              name: "user_id",
              schema: { type: "string", format: "uuid" },
              required: false,
            },
            {
              in: "query",
              name: "asset_code",
              schema: { type: "string" },
              required: false,
            },
          ],
          responses: {
            "200": {
              description: "Ativos listados",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/inventory": {
        post: {
          tags: ["TI Inventory"],
          summary: "Cria ativo de inventario de TI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiInventoryInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Ativo criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/inventory/{id}": {
        get: {
          tags: ["TI Inventory"],
          summary: "Busca ativo de inventario de TI",
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
              description: "Ativo encontrado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        patch: {
          tags: ["TI Inventory"],
          summary: "Atualiza ativo de inventario de TI",
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
                schema: { $ref: "#/components/schemas/TiInventoryUpdateInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Ativo atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/inventory/{id}/assign-user": {
        patch: {
          tags: ["TI Inventory"],
          summary: "Atribui usuario ao ativo de inventario de TI",
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
                schema: { $ref: "#/components/schemas/TiInventoryAssignInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Ativo atribuido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/inventory/{id}/return": {
        patch: {
          tags: ["TI Inventory"],
          summary: "Registra devolucao de ativo de inventario de TI",
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
                schema: { $ref: "#/components/schemas/TiInventoryReturnInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Devolucao registrada",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/inventory-categories/list": {
        get: {
          tags: ["TI Inventory Categories"],
          summary: "Lista categorias de inventario de TI",
          security: [{ bearerAuth: [] }],
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
      "/ti/inventory-categories": {
        post: {
          tags: ["TI Inventory Categories"],
          summary: "Cria categoria de inventario de TI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiInventoryCategoryInput" },
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
      "/ti/inventory-categories/{id}": {
        patch: {
          tags: ["TI Inventory Categories"],
          summary: "Atualiza categoria de inventario de TI",
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
                schema: { $ref: "#/components/schemas/TiInventoryCategoryUpdateInput" },
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
      "/ti/inventory-locations/list": {
        get: {
          tags: ["TI Inventory Locations"],
          summary: "Lista locais de inventario de TI",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Locais listados",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/inventory-locations": {
        post: {
          tags: ["TI Inventory Locations"],
          summary: "Cria local de inventario de TI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TiInventoryLocationInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Local criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ti/inventory-locations/{id}": {
        patch: {
          tags: ["TI Inventory Locations"],
          summary: "Atualiza local de inventario de TI",
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
                schema: { $ref: "#/components/schemas/TiInventoryLocationUpdateInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Local atualizado",
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
