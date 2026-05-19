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
