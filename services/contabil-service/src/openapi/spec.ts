import { MAX_REPORTING_QUERY_LIMIT, reportingQueryOpenApiSchema } from "@workspace/shared";
import type { OpenApiDocument } from "@workspace/shared/http";

import type { ContabilServiceEnv } from "../config/env.js";
import { TRIAGE_CATALOG_CODE_MAX_LENGTH } from "../constants/triageDocuments.js";

export function buildContabilServiceOpenApiSpec(env: ContabilServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  const createControlExample = {
    client_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    competence: "2026-01",
  };

  const patchControlExample = {
    field: "notes",
    value: "Observação do fechamento.",
  };

  const createResponsibleExample = {
    client_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    person_responsible_id: "7b9e3f1a-2c4d-5e6f-7890-abcdef123456",
    posted_by_id: "8c0f4a2b-3d5e-6f70-8901-bcdef1234567",
    customer_with_movement: true,
  };

  const updateResponsibleExample = {
    customer_with_movement: false,
  };

  const createRelationshipExample = {
    client_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    bidding: true,
    chart_accounts: "Plano referencial",
    tool: "Domínio",
    system: "ERP X",
    note: "Cliente em implantação.",
  };

  const updateRelationshipExample = {
    note: "Atualizado após reunião.",
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "contabil-service",
      version: "1.0.0",
      description:
        "API contábil: controles operacionais por cliente e competência, responsáveis e relacionamento contábil. Endpoints autenticados exigem JWT válido.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde e readiness do serviço" },
      {
        name: "Controls",
        description: "Checklist operacional por cliente e competência",
      },
      {
        name: "Responsibles",
        description: "Responsáveis contábeis por cliente",
      },
      {
        name: "Relationships",
        description: "Relacionamento contábil do cliente",
      },
      {
        name: "Triage Documents",
        description: "Pendências documentais e marcadores de extrato",
      },
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
        TriageAccountingSummary: {
          type: "object",
          required: [
            "version",
            "organization_id",
            "client_id",
            "legal_name",
            "competence",
            "status",
          ],
          properties: {
            version: { type: "integer", enum: [1] },
            organization_id: { type: "string", format: "uuid" },
            client_id: { type: "string", format: "uuid" },
            legal_name: { type: "string" },
            competence: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            status: {
              type: "string",
              enum: [
                "URGENT_OPEN",
                "ROUTINE_PENDING",
                "BANK_PENDING",
                "COMPLETE",
                "NO_APPLICABLE_ITEMS",
              ],
            },
          },
        },
        TriageMonthlySuccessEnvelope: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean", enum: [true] },
            data: {
              type: "object",
              nullable: true,
              description: "null no GET quando ainda não há pendência mensal (estado vazio).",
              additionalProperties: true,
              properties: {
                triagem_summary: {
                  oneOf: [
                    { $ref: "#/components/schemas/TriageAccountingSummary" },
                    { type: "null" },
                  ],
                  description: "Resumo da Triagem; null quando o serviço estiver indisponível.",
                },
              },
            },
          },
        },
        ReportingGrantV1: {
          type: "object",
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
            audience: { type: "string", enum: ["contabil-service"] },
            operation: { type: "string", enum: ["catalog", "extract"] },
            source: { type: "string" },
            organization_id: { type: "string", format: "uuid" },
            fields: { type: "array", items: { type: "string" } },
            request_id: { type: "string" },
            issued_at: { type: "integer" },
            expires_at: {
              type: "integer",
              description: "Máximo de 60 segundos após issued_at.",
            },
            body_sha256: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/internal/reporting/catalog": {
        get: {
          tags: ["Health"],
          summary: "Catálogo interno de Controle Contábil",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "x-request-id",
              in: "header",
              required: true,
              schema: { type: "string" },
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
          ],
          responses: {
            "200": {
              description: "Catálogo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Grant inválido" },
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          tags: ["Health"],
          summary: "Extrair Controle Contábil para relatórios",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "x-request-id",
              in: "header",
              required: true,
              schema: { type: "string" },
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
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["source", "fields", "limit"],
                  properties: {
                    source: {
                      type: "string",
                      enum: ["contabil.control", "contabil.responsibles", "contabil.relationship"],
                    },
                    fields: { type: "array", items: { type: "string" } },
                    limit: {
                      type: "integer",
                      minimum: 1,
                      maximum: MAX_REPORTING_QUERY_LIMIT,
                    },
                    query: reportingQueryOpenApiSchema,
                  },
                },
              },
            },
          },
          responses: {
            "422": {
              description: "Capacidade de consulta excedida; nenhum resultado parcial",
            },
            "200": {
              description: "Linhas limitadas",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Grant ou campo inválido" },
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
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          responses: {
            "200": {
              description: "Serviço pronto para tráfego",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/controls": {
        post: {
          tags: ["Controls"],
          summary: "Criar ou obter controle contábil",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: {
                      type: "string",
                      pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
                    },
                  },
                  example: createControlExample,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Controle já existente (retorno idempotente)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "201": {
              description: "Controle criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        get: {
          tags: ["Controls"],
          summary: "Detalhe do controle por cliente e competência",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "competence",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            },
          ],
          responses: {
            "200": {
              description: "Controle encontrado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Controls"],
          summary: "Arquivar competência e rastreadores relacionados",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Competência arquivada",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "404": { description: "Competência ativa ausente" },
          },
        },
      },
      "/contabil/controls/list": {
        get: {
          tags: ["Controls"],
          summary: "Carteira operacional por competência",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "competence",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
              example: "2026-01",
            },
          ],
          responses: {
            "200": {
              description: "Uma linha por cliente Contábil elegível; controle ausente é null",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "400": { description: "Competência inválida" },
            "401": { description: "Não autenticado" },
          },
        },
      },
      "/contabil/controls/year": {
        post: {
          tags: ["Controls"],
          summary: "Criar as doze competências de um cliente",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "year", "confirmed"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    year: { type: "integer", minimum: 2000, maximum: 2100 },
                    confirmed: { type: "boolean", enum: [true] },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Lote criado ou já existente",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Confirmação ou payload inválido" },
            "403": { description: "Sem permissão" },
          },
        },
      },
      "/contabil/controls/restore": {
        post: {
          tags: ["Controls"],
          summary: "Restaurar competência arquivada",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Competência restaurada",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "404": { description: "Competência arquivada ausente" },
          },
        },
      },
      "/contabil/controls/{id}/items": {
        patch: {
          tags: ["Controls"],
          summary: "Concluir os 17 itens do controle",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Itens concluídos",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "403": { description: "Sem permissão" },
          },
        },
      },
      "/contabil/controls/{id}": {
        patch: {
          tags: ["Controls"],
          summary: "Atualizar um campo do controle",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
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
                  required: ["field", "value"],
                  additionalProperties: false,
                  properties: {
                    field: { type: "string" },
                    value: {
                      oneOf: [{ type: "boolean" }, { type: "string" }],
                    },
                  },
                  example: patchControlExample,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Campo atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/responsibles": {
        post: {
          tags: ["Responsibles"],
          summary: "Cadastrar responsável contábil",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    person_responsible_id: { type: "string", format: "uuid" },
                    posted_by_id: { type: "string", format: "uuid" },
                    customer_with_movement: { type: "boolean" },
                  },
                  example: createResponsibleExample,
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
      "/contabil/responsibles/{id}": {
        put: {
          tags: ["Responsibles"],
          summary: "Atualizar responsável contábil",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
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
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    person_responsible_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    posted_by_id: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                    },
                    customer_with_movement: { type: "boolean" },
                  },
                  example: updateResponsibleExample,
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
          tags: ["Responsibles"],
          summary: "Remover responsável contábil",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Removido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/responsibles/client/{clientId}": {
        get: {
          tags: ["Responsibles"],
          summary: "Obter responsável por cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "clientId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Registro encontrado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/relationships": {
        post: {
          tags: ["Relationships"],
          summary: "Cadastrar relacionamento contábil",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "bidding", "chart_accounts", "tool", "system", "note"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    bidding: { type: "boolean" },
                    chart_accounts: { type: "string" },
                    tool: { type: "string" },
                    system: { type: "string" },
                    note: { type: "string" },
                  },
                  example: createRelationshipExample,
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
      "/contabil/relationships/{id}": {
        put: {
          tags: ["Relationships"],
          summary: "Atualizar relacionamento contábil",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
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
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    bidding: { type: "boolean" },
                    chart_accounts: { type: "string" },
                    tool: { type: "string" },
                    system: { type: "string" },
                    note: { type: "string" },
                  },
                  example: updateRelationshipExample,
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
          tags: ["Relationships"],
          summary: "Remover relacionamento contábil",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Removido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/relationships/client/{clientId}": {
        get: {
          tags: ["Relationships"],
          summary: "Obter relacionamento por cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "clientId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Registro encontrado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/triagem/fiscal-portfolio": {
        get: {
          tags: ["Triage Documents"],
          summary: "Listar carteira mensal da Triagem Fiscal",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "competence",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            },
          ],
          responses: {
            "200": {
              description: "Empresas fiscais e status documentais da competência",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
          },
        },
      },
      "/triagem/editability": {
        get: {
          tags: ["Triage Documents"],
          summary: "Verificar edição de Triagem por cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "type",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["CONTABIL", "FISCAL"], default: "CONTABIL" },
            },
          ],
          responses: {
            "200": {
              description: "Permissão contextual do usuário autenticado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/triagem/monthly": {
        get: {
          tags: ["Triage Documents"],
          summary: "Consultar pendência documental mensal",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "competence",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            },
            {
              name: "type",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["CONTABIL", "FISCAL"], default: "CONTABIL" },
            },
          ],
          responses: {
            "200": {
              description: "Pendência",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TriageMonthlySuccessEnvelope" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Triage Documents"],
          summary: "Criar ou obter pendência documental mensal",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: {
                      type: "string",
                      pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
                    },
                    type: { type: "string", enum: ["CONTABIL", "FISCAL"] },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Pendência criada ou existente",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Sem permissão para criar" },
          },
        },
      },
      "/triagem/monthly/{id}/item": {
        patch: {
          tags: ["Triage Documents"],
          summary: "Atualizar documento",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
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
                  required: ["field"],
                  additionalProperties: false,
                  properties: {
                    field: {
                      type: "string",
                      enum: [
                        "financial_transactions",
                        "triaged_transactions",
                        "inventory_control",
                        "accounts_payable_report",
                        "accounts_receivable_report",
                        "card_statements",
                        "loan_agreements",
                        "bank_reconciliation",
                        "bank_investments",
                        "card_sales_report",
                        "inbound_report",
                        "outbound_report",
                        "nfse_provided",
                        "nfse_received",
                        "cte_documents",
                        "mei_documents",
                        "nfce_documents",
                        "sped_fiscal",
                        "sped_contributions",
                        "model_21_invoice",
                        "cte_as_issuer",
                        "services_provided_as_mei",
                        "billing_amount",
                      ],
                    },
                    type: { type: "string", enum: ["CONTABIL", "FISCAL"] },
                    status: {
                      type: "string",
                      enum: [
                        "PENDING",
                        "COMPLETED",
                        "ATTENTION",
                        "UNDER_REVIEW",
                        "NOT_PRESENT",
                        "NOT_APPLICABLE",
                      ],
                    },
                    note: {
                      type: "string",
                      nullable: true,
                      maxLength: 2000,
                    },
                    justification: {
                      type: "string",
                      nullable: true,
                      maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH,
                    },
                    value: { type: "string", nullable: true, maxLength: 2000 },
                    delivery_method: {
                      type: "string",
                      minLength: 1,
                      maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH,
                      nullable: true,
                    },
                    state_site: {
                      type: "string",
                      minLength: 1,
                      maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH,
                      nullable: true,
                    },
                  },
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
            "403": { description: "Sem permissão" },
          },
        },
      },
      "/triagem/monthly/{id}/items": {
        patch: {
          tags: ["Triage Documents"],
          summary: "Atualizar todos os documentos aplicáveis",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
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
                  required: ["status"],
                  additionalProperties: false,
                  properties: {
                    status: {
                      type: "string",
                      enum: [
                        "PENDING",
                        "COMPLETED",
                        "ATTENTION",
                        "UNDER_REVIEW",
                        "NOT_PRESENT",
                        "NOT_APPLICABLE",
                      ],
                    },
                    type: { type: "string", enum: ["CONTABIL", "FISCAL"] },
                  },
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
            "403": { description: "Sem permissão" },
          },
        },
      },
      "/triagem/statements": {
        get: {
          tags: ["Triage Documents"],
          summary: "Listar marcadores de extrato por banco",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "competence",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            },
          ],
          responses: {
            "200": {
              description: "Marcadores",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        put: {
          tags: ["Triage Documents"],
          summary: "Criar ou atualizar marcador de extrato",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence", "bank_id", "status"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
                    bank_id: {
                      type: "string",
                      description:
                        "Identificador operacional do banco; não armazena dados de conta.",
                    },
                    status: {
                      type: "string",
                      enum: [
                        "PENDING",
                        "COMPLETED",
                        "ATTENTION",
                        "UNDER_REVIEW",
                        "NOT_PRESENT",
                        "NOT_APPLICABLE",
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Marcador atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Sem permissão" },
          },
        },
        delete: {
          tags: ["Triage Documents"],
          summary: "Arquivar marcador de extrato",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence", "bank_id"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
                    bank_id: {
                      type: "string",
                      description: "Identificador operacional do banco.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Marcador arquivado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Sem permissão" },
            "404": { description: "Marcador não encontrado" },
          },
        },
      },
      "/triagem/closing": {
        get: {
          tags: ["Triage Closing"],
          summary: "Consultar estado do fechamento recebido",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "competence",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            },
          ],
          responses: {
            "200": {
              description: "Estado do fechamento; ausência retorna NOT_RECEIVED sem criar registro",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        put: {
          tags: ["Triage Closing"],
          summary: "Atualizar estado do fechamento recebido",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence", "status"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
                    status: {
                      type: "string",
                      enum: ["NOT_RECEIVED", "RECEIVED", "UNDER_REVIEW", "CLOSED", "REOPENED"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Fechamento atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Sem permissão" },
          },
        },
        delete: {
          tags: ["Triage Closing"],
          summary: "Arquivar logicamente o fechamento recebido",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Fechamento arquivado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Sem permissão" },
            "404": { description: "Fechamento não encontrado" },
          },
        },
      },
    },
  };
}
