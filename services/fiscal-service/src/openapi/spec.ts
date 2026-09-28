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
