import type { OpenApiDocument } from "@workspace/shared/http";

import type { ClientServiceEnv } from "../config/env.js";

function successEnvelopeContent() {
  return {
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/SuccessEnvelope" },
      },
    },
  };
}

export function buildClientServiceOpenApiSpec(env: ClientServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "client-service",
      version: "1.0.0",
      description:
        "API de clientes. Endpoints autenticados usam JWT e a rota interna usa token dedicado.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Clients", description: "CRUD principal de clientes" },
      { name: "Commercial", description: "Overview comercial baseado em clientes reais" },
      { name: "Integration", description: "Fluxos de integracao de clientes" },
      { name: "Verticals", description: "Atualizacoes por vertical do cliente" },
      { name: "Histories", description: "Historicos e pendencias do cliente" },
      { name: "Internal", description: "Rotinas internas protegidas por token" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        internalToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrao do workspace",
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
              description: "Servico disponivel",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          responses: {
            "200": {
              description: "Servico pronto",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/list": {
        get: {
          tags: ["Clients"],
          summary: "Listar clientes",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "organization_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "ref", in: "query", schema: { type: "string", enum: ["integracao", "deps"] } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "search", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Lista paginada de clientes",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/commercial/overview": {
        get: {
          tags: ["Commercial"],
          summary: "Overview comercial",
          description:
            "Retorna dados comerciais reais derivados de clientes. Dominios sem fonte real retornam zerados.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Overview comercial",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client": {
        post: {
          tags: ["Clients"],
          summary: "Criar cliente",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  required: ["name", "status"],
                  properties: {
                    organization_id: {
                      type: "string",
                      format: "uuid",
                      description:
                        "Opcional. Quando informado, deve corresponder a organizacao autenticada.",
                    },
                    name: { type: "string" },
                    status: { type: "string" },
                    cpf_cnpj: { type: "string" },
                    company_name: { type: ["string", "null"] },
                    fantasy_name: { type: ["string", "null"] },
                    prospecting_status: { type: "string" },
                    type: { type: "string" },
                    type_registration: { type: "string" },
                    service_unique: { type: "boolean" },
                  },
                  example: {
                    organization_id: "550e8400-e29b-41d4-a716-446655440000",
                    name: "Cliente Exemplo",
                    status: "Ativo",
                    cpf_cnpj: "12345678000199",
                    type: "PJ",
                    type_registration: "Novo",
                    service_unique: false,
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Cliente criado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}": {
        get: {
          tags: ["Clients"],
          summary: "Obter cliente por ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Cliente encontrado",
              ...successEnvelopeContent(),
            },
          },
        },
        patch: {
          tags: ["Clients"],
          summary: "Atualizar cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  example: {
                    name: "Cliente Atualizado",
                    company_name: "ACME LTDA",
                    service_unique: true,
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Cliente atualizado",
              ...successEnvelopeContent(),
            },
          },
        },
        delete: {
          tags: ["Clients"],
          summary: "Desativar cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Cliente desativado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/activate": {
        post: {
          tags: ["Clients"],
          summary: "Reativar cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Cliente reativado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/integration": {
        post: {
          tags: ["Integration"],
          summary: "Criar cliente pela integracao",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  required: ["type", "name", "cpf_cnpj"],
                  properties: {
                    organization_id: {
                      type: "string",
                      format: "uuid",
                      description:
                        "Opcional. Quando informado, deve corresponder a organizacao autenticada.",
                    },
                    type: { type: "string" },
                    name: { type: "string" },
                    cpf_cnpj: { type: "string" },
                    company_name: { type: ["string", "null"] },
                    fantasy_name: { type: ["string", "null"] },
                    type_registration: { type: "string" },
                    service_unique: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Cliente de integracao criado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/integration": {
        patch: {
          tags: ["Integration"],
          summary: "Atualizar cliente de integracao",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  example: {
                    company_name: "Empresa Atualizada",
                    email: "contato@empresa.com",
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Cliente de integracao atualizado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/pa": {
        get: {
          tags: ["Clients"],
          summary: "Obter PA do cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Detalhe do PA",
              ...successEnvelopeContent(),
            },
          },
        },
        post: {
          tags: ["Clients"],
          summary: "Criar PA do cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "PA criado",
              ...successEnvelopeContent(),
            },
          },
        },
        patch: {
          tags: ["Clients"],
          summary: "Atualizar PA do cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  example: {
                    activities: "Comercio varejista",
                    works_bidding: false,
                    esocial: true,
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "PA atualizado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/commercial": {
        patch: {
          tags: ["Verticals"],
          summary: "Atualizar dados comerciais",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    prospecting_status: { type: "string" },
                    date_status: { type: "string", format: "date-time" },
                    description_prospecting: { type: ["string", "null"] },
                    register_date_prospecting: { type: "string", format: "date-time" },
                  },
                  required: ["prospecting_status"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Dados comerciais atualizados",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/termination": {
        patch: {
          tags: ["Verticals"],
          summary: "Registrar distrato do cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reason: { type: "string" },
                    description: { type: "string" },
                    competence_output: { type: "string", example: "2026-03" },
                  },
                  required: ["reason", "description", "competence_output"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Distrato processado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/finance": {
        patch: {
          tags: ["Verticals"],
          summary: "Atualizar dados financeiros",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    contract: { type: "boolean" },
                  },
                  required: ["contract"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Dados financeiros atualizados",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/regularize": {
        patch: {
          tags: ["Verticals"],
          summary: "Atualizar dados de regularizacao",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  example: {
                    dominio_code: "123",
                    regime: "Simples Nacional",
                    contabil: true,
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Dados de regularizacao atualizados",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/histories": {
        get: {
          tags: ["Histories"],
          summary: "Listar historicos do cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Lista de historicos",
              ...successEnvelopeContent(),
            },
          },
        },
        post: {
          tags: ["Histories"],
          summary: "Criar historico do cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    date: { type: "string", format: "date-time" },
                    history: { type: "string" },
                    pending_id: { type: "string", format: "uuid" },
                    file: { type: "string", format: "binary" },
                  },
                  required: ["date", "history"],
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Historico criado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/histories/{historyId}": {
        get: {
          tags: ["Histories"],
          summary: "Obter detalhe de historico",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "historyId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Detalhe do historico",
              ...successEnvelopeContent(),
            },
          },
        },
        patch: {
          tags: ["Histories"],
          summary: "Atualizar historico",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "historyId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    date: { type: "string", format: "date-time" },
                    history: { type: "string" },
                  },
                  required: ["date", "history"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Historico atualizado",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/{id}/histories/{historyId}/file": {
        get: {
          tags: ["Histories"],
          summary: "Gerar link temporario para anexo de historico",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "historyId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Link temporario gerado",
              ...successEnvelopeContent(),
            },
            "404": {
              description: "Historico ou anexo nao encontrado",
            },
          },
        },
      },
      "/client/{id}/histories/pending": {
        post: {
          tags: ["Histories"],
          summary: "Criar pendencia de historico",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reason: { type: "string" },
                  },
                  required: ["reason"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Pendencia criada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/histories/pending": {
        get: {
          tags: ["Histories"],
          summary: "Listar pendencias de historico",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "user_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Lista de pendencias",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/client/histories/pending/{pendingId}": {
        delete: {
          tags: ["Histories"],
          summary: "Remover pendencia de historico",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "pendingId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Pendencia removida",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/internal/competence-output-update": {
        post: {
          tags: ["Internal"],
          summary: "Executar rotina interna de competence output",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Rotina executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
    },
  };
}
