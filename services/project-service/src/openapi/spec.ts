import { MAX_REPORTING_QUERY_LIMIT, reportingQueryOpenApiSchema } from "@workspace/shared";
import type { OpenApiDocument } from "@workspace/shared/http";

import type { ProjectServiceEnv } from "../config/env.js";

export function buildProjectServiceOpenApiSpec(env: ProjectServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;
  const createProjectExample = {
    name: "Implantacao ERP Cliente XPTO",
    client_id: "client-uuid",
    start_date: "2026-04-02T00:00:00.000Z",
    end_date: "2026-05-10T00:00:00.000Z",
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
  const metricsExample = {
    total: 42,
    completed: 12,
    inProgress: 18,
    paused: 4,
    toDo: 6,
    notContracted: 2,
    taskMetrics: {
      total: 128,
      completed: 76,
      open: 44,
      paused: 5,
      emptyStatus: 3,
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "project-service",
      version: "1.0.0",
      description:
        "API de projetos (integração). Requer JWT válido nos endpoints autenticados. " +
        "modules.integracao aplica leitura a partir de 1, criação/edição e progresso a partir de 2 " +
        "e exclusão a partir de 3; progresso concluinte que inativa cliente exige nível 3.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Projetos", description: "CRUD de projetos de integração" },
      { name: "Métricas", description: "Métricas globais de projetos de integração" },
      { name: "Progresso", description: "Progresso do projeto" },
      { name: "InternalReporting", description: "Fonte interna governada para relatórios" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        internalServiceToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrão do workspace",
          additionalProperties: true,
        },
        ReportingGrantV1: {
          type: "object",
          additionalProperties: false,
          required: [
            "version",
            "audience",
            "operation",
            "source",
            "organization_id",
            "fields",
            "request_id",
            "issued_at",
            "expires_at",
            "body_sha256",
          ],
          properties: {
            version: { type: "integer", enum: [1] },
            audience: { type: "string", enum: ["project-service"] },
            operation: { type: "string", enum: ["catalog", "extract"] },
            source: { type: "string" },
            organization_id: { type: "string", format: "uuid" },
            fields: { type: "array", uniqueItems: true, items: { type: "string" } },
            request_id: { type: "string" },
            issued_at: { type: "integer", minimum: 0 },
            expires_at: { type: "integer", minimum: 0 },
            body_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
        },
      },
    },
    paths: {
      "/internal/reporting/catalog": {
        get: {
          tags: ["InternalReporting"],
          summary: "Consultar catálogo interno de Projetos",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            { name: "x-request-id", in: "header", required: true, schema: { type: "string" } },
            {
              name: "x-reports-grant",
              in: "header",
              required: true,
              description: "Grant v1: JSON canônico codificado em base64url.",
              schema: { type: "string" },
            },
            {
              name: "x-reports-grant-signature",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Catálogo governado" },
            "403": { description: "Grant ou token interno inválido" },
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          tags: ["InternalReporting"],
          summary: "Extrair campos governados para relatórios",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            { name: "x-request-id", in: "header", required: true, schema: { type: "string" } },
            { name: "x-reports-grant", in: "header", required: true, schema: { type: "string" } },
            {
              name: "x-reports-grant-signature",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["source", "fields", "limit"],
                  additionalProperties: false,
                  properties: {
                    source: { type: "string", enum: ["integracao.projects"] },
                    fields: { type: "array", minItems: 1, items: { type: "string" } },
                    limit: { type: "integer", minimum: 1, maximum: MAX_REPORTING_QUERY_LIMIT },
                    query: reportingQueryOpenApiSchema,
                  },
                },
              },
            },
          },
          responses: {
            "422": { description: "Capacidade de consulta excedida; nenhum resultado parcial" },
            "200": { description: "Linhas extraídas" },
            "400": { description: "Entrada inválida" },
            "403": { description: "Grant, token ou campo inválido" },
          },
        },
      },
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
                    end_date: {
                      type: "string",
                      format: "date-time",
                      description: "Opcional. Deve ser igual ou posterior à data inicial.",
                    },
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
              description:
                "Criado; data.create.end_date contém a data final ou null quando omitida.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "400": { description: "Entrada inválida ou data final anterior à data inicial." },
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
      "/project/metrics": {
        get: {
          tags: ["Métricas"],
          summary: "Métricas globais de projetos da Integração",
          description:
            "Calcula os cards globais de projetos da Integração em tempo de consulta, sem tabela materializada.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Métricas globais calculadas",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                  example: { success: true, data: metricsExample },
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
