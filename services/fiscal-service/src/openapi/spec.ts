import { MAX_REPORTING_QUERY_LIMIT, reportingQueryOpenApiSchema } from "@workspace/shared";
import type { OpenApiDocument } from "@workspace/shared/http";

import type { FiscalServiceEnv } from "../config/env.js";

export function buildFiscalServiceOpenApiSpec(env: FiscalServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  const createIcmsExample = {
    state: "SP",
    item_number: "1001",
    cest_code: "12.345.67",
    description: "ICMS example description",
    interstate_agreement: "Convênio ICMS",
    applied_original_mva: "10.00",
    adjusted_mva: "12.00",
    original_mva: "8.00",
  };

  const updateIcmsExample = {
    icms_id: "icms-uuid",
    state: "SP",
    item_number: "1001",
    cest_code: "12.345.67",
    description: "ICMS example description updated",
    interstate_agreement: "Convênio ICMS",
    applied_original_mva: "10.00",
    adjusted_mva: "12.00",
    original_mva: "8.00",
  };

  const createIpiExample = {
    ncm: "84719012",
    ex: "001",
    description: "IPI example description",
    aliquot: "10.00",
  };

  const updateIpiExample = {
    ipi_id: "ipi-uuid",
    ncm: "84719012",
    ex: "001",
    description: "IPI example description updated",
    aliquot: "12.00",
  };

  const createNcmExample = {
    tax_regime: "Simples Nacional",
    ncm_code: "84719012",
    federal_taxation_type: "Monofásica",
    description: "Unidade de processamento digital",
    validity_start_date: "2026-01-01T00:00:00.000Z",
  };

  const updateNcmExample = {
    ncm_id: "ncm-uuid",
    tax_regime: "Simples Nacional",
    ncm_code: "84719012",
    federal_taxation_type: "Monofásica",
    description: "Unidade de processamento digital - atualizado",
    validity_start_date: "2026-01-01T00:00:00.000Z",
  };

  const paginationParameters = [
    {
      name: "page",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1 },
      description: "Página da listagem. Padrão: 1.",
    },
    {
      name: "page_size",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 100 },
      description: "Quantidade de registros por página. Padrão: 50.",
    },
  ];

  const paginatedListEnvelopeSchema = {
    type: "object",
    required: ["success", "data"],
    additionalProperties: true,
    properties: {
      success: { type: "boolean", example: true },
      data: {
        type: "object",
        required: ["data", "total", "page", "limit", "hasMore"],
        properties: {
          data: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          total: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1 },
          limit: { type: "integer", minimum: 1 },
          hasMore: { type: "boolean" },
        },
      },
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "fiscal-service",
      version: "1.0.0",
      description:
        "API fiscal: CRUD de NCM, ICMS e IPI, busca por NCM e emissão de alíquotas informadas pelo Fiscal. Requer JWT válido nos endpoints autenticados.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Busca Fiscal", description: "Busca agregada NCM + ICMS + IPI" },
      { name: "ICMS", description: "CRUD de ICMS" },
      { name: "IPI", description: "CRUD de IPI" },
      { name: "NCM", description: "CRUD de NCM" },
      { name: "Alíquotas", description: "Registro manual e PDF de ISS/ICMS por empresa" },
      {
        name: "Receitas",
        description: "Receita bruta mensal por cliente, base do Simples Nacional",
      },
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
      "/internal/reporting/catalog": {
        get: {
          tags: ["InternalReporting"],
          summary: "Consultar catálogo interno de ICMS, IPI e NCM fiscal",
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
          responses: {
            "200": {
              description: "Catálogo governado",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "403": { description: "Grant ou token interno inválido" },
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          tags: ["InternalReporting"],
          summary: "Extrair campos governados de ICMS, IPI ou NCM fiscal",
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
                    source: {
                      type: "string",
                      enum: ["fiscal.icms", "fiscal.ncm", "fiscal.ipi"],
                    },
                    fields: {
                      type: "array",
                      minItems: 1,
                      maxItems: 25,
                      uniqueItems: true,
                      items: { type: "string" },
                    },
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
            "422": { description: "Capacidade de consulta excedida; nenhum resultado parcial" },
            "200": {
              description: "Linhas limitadas",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida" },
            "403": { description: "Grant, token ou campo inválido" },
          },
        },
      },
      "/fiscal/ncm": {
        post: {
          tags: ["NCM"],
          summary: "Criar NCM",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tax_regime: { type: "string" },
                    ncm_code: { type: "string", pattern: "^\\d+$" },
                    federal_taxation_type: { type: "string" },
                    description: { type: "string" },
                    ncm_notes: { type: "string" },
                    cst_pis_outgoing: { type: "string" },
                    cst_cofins_outgoing: { type: "string" },
                    product_group: { type: "string" },
                    validity_start_date: { type: "string", format: "date-time" },
                    information_source: { type: "string" },
                    reference_legislation: { type: "string" },
                    validity_end_date: { type: "string", format: "date-time" },
                  },
                  required: [
                    "tax_regime",
                    "ncm_code",
                    "federal_taxation_type",
                    "description",
                    "validity_start_date",
                  ],
                  additionalProperties: true,
                  example: createNcmExample,
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
          tags: ["NCM"],
          summary: "Detalhe do NCM",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "ncm_id",
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
          tags: ["NCM"],
          summary: "Atualizar NCM",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ncm_id: { type: "string", format: "uuid" },
                    tax_regime: { type: "string" },
                    ncm_code: { type: "string", pattern: "^\\d+$" },
                    federal_taxation_type: { type: "string" },
                    description: { type: "string" },
                    ncm_notes: { type: "string" },
                    cst_pis_outgoing: { type: "string" },
                    cst_cofins_outgoing: { type: "string" },
                    product_group: { type: "string" },
                    validity_start_date: { type: "string", format: "date-time" },
                    information_source: { type: "string" },
                    reference_legislation: { type: "string" },
                    validity_end_date: { type: "string", format: "date-time" },
                  },
                  required: [
                    "ncm_id",
                    "tax_regime",
                    "ncm_code",
                    "federal_taxation_type",
                    "description",
                    "validity_start_date",
                  ],
                  additionalProperties: true,
                  example: updateNcmExample,
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
          tags: ["NCM"],
          summary: "Excluir NCM",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "ncm_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Excluido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Permissao fiscal admin requerida" },
          },
        },
      },
      "/fiscal/ncm/list": {
        get: {
          tags: ["NCM"],
          summary: "Listar NCMs paginados",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "ncmCodes",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Termos ou códigos NCM parciais separados por vírgula",
            },
            ...paginationParameters,
          ],
          responses: {
            "200": {
              description: "Lista paginada",
              content: {
                "application/json": {
                  schema: paginatedListEnvelopeSchema,
                },
              },
            },
          },
        },
      },
      "/fiscal/icms": {
        post: {
          tags: ["ICMS"],
          summary: "Criar ICMS",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    state: { type: "string" },
                    item_number: { type: "string" },
                    cest_code: { type: "string" },
                    description: { type: "string" },
                    interstate_agreement: { type: "string" },
                    applied_original_mva: { type: "string" },
                    adjusted_mva: { type: "string" },
                    original_mva: { type: "string" },
                  },
                  required: ["state", "description"],
                  additionalProperties: true,
                  example: createIcmsExample,
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
          tags: ["ICMS"],
          summary: "Detalhe do ICMS",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "icms_id",
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
          tags: ["ICMS"],
          summary: "Atualizar ICMS",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    icms_id: { type: "string", format: "uuid" },
                    state: { type: "string" },
                    item_number: { type: "string" },
                    cest_code: { type: "string" },
                    description: { type: "string" },
                    interstate_agreement: { type: "string" },
                    applied_original_mva: { type: "string" },
                    adjusted_mva: { type: "string" },
                    original_mva: { type: "string" },
                  },
                  required: ["icms_id", "state", "description"],
                  additionalProperties: true,
                  example: updateIcmsExample,
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
          tags: ["ICMS"],
          summary: "Excluir ICMS",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "icms_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Excluido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Permissao fiscal admin requerida" },
          },
        },
      },
      "/fiscal/icms/list": {
        get: {
          tags: ["ICMS"],
          summary: "Listar ICMS paginados",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "icmsCodes",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Termos de descrição parciais separados por vírgula",
            },
            ...paginationParameters,
          ],
          responses: {
            "200": {
              description: "Lista paginada",
              content: {
                "application/json": {
                  schema: paginatedListEnvelopeSchema,
                },
              },
            },
          },
        },
      },
      "/fiscal/ipi": {
        post: {
          tags: ["IPI"],
          summary: "Criar IPI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ncm: { type: "string" },
                    ex: { type: "string" },
                    description: { type: "string" },
                    aliquot: { type: "string" },
                  },
                  required: ["ncm"],
                  additionalProperties: true,
                  example: createIpiExample,
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
          tags: ["IPI"],
          summary: "Detalhe do IPI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "ipi_id",
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
          tags: ["IPI"],
          summary: "Atualizar IPI",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ipi_id: { type: "string", format: "uuid" },
                    ncm: { type: "string" },
                    ex: { type: "string" },
                    description: { type: "string" },
                    aliquot: { type: "string" },
                  },
                  required: ["ipi_id", "ncm"],
                  additionalProperties: true,
                  example: updateIpiExample,
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
          tags: ["IPI"],
          summary: "Excluir IPI",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "ipi_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Excluido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "403": { description: "Permissao fiscal admin requerida" },
          },
        },
      },
      "/fiscal/ipi/list": {
        get: {
          tags: ["IPI"],
          summary: "Listar IPI paginados",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "ipiCodes",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Termos ou códigos NCM parciais separados por vírgula",
            },
            ...paginationParameters,
          ],
          responses: {
            "200": {
              description: "Lista paginada",
              content: {
                "application/json": {
                  schema: paginatedListEnvelopeSchema,
                },
              },
            },
          },
        },
      },
      "/fiscal/rates": {
        post: {
          tags: ["Alíquotas"],
          summary: "Registrar alíquota informada pelo Fiscal",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence", "tax_type", "rate"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                    tax_type: { type: "string", enum: ["ISS", "ICMS"] },
                    rate: {
                      type: "string",
                      description: "Percentual de 0 a 100 com até 4 casas decimais",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Alíquota registrada",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
          },
        },
      },
      "/fiscal/rates/list": {
        get: {
          tags: ["Alíquotas"],
          summary: "Listar registros de alíquotas da empresa",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            { name: "competence", in: "query", required: false, schema: { type: "string" } },
            {
              name: "tax_type",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["ISS", "ICMS"] },
            },
            ...paginationParameters,
          ],
          responses: {
            "200": {
              description: "Registros paginados",
              content: { "application/json": { schema: paginatedListEnvelopeSchema } },
            },
            "400": { description: "Filtro inválido" },
          },
        },
      },
      "/fiscal/monthly-controls": {
        get: {
          tags: ["Controle mensal"],
          summary: "Listar a carteira de controles fiscais da competência",
          description:
            "Antes de listar, gera os controles que faltam para clientes com Fiscal ativo na competência (entrada/saída respeitadas). Repetição ou concorrência não duplica: um controle por organização, cliente e competência.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "competence",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
            },
          ],
          responses: {
            "200": {
              description: "Competência e controles com nome do cliente",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Competência inválida" },
          },
        },
        post: {
          tags: ["Controle mensal"],
          summary: "Abrir controle fiscal do cliente na competência",
          description:
            "Idempotente. Cliente sem Fiscal ativo na competência exige motivo (abertura excepcional), registrado no controle e na trilha.",
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
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                    reason: { type: "string", minLength: 3, maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Controle já existia (created: false)",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "201": {
              description: "Controle aberto (created: true)",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida ou abertura excepcional sem motivo" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Cliente não encontrado nesta organização" },
          },
        },
      },
      "/fiscal/monthly-controls/{id}/obligations": {
        get: {
          tags: ["Controle mensal"],
          summary: "Listar obrigações do controle",
          description:
            "Garante antes as obrigações sugeridas pelo catálogo para o regime registrado no controle (sem duplicar) e devolve também as que podem ser incluídas. Pendências não alteram a situação do controle.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Obrigações com situação, fonte oficial e catálogo incluível",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "404": { description: "Controle não encontrado nesta organização" },
          },
        },
        post: {
          tags: ["Controle mensal"],
          summary: "Incluir obrigação do catálogo no controle",
          description:
            "Obrigação condicional (ex.: DIRBI) exige motivo. Controle concluído não muda.",
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
                  required: ["code"],
                  additionalProperties: false,
                  properties: {
                    code: {
                      type: "string",
                      enum: ["PGDAS_D", "DCTFWEB", "EFD_CONTRIBUICOES", "DIRBI"],
                    },
                    reason: { type: "string", minLength: 3, maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Obrigação incluída",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida ou condicional sem motivo" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Controle não encontrado nesta organização" },
            "409": { description: "Obrigação já incluída ou controle concluído" },
          },
        },
      },
      "/fiscal/monthly-controls/{id}/obligations/{code}": {
        patch: {
          tags: ["Controle mensal"],
          summary: "Alterar aplicabilidade ou cumprimento da obrigação",
          description:
            "Não aplicável exige motivo; cumprir grava data (não futura) e ator, com protocolo opcional; completed_on null desfaz. Cada mudança entra na trilha do controle.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "code",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: ["PGDAS_D", "DCTFWEB", "EFD_CONTRIBUICOES", "DIRBI"],
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  minProperties: 1,
                  properties: {
                    applicable: { type: "boolean" },
                    completed_on: { type: "string", format: "date", nullable: true },
                    protocol: { type: "string", maxLength: 200 },
                    reason: { type: "string", minLength: 3, maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Obrigação atualizada",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida, sem motivo ou data futura" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Controle ou obrigação não encontrados" },
            "409": {
              description: "Controle concluído, regra de cumprimento ou alteração concorrente",
            },
          },
        },
      },
      "/fiscal/monthly-controls/{id}": {
        patch: {
          tags: ["Controle mensal"],
          summary: "Alterar situação e/ou condição de movimento",
          description:
            "Cada mudança grava ator, instante, valor anterior, novo e motivo. Reabrir controle concluído exige Fiscal nível 3 e motivo.",
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
                  minProperties: 1,
                  properties: {
                    status: {
                      type: "string",
                      enum: ["PENDING", "IN_PROGRESS", "AWAITING_CLIENT", "COMPLETED"],
                    },
                    no_movement: { type: "boolean" },
                    reason: { type: "string", minLength: 3, maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Controle atualizado",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida ou reabertura sem motivo" },
            "403": { description: "Sem permissão (edição Fiscal; nível 3 para reabrir)" },
            "404": { description: "Controle não encontrado nesta organização" },
            "409": { description: "Controle alterado por outra pessoa desde a leitura" },
          },
        },
      },
      "/fiscal/revenues": {
        post: {
          tags: ["Receitas"],
          summary: "Registrar receita bruta do cliente na competência",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence", "amount"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                    amount: {
                      type: "string",
                      pattern: "^[0-9]{1,13}(\\.[0-9]{1,2})?$",
                      description: "Valor em reais, não negativo, com ponto decimal",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Receita registrada",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Cliente não encontrado nesta organização" },
            "409": { description: "Já existe receita para o cliente nesta competência" },
          },
        },
      },
      "/fiscal/revenues/list": {
        get: {
          tags: ["Receitas"],
          summary: "Listar receitas mensais do cliente",
          description: "Competência sem registro é tratada como receita zero pelo cálculo.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            { name: "from", in: "query", required: false, schema: { type: "string" } },
            { name: "to", in: "query", required: false, schema: { type: "string" } },
            ...paginationParameters,
          ],
          responses: {
            "200": {
              description: "Receitas paginadas, da competência mais recente para a mais antiga",
              content: { "application/json": { schema: paginatedListEnvelopeSchema } },
            },
            "400": { description: "Filtro inválido" },
          },
        },
      },
      "/fiscal/simples/preview": {
        get: {
          tags: ["Receitas"],
          summary: "Prévia das alíquotas de ISS/ICMS do Simples Nacional",
          description:
            "RBT12 = soma das receitas dos 11 meses anteriores à competência (mês sem registro vale zero) mais a média desses 11 meses, que estima o 12º. Para cada anexo (I e II: ICMS; III a V: ISS) devolve faixa, alíquota nominal, parcela a deduzir, alíquota efetiva, repartição, percentual bruto do tributo (rate) e percentual de emissão com os limites (emission_rate: ICMS 1,36–5%, ISS 2,01–5%; null na 6ª faixa). applies_to é a competência seguinte, à qual a alíquota emitida se refere. status no_base (RBT12 zero) e above_limit (acima de R$ 4.800.000,00) não trazem anexos.",
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
              schema: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
            },
          ],
          responses: {
            "200": {
              description: "Prévia calculada",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Filtro inválido" },
            "404": { description: "Cliente não encontrado nesta organização" },
          },
        },
      },
      "/fiscal/simples/pdf": {
        get: {
          tags: ["Receitas"],
          summary: "Emitir PDF da alíquota do Simples para um anexo",
          description:
            "Carta ao cliente com a alíquota de ISS (Anexos III a V) ou ICMS (I e II) referente à competência seguinte, com os limites de emissão aplicados. 422 quando não há base (RBT12 zero ou acima do teto) ou alíquota válida (6ª faixa).",
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
              schema: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
            },
            {
              name: "annex",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["I", "II", "III", "IV", "V"] },
            },
          ],
          responses: {
            "200": {
              description: "PDF para envio ao cliente",
              content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
            },
            "400": { description: "Filtro inválido" },
            "404": { description: "Cliente não encontrado nesta organização" },
            "422": { description: "Sem base ou sem alíquota válida para o anexo" },
          },
        },
      },
      "/fiscal/simples/csv": {
        post: {
          tags: ["Receitas"],
          summary: "Exportar CSV de alíquotas do Simples em lote",
          description:
            "Para cada CPF/CNPJ informado, inclui o cliente da organização com Fiscal habilitado, ativo no mês da alíquota (status Ativo ou saída nesse mês ou depois) e no Simples Nacional, desde que haja alíquota válida no anexo. O CSV usa ponto e vírgula, colunas Razão Social;CPF/CNPJ;% (vírgula decimal, limites de emissão) e protege textos contra fórmulas. Os demais vêm em skipped com o motivo.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["competence", "annex", "documents"],
                  additionalProperties: false,
                  properties: {
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                    annex: { type: "string", enum: ["I", "II", "III", "IV", "V"] },
                    documents: {
                      type: "array",
                      minItems: 1,
                      maxItems: 500,
                      items: { type: "string", maxLength: 20 },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "CSV do lote (campo csv), nome do arquivo, incluídos e ignorados",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
          },
        },
      },
      "/fiscal/simples/zip": {
        post: {
          tags: ["Receitas"],
          summary: "Exportar PDFs de alíquotas do Simples em lote (ZIP)",
          description:
            "Mesmos critérios e cálculo do CSV em lote: gera um PDF por cliente incluído e devolve o ZIP em base64 (zip_base64; null quando ninguém entra) com os ignorados e o motivo. Se algum PDF falhar, responde erro sem arquivo parcial.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["competence", "annex", "documents"],
                  additionalProperties: false,
                  properties: {
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                    annex: { type: "string", enum: ["I", "II", "III", "IV", "V"] },
                    documents: {
                      type: "array",
                      minItems: 1,
                      maxItems: 500,
                      items: { type: "string", maxLength: 20 },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "ZIP (base64), nome do arquivo, incluídos e ignorados",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "500": { description: "Falha ao gerar os PDFs; nenhum arquivo entregue" },
          },
        },
      },
      "/fiscal/revenues/{id}": {
        put: {
          tags: ["Receitas"],
          summary: "Corrigir o valor de uma receita mensal",
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
                  required: ["amount"],
                  additionalProperties: false,
                  properties: { amount: { type: "string" } },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Receita corrigida",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Receita não encontrada nesta organização" },
          },
        },
      },
      "/fiscal/rates/{id}/pdf": {
        get: {
          tags: ["Alíquotas"],
          summary: "Baixar PDF de um registro de alíquota",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "PDF para envio ao cliente",
              content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
            },
            "404": { description: "Registro não encontrado nesta organização" },
          },
        },
      },
      "/fiscal/ncm-search": {
        get: {
          tags: ["Busca Fiscal"],
          summary: "Busca agregada por código NCM",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "ncmCode",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Código NCM (completo)",
            },
          ],
          responses: {
            "200": {
              description: "Objeto com ncm (ou null), listas icms e ipi",
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
