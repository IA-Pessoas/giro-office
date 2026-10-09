import { MAX_REPORTING_QUERY_LIMIT, reportingQueryOpenApiSchema } from "@workspace/shared";
import type { OpenApiDocument } from "@workspace/shared/http";

import type { FiscalServiceEnv } from "../config/env.js";
import {
  ANTICIPATION_CLASSIFICATIONS,
  ANTICIPATION_CORRECTABLE_FIELDS,
} from "../schemas/anticipation.schemas.js";
import { MALHA_STATUSES } from "../schemas/malha.schemas.js";

const competencePattern = "^[0-9]{4}-(0[1-9]|1[0-2])$";
const successContent = {
  "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
};
const clientIdParameter = {
  name: "client_id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const idPathParameter = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const malhaWritableProperties = {
  period_start: { type: "string", pattern: competencePattern, description: "AAAA-MM" },
  period_end: { type: "string", pattern: competencePattern, description: "AAAA-MM" },
  reason: { type: "string", minLength: 1, maxLength: 2000 },
  deadline: { type: "string", format: "date", nullable: true },
  status: { type: "string", enum: [...MALHA_STATUSES], default: "aberta" },
  responsible_id: { type: "string", format: "uuid", nullable: true },
  task_id: { type: "string", format: "uuid", nullable: true },
};

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
      {
        name: "Antecipações",
        description:
          "Lotes de XML NF-e para revisão manual de antecipações, sem cálculo automático de imposto",
      },
      {
        name: "Malhas",
        description:
          "Malhas fiscais por cliente com prazo, situação, responsável, anexo e histórico",
      },
      {
        name: "Atacadista",
        description: "Condição de atacadista do cliente com histórico; uso informativo",
      },
      {
        name: "Conferências",
        description: "Comparação de arquivos e notas, sem gravar nem alterar dados operacionais",
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
      "/fiscal/monthly-controls/responsibles": {
        get: {
          tags: ["Controle mensal"],
          summary: "Listar quem pode receber controles (Fiscal nível 3)",
          description: "Usuários ativos com acesso ao Fiscal na organização.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Lista de { id, name }",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "403": { description: "Exige Fiscal nível 3" },
          },
        },
      },
      "/fiscal/monthly-controls/transfer": {
        post: {
          tags: ["Controle mensal"],
          summary: "Transferir controles abertos para outro responsável",
          description:
            "Fiscal nível 3, com motivo. Individual (um id) ou em lote. Concluídos não são transferidos: no lote voltam em skipped; sozinho é 409. Cada transferência grava evento RESPONSIBLE_TRANSFERRED; competências passadas não mudam por mudança da carteira.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["control_ids", "to_user_id", "reason"],
                  additionalProperties: false,
                  properties: {
                    control_ids: {
                      type: "array",
                      minItems: 1,
                      maxItems: 500,
                      items: { type: "string", format: "uuid" },
                    },
                    to_user_id: { type: "string", format: "uuid" },
                    reason: { type: "string", minLength: 3, maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "{ transferred: string[], skipped: { id, reason }[] }",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida ou destino sem acesso ao Fiscal" },
            "403": { description: "Exige Fiscal nível 3" },
            "404": { description: "Controle não encontrado (transferência individual)" },
            "409": { description: "Controle concluído (transferência individual)" },
          },
        },
      },
      "/fiscal/monthly-controls/{id}/triage": {
        get: {
          tags: ["Controle mensal"],
          summary: "Consultar documentos da Triagem do controle",
          description:
            "Só leitura do checklist da Triagem Fiscal do mesmo cliente e competência. pending é null quando a Triagem não tem registro; nesse caso, como com pendência, concluir o controle exige Fiscal nível 3 e justificativa.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Origem (MONTHLY, PLANNED ou NONE), pendências e itens com status",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "404": { description: "Controle não encontrado nesta organização" },
          },
        },
      },
      "/fiscal/annual-controls": {
        get: {
          tags: ["Controle anual"],
          summary: "Listar a carteira de controles fiscais anuais do ano",
          description:
            "Antes de listar, gera um controle por cliente com Fiscal ativo no ano (até o ano corrente), com regime e responsável registrados ao nascer e DEFIS sugerida para o Simples. Sem situação geral: o andamento é por declaração.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "year",
              in: "query",
              required: true,
              schema: { type: "integer", minimum: 2000, maximum: 2100 },
            },
          ],
          responses: {
            "200": {
              description: "Ano e controles com declarações e seus andamentos",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Ano inválido" },
          },
        },
      },
      "/fiscal/annual-controls/{id}/items": {
        get: {
          tags: ["Controle anual"],
          summary: "Listar declarações do controle anual",
          description:
            "Só leitura; inclui as declarações do catálogo que ainda podem ser incluídas.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Declarações com fonte oficial, situação e catálogo incluível",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "404": { description: "Controle não encontrado nesta organização" },
          },
        },
        post: {
          tags: ["Controle anual"],
          summary: "Incluir declaração do catálogo no controle anual",
          description: "DMED, DIMOB e DASN-SIMEI são condicionais e exigem motivo.",
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
                    code: { type: "string", enum: ["DEFIS", "DMED", "DIMOB", "DASN_SIMEI"] },
                    reason: { type: "string", minLength: 3, maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Declaração incluída",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida, condicional sem motivo ou regime vetado" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Controle não encontrado nesta organização" },
            "409": { description: "Declaração já incluída" },
          },
        },
      },
      "/fiscal/annual-controls/{id}/items/{code}": {
        patch: {
          tags: ["Controle anual"],
          summary: "Alterar aplicabilidade ou cumprimento da declaração",
          description:
            "Não aplicável exige motivo; cumprir grava data (não futura) e ator, com protocolo opcional; completed_on null desfaz. Cada mudança entra na trilha do controle anual.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "code",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["DEFIS", "DMED", "DIMOB", "DASN_SIMEI"] },
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
              description: "Declaração atualizada",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida, sem motivo ou data futura" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Controle ou declaração não encontrados" },
            "409": { description: "Regra de cumprimento ou alteração concorrente" },
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
            "Cada mudança grava ator, instante, valor anterior, novo e motivo. Reabrir controle concluído exige Fiscal nível 3 e motivo. Concluir com documento pendente (ou sem registro) na Triagem exige Fiscal nível 3 e justificativa em reason; a Triagem não é alterada.",
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
            "403": {
              description:
                "Sem permissão (edição Fiscal; nível 3 para reabrir ou concluir com pendência na Triagem)",
            },
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
      "/fiscal/conferences/documents": {
        post: {
          tags: ["Conferências"],
          summary: "Conferir planilhas Domínio e SEFAZ por documento",
          description:
            "Recebe duas planilhas CSV (separador ; , ou tab, primeira linha como cabeçalho) e compara as notas pela chave de acesso NF-e quando há; sem ela, por emitente (CPF/CNPJ) + modelo + série + número. Número isolado é descartado. Devolve coincidentes, divergentes (valor ou chave), exclusivos de cada fonte, duplicadas (sem correspondência automática), descartes e erros por linha, totais e o CSV do resultado (campo csv). status partial indica descartes ou erros; cabeçalho sem colunas de identidade ou arquivo sem linhas responde 400 sem relatório. Nada é gravado. Compatibilidade com exportações reais ainda não validada.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["dominio", "sefaz"],
                  additionalProperties: false,
                  properties: Object.fromEntries(
                    ["dominio", "sefaz"].map((source) => [
                      source,
                      {
                        type: "object",
                        required: ["file_name", "content"],
                        additionalProperties: false,
                        properties: {
                          file_name: { type: "string", minLength: 1, maxLength: 255 },
                          content: { type: "string", minLength: 1, maxLength: 450_000 },
                        },
                      },
                    ]),
                  ),
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Resultado da conferência (status, summary, matched, divergent, only_dominio, only_sefaz, duplicates, discarded, errors, totals) com file_name e csv",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida ou planilha sem formato reconhecível" },
            "403": { description: "Sem permissão de edição Fiscal" },
          },
        },
      },
      "/fiscal/conferences/xml-selection": {
        post: {
          tags: ["Conferências"],
          summary: "Selecionar XML de notas em ZIP",
          description:
            "Recebe um ZIP de XML (base64, até ~650 kB) e a lista de notas pedidas: chave de acesso (44 dígitos) ou número, série;número, emitente;série;número ou emitente;modelo;série;número. Devolve um ZIP só com os XML selecionados e o relatorio-selecao.csv (zip_base64; null quando nada foi selecionado), o mesmo CSV no campo csv e o relatório: selected, ambiguous (mais de uma nota ou cópias diferentes da mesma nota, sem escolha automática), not_found, invalid_requests e, do arquivo, discarded, errors e duplicates. Nomes inseguros, entradas criptografadas, corrompidas ou grandes demais aparecem como erro por arquivo. status partial quando algum pedido não foi atendido ou há erro no ZIP. Nada é gravado.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["file_name", "zip_base64", "requests"],
                  additionalProperties: false,
                  properties: {
                    file_name: { type: "string", minLength: 1, maxLength: 255 },
                    zip_base64: { type: "string", minLength: 1, maxLength: 900_000 },
                    requests: {
                      type: "array",
                      minItems: 1,
                      maxItems: 1000,
                      items: { type: "string", minLength: 1, maxLength: 80 },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "ZIP dos XML selecionados, CSV e relatório da seleção",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida ou ZIP ilegível" },
            "403": { description: "Sem permissão de edição Fiscal" },
          },
        },
      },
      "/fiscal/conferences/sefaz-xml": {
        post: {
          tags: ["Conferências"],
          summary: "Conferir CSV SEFAZ contra XML NF-e",
          description:
            "Recebe a planilha CSV da SEFAZ (até 300 mil caracteres; colunas de chave ou emitente/modelo/série/número, e opcionais Situação e Valor) e um ZIP de XML NF-e (base64, até ~450 kB). Pareia pela chave de acesso quando os dois lados têm, senão por emitente + modelo + série + número, e informa a chave usada (match_key). Separa matched, divergent (valor ou chave), only_sefaz e only_xml (ausência real), duplicates (sem correspondência automática), not_comparable (situação não autorizada na planilha ou protocolo com cStat diferente de 100/150), discarded e errors por linha/arquivo, com totais e o CSV do resultado (campo csv). Nada é gravado.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["sefaz", "xml"],
                  additionalProperties: false,
                  properties: {
                    sefaz: {
                      type: "object",
                      required: ["file_name", "content"],
                      additionalProperties: false,
                      properties: {
                        file_name: { type: "string", minLength: 1, maxLength: 255 },
                        content: { type: "string", minLength: 1, maxLength: 300_000 },
                      },
                    },
                    xml: {
                      type: "object",
                      required: ["file_name", "zip_base64"],
                      additionalProperties: false,
                      properties: {
                        file_name: { type: "string", minLength: 1, maxLength: 255 },
                        zip_base64: { type: "string", minLength: 1, maxLength: 600_000 },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Resultado da conferência SEFAZ × XML com file_name e csv",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": {
              description: "Entrada inválida, planilha sem formato reconhecível ou ZIP ilegível",
            },
            "403": { description: "Sem permissão de edição Fiscal" },
          },
        },
      },
      "/fiscal/conferences/sped-xml": {
        post: {
          tags: ["Conferências"],
          summary: "Conferir SPED C100/C170 contra XML NF-e",
          description:
            "Recebe o arquivo SPED EFD ICMS/IPI (texto |REG|...|, até 300 mil caracteres; usa 0000, 0150, C100 e C170) e um ZIP de XML NF-e (base64, até ~450 kB). Cada C170 pertence ao C100 anterior; C170 fora de um C100 é erro e nunca vai para outro documento. C100 × NF-e pela chave de acesso ou por emitente (0000/0150) + modelo + série + número; itens C170 × det pelo número do item dentro da mesma nota (código e CFOP só na emissão própria). Devolve documentos matched/divergent (com a comparação de itens), only_sped, only_xml, duplicates, not_comparable (COD_SIT cancelado/denegado/inutilizado, modelo sem NF-e ou protocolo não autorizado), errors de leiaute por linha e descartes, totais e o CSV (campo csv). Nada é gravado.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["sped", "xml"],
                  additionalProperties: false,
                  properties: {
                    sped: {
                      type: "object",
                      required: ["file_name", "content"],
                      additionalProperties: false,
                      properties: {
                        file_name: { type: "string", minLength: 1, maxLength: 255 },
                        content: { type: "string", minLength: 1, maxLength: 300_000 },
                      },
                    },
                    xml: {
                      type: "object",
                      required: ["file_name", "zip_base64"],
                      additionalProperties: false,
                      properties: {
                        file_name: { type: "string", minLength: 1, maxLength: 255 },
                        zip_base64: { type: "string", minLength: 1, maxLength: 600_000 },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Resultado da conferência SPED × XML com file_name e csv",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida, arquivo sem C100 ou ZIP ilegível" },
            "403": { description: "Sem permissão de edição Fiscal" },
          },
        },
      },
      "/fiscal/conferences/xml-taxes": {
        post: {
          tags: ["Conferências"],
          summary: "Somar IPI e ICMS ST de XML NF-e",
          description:
            "Recebe um ZIP de XML NF-e (base64, até ~650 kB) e soma, em centavos inteiros, o vIPI (grupo IPI) e o vICMSST destacado (grupo ICMS) de cada item; ST retida anteriormente (vICMSSTRet) e FCP ST não entram. Nota cancelada por evento 110111 presente no ZIP fica fora da soma; nota sem protocolo é somada com aviso em warnings. Devolve totals (ipi, icms_st, notes, items), a composição por nota e item (notes, com differences quando a soma dos itens não bate com vIPI/vST do ICMSTot), excluded (XML repetido com conteúdo diferente ou protocolo não autorizado, fora da soma), errors (XML inválido ou valor fora do formato), discarded (não XML/NF-e, cópia idêntica) e o CSV (campo csv). status partial com XML inválido, duplicado ou ZIP sem NF-e. Nada é gravado; não é apuração tributária.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["file_name", "zip_base64"],
                  additionalProperties: false,
                  properties: {
                    file_name: { type: "string", minLength: 1, maxLength: 255 },
                    zip_base64: { type: "string", minLength: 1, maxLength: 900_000 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Totais de IPI e ICMS ST com composição, exclusões e CSV",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida ou ZIP ilegível" },
            "403": { description: "Sem permissão de edição Fiscal" },
          },
        },
      },
      "/fiscal/conferences/ipi-spreadsheets": {
        post: {
          tags: ["Conferências"],
          summary: "Conferir IPI entre duas planilhas",
          description:
            "Recebe duas planilhas CSV (first e second; separador ; , ou tab; até 450 mil caracteres cada) com colunas de identidade (chave de acesso ou emitente/modelo/série/número) e uma coluna de IPI (ex.: Valor IPI). Pareia as notas pela identidade e devolve matched, divergent (IPI diferente, com difference = planilha 2 − planilha 1 em centavos), only_first, only_second, duplicates (sem correspondência automática; cada planilha deve ter uma linha por nota, linhas por item viram duplicata), not_comparable (nota com IPI vazio ou ilegível em alguma planilha), discarded e errors por linha, totais de cada planilha e da diferença e o CSV (campo csv; diferença negativa em formato contábil, ex.: (0,80)). status partial com descarte, erro ou duplicata. Nada é gravado.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["first", "second"],
                  additionalProperties: false,
                  properties: Object.fromEntries(
                    ["first", "second"].map((source) => [
                      source,
                      {
                        type: "object",
                        required: ["file_name", "content"],
                        additionalProperties: false,
                        properties: {
                          file_name: { type: "string", minLength: 1, maxLength: 255 },
                          content: { type: "string", minLength: 1, maxLength: 450_000 },
                        },
                      },
                    ]),
                  ),
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Resultado da conferência de IPI com file_name e csv",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida ou planilha sem identidade ou coluna de IPI" },
            "403": { description: "Sem permissão de edição Fiscal" },
          },
        },
      },
      "/fiscal/conferences/invoice-pdfs": {
        post: {
          tags: ["Conferências"],
          summary: "Somar totais de faturas em PDF",
          description:
            "Recebe até 50 PDFs em base64 (files; até ~650 kB somados). Formato suportado (devolvido em supported_format): um total por PDF; PDF com camada de texto (gerado por sistema, não escaneado), sem senha, conteúdo sem filtro ou FlateDecode, fontes padrão ou com mapa ToUnicode, inclusive em Form XObject; até 500 páginas e 20 MB descompactados. Em cada PDF procura o total pelos rótulos Total a pagar, Total da fatura, Total da nota, Total geral, Total do documento, Valor total (exceto subtotais como dos produtos ou dos tributos), Valor a pagar, Valor da fatura, Valor cobrado e Valor do documento (valor na mesma linha ou na seguinte; negativo por sinal ou parênteses) e soma em centavos as faturas com um único valor. Rótulos em cabeçalho de tabela tornam a fatura ambígua; página sem texto legível ou fatura com o mesmo conteúdo de outra deixam o arquivo como não processado. Devolve invoices (valor, página, rótulo e linha de origem), ambiguous (totais diferentes na mesma fatura, fora da soma), not_processed (PDF ilegível, sem total ou repetido), totals, supported_format e o CSV (campo csv). status partial quando há fatura fora da soma. Nada é gravado.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["files"],
                  additionalProperties: false,
                  properties: {
                    files: {
                      type: "array",
                      minItems: 1,
                      maxItems: 50,
                      items: {
                        type: "object",
                        required: ["file_name", "content_base64"],
                        additionalProperties: false,
                        properties: {
                          file_name: { type: "string", minLength: 1, maxLength: 255 },
                          content_base64: { type: "string", minLength: 1 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Total das faturas com a origem de cada valor, ambiguidades e não processados",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
              },
            },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
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
      "/fiscal/anticipations/batches": {
        post: {
          tags: ["Antecipações"],
          summary: "Importar ZIP de XML NF-e em lote de antecipações",
          description:
            "Cria um lote pendente de revisão (status pending_review) para cliente e competência, com um item por det das NF-e e a origem (arquivo, chave de acesso, número do item). Duplicata de chave de acesso + item no próprio ZIP (versões diferentes da mesma nota) ou já importada em qualquer lote da organização (qualquer cliente) não entra: a nota inteira fica de fora e aparece em issues (kind duplicate); XML inválido, NF-e sem chave, cancelada ou não autorizada aparece como error; arquivo que não é NF-e, como discarded. ZIP sem nenhum item importável devolve 400 e não cria lote. Não calcula imposto nem emite guia.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence", "file_name", "zip_base64"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: {
                      type: "string",
                      pattern: competencePattern,
                      description: "AAAA-MM",
                    },
                    file_name: { type: "string", minLength: 1, maxLength: 255 },
                    zip_base64: { type: "string", minLength: 1, maxLength: 900_000 },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Lote criado com itens e issues", content: successContent },
            "400": { description: "Entrada inválida, ZIP ilegível ou nenhum item importável" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Cliente não encontrado nesta organização" },
            "409": { description: "Importação concorrente gravou as mesmas notas" },
          },
        },
      },
      "/fiscal/anticipations/batches/list": {
        get: {
          tags: ["Antecipações"],
          summary: "Listar lotes de antecipações",
          description: "Mais recentes primeiro; sem os itens.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "competence",
              in: "query",
              required: false,
              schema: { type: "string", pattern: competencePattern },
            },
            ...paginationParameters,
          ],
          responses: {
            "200": {
              description: "Lotes paginados da organização",
              content: { "application/json": { schema: paginatedListEnvelopeSchema } },
            },
            "400": { description: "Filtro inválido" },
          },
        },
      },
      "/fiscal/anticipations/batches/{id}": {
        get: {
          tags: ["Antecipações"],
          summary: "Detalhar lote de antecipações com itens, issues e histórico da revisão",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          responses: {
            "200": {
              description:
                "Lote, itens (valores do XML, classificação, valor manual e correções) e histórico (mais recente primeiro)",
              content: successContent,
            },
            "404": { description: "Lote não encontrado nesta organização" },
          },
        },
      },
      "/fiscal/anticipations/batches/{id}/csv": {
        get: {
          tags: ["Antecipações"],
          summary: "Baixar demonstrativo manual do lote em CSV",
          description:
            "Mesmo lote do detalhe: cabeçalho com cliente, competência, estado da revisão, responsável e conferente, a declaração de que não houve apuração automática de imposto nem emissão de guia oficial e uma linha por item. Cada campo traz valor final, origem (XML ou Corrigido) e valor do XML; o valor informado manualmente vem identificado. Separador ponto e vírgula, decimais com vírgula, UTF-8 com BOM.",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          responses: {
            "200": {
              description: "CSV do demonstrativo",
              content: { "text/csv": { schema: { type: "string" } } },
            },
            "404": { description: "Lote não encontrado nesta organização" },
          },
        },
      },
      "/fiscal/anticipations/batches/{id}/pdf": {
        get: {
          tags: ["Antecipações"],
          summary: "Baixar demonstrativo manual do lote em PDF",
          description:
            "Mesmo conteúdo do CSV: cada valor com a origem (XML, corrigido com o valor do XML, informado manualmente) e a declaração de que não houve apuração automática nem guia oficial.",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          responses: {
            "200": {
              description: "PDF do demonstrativo",
              content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
            },
            "404": { description: "Lote não encontrado nesta organização" },
          },
        },
      },
      "/fiscal/anticipations/batches/{id}/items/{item_id}": {
        put: {
          tags: ["Antecipações"],
          summary: "Classificar, corrigir ou informar valor manual de um item",
          description:
            "Só com o lote em classificação (pending_review). Cada campo alterado vira uma linha de histórico com anterior, novo, motivo, ator e instante. Correções ficam em corrections; os valores do XML não mudam. null desfaz. Nenhum imposto é calculado.",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter, { ...idPathParameter, name: "item_id" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reason"],
                  additionalProperties: false,
                  properties: {
                    classification: {
                      type: "string",
                      enum: [...ANTICIPATION_CLASSIFICATIONS],
                      nullable: true,
                    },
                    manual_value: {
                      type: "string",
                      pattern: "^[0-9]{1,13}(\\.[0-9]{1,2})?$",
                      nullable: true,
                    },
                    corrections: {
                      type: "object",
                      additionalProperties: false,
                      properties: Object.fromEntries(
                        ANTICIPATION_CORRECTABLE_FIELDS.map((field) => [
                          field,
                          { type: "string", nullable: true },
                        ]),
                      ),
                    },
                    reason: { type: "string", minLength: 1, maxLength: 2000 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Item revisado", content: successContent },
            "400": { description: "Entrada inválida ou sem alteração" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Lote ou item não encontrado nesta organização" },
            "409": { description: "Lote fora da classificação" },
          },
        },
      },
      "/fiscal/anticipations/batches/{id}/submit": {
        post: {
          tags: ["Antecipações"],
          summary: "Enviar lote à conferência",
          description:
            "Exige todos os itens classificados e conferente ativo com Fiscal nível 2 ou superior na organização (conferir é escrita). pending_review → awaiting_check, com histórico do estado e do conferente.",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reviewer_id"],
                  additionalProperties: false,
                  properties: { reviewer_id: { type: "string", format: "uuid" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Lote aguardando conferência", content: successContent },
            "400": { description: "Entrada inválida ou item sem classificação" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": {
              description: "Lote não encontrado, ou conferente sem Fiscal nível 2 na organização",
            },
            "409": { description: "Lote fora da classificação" },
          },
        },
      },
      "/fiscal/anticipations/batches/{id}/check": {
        post: {
          tags: ["Antecipações"],
          summary: "Conferir lote: aprovar ou devolver",
          description:
            "Decide o conferente designado ou, no lugar dele, Fiscal nível 3 (RT-02); o histórico registra quem decidiu. approve: awaiting_check → checked. return (motivo obrigatório): awaiting_check → pending_review.",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["decision"],
                  additionalProperties: false,
                  properties: {
                    decision: { type: "string", enum: ["approve", "return"] },
                    reason: { type: "string", minLength: 1, maxLength: 2000 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Lote conferido ou devolvido", content: successContent },
            "400": { description: "Decisão inválida ou devolução sem motivo" },
            "403": {
              description:
                "Sem permissão de edição Fiscal, ou não é o conferente nem Fiscal nível 3",
            },
            "404": { description: "Lote não encontrado nesta organização" },
            "409": { description: "Lote não está aguardando conferência" },
          },
        },
      },
      "/fiscal/malhas": {
        post: {
          tags: ["Malhas"],
          summary: "Cadastrar malha fiscal do cliente",
          description:
            "Prazo, situação e responsável iniciais entram no histórico. task_id é opcional e precisa ser tarefa da organização; responsible_id precisa ser usuário ativo com acesso ao Fiscal.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "period_start", "period_end", "reason"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    ...malhaWritableProperties,
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Malha cadastrada", content: successContent },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": {
              description: "Cliente, tarefa ou responsável não encontrado nesta organização",
            },
          },
        },
      },
      "/fiscal/malhas/list": {
        get: {
          tags: ["Malhas"],
          summary: "Listar malhas fiscais com filtros",
          description: "Ordena por prazo (sem prazo por último) e depois pelas mais recentes.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "status",
              in: "query",
              required: false,
              schema: { type: "string", enum: [...MALHA_STATUSES] },
            },
            {
              name: "responsible_id",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid" },
            },
            ...paginationParameters,
          ],
          responses: {
            "200": {
              description: "Malhas paginadas da organização",
              content: { "application/json": { schema: paginatedListEnvelopeSchema } },
            },
            "400": { description: "Filtro inválido" },
          },
        },
      },
      "/fiscal/malhas/{id}": {
        get: {
          tags: ["Malhas"],
          summary: "Detalhar malha com histórico de prazo, situação e responsável",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          responses: {
            "200": {
              description: "Malha e histórico (mais recente primeiro)",
              content: successContent,
            },
            "404": { description: "Malha não encontrada nesta organização" },
          },
        },
        put: {
          tags: ["Malhas"],
          summary: "Atualizar malha fiscal",
          description:
            "Mudanças de prazo, situação e responsável gravam histórico com ator e momento na mesma transação.",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  minProperties: 1,
                  additionalProperties: false,
                  properties: malhaWritableProperties,
                },
              },
            },
          },
          responses: {
            "200": { description: "Malha atualizada", content: successContent },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Malha, tarefa ou responsável não encontrado nesta organização" },
          },
        },
      },
      "/fiscal/malhas/{id}/attachment": {
        post: {
          tags: ["Malhas"],
          summary: "Enviar ou substituir o anexo da malha",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "PDF, JPEG, PNG ou WEBP de até 10 MB",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Anexo gravado; devolve a malha", content: successContent },
            "400": { description: "Arquivo ausente, grande demais ou de formato inválido" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Malha não encontrada nesta organização" },
            "503": { description: "Storage de anexos não configurado" },
          },
        },
        get: {
          tags: ["Malhas"],
          summary: "Gerar URL assinada temporária do anexo",
          security: [{ bearerAuth: [] }],
          parameters: [idPathParameter],
          responses: {
            "200": {
              description: "URL assinada (url, expires_in_seconds)",
              content: successContent,
            },
            "404": { description: "Malha ou anexo não encontrado nesta organização" },
            "503": { description: "Storage de anexos não configurado" },
          },
        },
      },
      "/fiscal/clients/{client_id}/wholesale": {
        get: {
          tags: ["Atacadista"],
          summary: "Consultar condição de atacadista do cliente e histórico",
          description:
            "Sem histórico o cliente não é atacadista. Histórico do mais recente para o mais antigo, com ator, momento, anterior e novo.",
          security: [{ bearerAuth: [] }],
          parameters: [clientIdParameter],
          responses: {
            "200": { description: "Valor atual e histórico", content: successContent },
            "400": { description: "Cliente inválido" },
            "404": { description: "Cliente não encontrado nesta organização" },
          },
        },
        put: {
          tags: ["Atacadista"],
          summary: "Marcar ou desmarcar o cliente como atacadista",
          description:
            "Grava uma linha de histórico só quando o valor muda. A marcação é informativa e não dispara cálculo de antecipação.",
          security: [{ bearerAuth: [] }],
          parameters: [clientIdParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["is_wholesale"],
                  additionalProperties: false,
                  properties: { is_wholesale: { type: "boolean" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Valor atual e histórico", content: successContent },
            "400": { description: "Entrada inválida" },
            "403": { description: "Sem permissão de edição Fiscal" },
            "404": { description: "Cliente não encontrado nesta organização" },
            "409": { description: "Alteração simultânea; recarregue e tente de novo" },
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
