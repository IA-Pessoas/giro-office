import { MAX_REPORTING_QUERY_LIMIT, reportingQueryOpenApiSchema } from "@workspace/shared";
import type { OpenApiDocument } from "@workspace/shared/http";
import { TAX_REGIME_OPTIONS } from "@workspace/shared/regularize";

import type { ClientServiceEnv } from "../config/env.js";

type OpenApiSchema = Record<string, unknown>;

const clientAddressOpenApiProperties = {
  address: { type: ["string", "null"] },
  cep: { type: ["string", "null"] },
  neighborhood: { type: ["string", "null"] },
  state: { type: ["string", "null"] },
  city: { type: ["string", "null"] },
};

const reportingGrantParameters = [
  {
    name: "x-request-id",
    in: "header",
    required: true,
    schema: { type: "string", maxLength: 128 },
  },
  {
    name: "x-reports-grant",
    in: "header",
    required: true,
    schema: { type: "string" },
  },
  {
    name: "x-reports-grant-signature",
    in: "header",
    required: true,
    schema: { type: "string" },
  },
];

const reportingExtractResponseSchema: OpenApiSchema = {
  type: "object",
  required: ["rows", "reachedLimit"],
  properties: {
    rows: { type: "array", items: { type: "object", additionalProperties: true } },
    reachedLimit: { type: "boolean" },
  },
};

function successEnvelopeContent(dataSchema?: OpenApiSchema) {
  return {
    content: {
      "application/json": {
        schema: dataSchema
          ? {
              type: "object",
              properties: {
                success: { type: "boolean", enum: [true] },
                data: dataSchema,
              },
              required: ["success", "data"],
              additionalProperties: true,
            }
          : { $ref: "#/components/schemas/SuccessEnvelope" },
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
        "API de clientes. Endpoints autenticados usam JWT e a rota interna usa token dedicado. " +
        "A listagem de clientes aceita Viewer global ou leitura (nível 1+) em um módulo de cliente. " +
        "As rotas de Integração aplicam modules.integracao 0–3: leitura a partir de 1, " +
        "criação/edição a partir de 2 e ativação/inativação a partir de 3.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Clients", description: "CRUD principal de clientes" },
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
        ClientOrganization: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name", "slug", "status", "subscription_plan"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            slug: { type: "string" },
            logo_url: { type: ["string", "null"] },
            status: { type: "string" },
            subscription_plan: { type: "string" },
          },
        },
        ClientDetail: {
          type: "object",
          additionalProperties: true,
          required: [
            "id",
            "name",
            "organization_id",
            "status",
            "cpf_cnpj",
            "service_unique",
            "deletion_date",
            "organization",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            organization_id: { type: "string", format: "uuid" },
            status: { type: "string" },
            cpf_cnpj: { type: "string" },
            company_name: { type: ["string", "null"] },
            fantasy_name: { type: ["string", "null"] },
            service_unique: { type: "boolean" },
            deletion_date: { type: ["string", "null"], format: "date-time" },
            organization: { $ref: "#/components/schemas/ClientOrganization" },
            dominio_code: { type: ["string", "null"] },
            address: { type: ["string", "null"] },
            cep: { type: ["string", "null"] },
            neighborhood: { type: ["string", "null"] },
            state: { type: ["string", "null"] },
            city: { type: ["string", "null"] },
            customer_since: { type: ["string", "null"], format: "date-time" },
            municipal_registration: { type: ["string", "null"] },
            state_registration: { type: ["string", "null"] },
            commercial_board_registration: { type: ["string", "null"] },
            competence_entry: { type: ["string", "null"], format: "date-time" },
            competence_output: { type: ["string", "null"], format: "date-time" },
            opening_date: {
              type: ["string", "null"],
              format: "date-time",
              description: "Não pode ser no futuro (fuso de São Paulo); 400 caso contrário.",
            },
            instagram: { type: ["string", "null"] },
            indication: { type: ["string", "null"] },
            regime: { type: ["string", "null"] },
            size: { type: ["string", "null"] },
            segment: { type: ["string", "null"] },
            start_strike: { type: ["string", "null"], format: "date-time" },
            end_strike: { type: ["string", "null"], format: "date-time" },
            cnae: {
              type: ["string", "null"],
              description: "7 dígitos, com ou sem máscara (ex.: 6201-5/01); vazio limpa o campo.",
            },
            cnae_secondary: { type: ["string", "null"] },
            responsible: { type: ["string", "null"] },
            cpf_responsible: { type: ["string", "null"] },
            agent: { type: ["string", "null"] },
            cpf_agent: { type: ["string", "null"] },
            number: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            contabil: { type: ["boolean", "null"] },
            fiscal: { type: ["boolean", "null"] },
            pessoal: { type: ["boolean", "null"] },
            infoproduto: { type: ["boolean", "null"] },
            consultoria: { type: ["boolean", "null"] },
            castelo_med: { type: ["boolean", "null"] },
            contract: { type: ["boolean", "null"] },
            date_status: { type: ["string", "null"], format: "date-time" },
            description_prospecting: { type: ["string", "null"] },
            participants_meet: { type: ["string", "null"] },
            meet_type: { type: ["string", "null"] },
            register_date_prospecting: { type: ["string", "null"], format: "date-time" },
          },
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
      "/client/instagram-profiles/report": {
        get: {
          tags: ["Clients"],
          summary: "Listar clientes com ou sem perfil Instagram",
          description:
            "Leitura organizacional protegida pela permissão de Integração nível 1 ou superior. O escopo vem da organização autenticada.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "profile",
              in: "query",
              schema: { type: "string", enum: ["all", "with", "without"], default: "all" },
            },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            { name: "search", in: "query", schema: { type: "string", maxLength: 200 } },
          ],
          responses: {
            "200": {
              description: "Relatório paginado de perfis Instagram dos clientes da organização",
              ...successEnvelopeContent(),
            },
            "400": { description: "Filtros inválidos" },
            "401": { description: "Não autenticado" },
            "403": { description: "Permissão insuficiente" },
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
                    ...clientAddressOpenApiProperties,
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
              ...successEnvelopeContent({ $ref: "#/components/schemas/ClientDetail" }),
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
                  properties: clientAddressOpenApiProperties,
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
        get: {
          tags: ["Integration"],
          summary: "Consultar dados oficiais de CNPJ",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "cnpj",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 14, maxLength: 32 },
            },
          ],
          responses: {
            "200": {
              description: "Dados oficiais da empresa",
              ...successEnvelopeContent(),
            },
          },
        },
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
                    regime: { type: ["string", "null"], enum: [...TAX_REGIME_OPTIONS, null] },
                    name: { type: "string" },
                    cpf_cnpj: { type: "string" },
                    company_name: { type: ["string", "null"] },
                    fantasy_name: { type: ["string", "null"] },
                    type_registration: { type: "string" },
                    service_unique: { type: "boolean" },
                    ...clientAddressOpenApiProperties,
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
                  properties: {
                    ...clientAddressOpenApiProperties,
                    regime: {
                      type: ["string", "null"],
                      enum: [...TAX_REGIME_OPTIONS, null],
                    },
                  },
                  example: {
                    company_name: "Empresa Atualizada",
                    email: "contato@empresa.com",
                    regime: "Lucro Real",
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
        delete: {
          tags: ["Histories"],
          summary: "Excluir historico (autor, admin ou owner)",
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
              description: "Historico excluido",
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
      "/internal/commercial/prospecting-transition": {
        post: {
          tags: ["Internal"],
          summary: "Aplicar projeção comercial idempotente no Cliente",
          security: [{ internalToken: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { type: "object", additionalProperties: false } },
            },
          },
          responses: {
            "200": {
              description: "Projeção aplicada ou já processada",
              ...successEnvelopeContent(),
            },
            "403": { description: "Token interno inválido" },
            "409": { description: "Evento de outro tenant" },
          },
        },
      },
      "/internal/reporting/catalog": {
        get: {
          tags: ["Internal"],
          summary: "Catálogo de Integração para relatórios internos",
          security: [{ internalToken: [] }],
          parameters: reportingGrantParameters,
          responses: {
            "200": { description: "Catálogo autorizado", ...successEnvelopeContent() },
            "403": { description: "Token ou grant inválido" },
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          tags: ["Internal"],
          summary: "Extrair campos publicados de clientes para relatórios internos",
          security: [{ internalToken: [] }],
          parameters: reportingGrantParameters,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["source", "fields", "limit"],
                  properties: {
                    source: { type: "string", enum: ["integracao.clients"] },
                    fields: { type: "array", minItems: 1, maxItems: 25, items: { type: "string" } },
                    limit: { type: "integer", minimum: 1, maximum: MAX_REPORTING_QUERY_LIMIT },
                    query: reportingQueryOpenApiSchema,
                  },
                },
              },
            },
          },
          responses: {
            "422": { description: "Capacidade de consulta excedida; nenhum resultado parcial" },
            "200": {
              description: "Linhas autorizadas",
              ...successEnvelopeContent(reportingExtractResponseSchema),
            },
            "403": { description: "Token, grant ou campos inválidos" },
          },
        },
      },
    },
  };
}
