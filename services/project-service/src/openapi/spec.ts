import type { OpenApiDocument } from "@workspace/shared/http";

import type { ProjectServiceEnv } from "../config/env.js";

export function buildProjectServiceOpenApiSpec(env: ProjectServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;
  const createProjectExample = {
    name: "Implantacao ERP Cliente XPTO",
    client_id: "client-uuid",
    start_date: "2026-04-02T00:00:00.000Z",
    objective: "Automatizar fluxo financeiro e fiscal.",
    sponsor_id: "user-uuid",
  };
  const updateProjectExample = {
    project_id: "project-uuid",
    name: "Implantacao ERP Cliente XPTO - fase 2",
    start_date: "2026-04-02T00:00:00.000Z",
    end_date: "2026-05-10T00:00:00.000Z",
    objective: "Concluir rollout e treinamento da equipe.",
    sponsor_id: "user-uuid",
  };
  const progressExample = {
    project_id: "project-uuid",
  };

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
      "/project": {
        post: {
          tags: ["Projetos"],
          summary: "Criar projeto",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    client_id: { type: "string", format: "uuid" },
                    start_date: { type: "string", format: "date-time" },
                    objective: { type: "string" },
                    sponsor_id: { type: "string", format: "uuid" },
                  },
                  required: ["name", "client_id", "start_date", "objective"],
                  additionalProperties: true,
                  example: createProjectExample,
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
        put: {
          tags: ["Projetos"],
          summary: "Atualizar projeto",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    project_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    start_date: { type: "string", format: "date-time" },
                    end_date: { type: "string", format: "date-time" },
                    objective: { type: "string" },
                    sponsor_id: { type: "string", format: "uuid" },
                  },
                  required: ["project_id", "name", "start_date", "end_date", "objective"],
                  additionalProperties: true,
                  example: updateProjectExample,
                },
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
                  required: ["project_id"],
                  example: { project_id: "project-uuid" },
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
      "/project/list": {
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
      },
      "/project/progress": {
        post: {
          tags: ["Progresso"],
          summary: "Recalcular progresso a partir das tarefas",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    project_id: { type: "string", format: "uuid" },
                  },
                  required: ["project_id"],
                  additionalProperties: true,
                  example: progressExample,
                },
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
