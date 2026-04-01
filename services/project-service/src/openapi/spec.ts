import type { OpenApiDocument } from "@workspace/shared/http";

import type { ProjectServiceEnv } from "../config/env.js";

export function buildProjectServiceOpenApiSpec(env: ProjectServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "project-service",
      version: "1.0.0",
      description: "API de projetos (integração). Requer JWT válido nos endpoints autenticados.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Projetos", description: "CRUD de projetos de integração" },
      { name: "Progresso", description: "Progresso do projeto" },
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
      "/integracao-projects": {
        post: {
          tags: ["Projetos"],
          summary: "Criar projeto",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
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
        get: {
          tags: ["Projetos"],
          summary: "Listar projetos",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "ref", in: "query", schema: { type: "string" } },
            { name: "id", in: "query", schema: { type: "string", format: "uuid" } },
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
        put: {
          tags: ["Projetos"],
          summary: "Atualizar projeto",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          responses: {
            "200": {
              description: "Atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/integracao-project": {
        get: {
          tags: ["Projetos"],
          summary: "Detalhe do projeto",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "project_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Detalhe",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Projetos"],
          summary: "Excluir projeto",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "project_id",
              in: "query",
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { project_id: { type: "string", format: "uuid" } },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Excluído",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/integracao-project-progress": {
        post: {
          tags: ["Progresso"],
          summary: "Recalcular progresso a partir das tarefas",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          responses: {
            "200": {
              description: "Resultado",
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
