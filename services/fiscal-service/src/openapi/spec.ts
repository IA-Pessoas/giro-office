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
        "API fiscal: CRUD de NCM, ICMS e IPI e busca agregada por NCM. Requer JWT válido nos endpoints autenticados.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Busca Fiscal", description: "Busca agregada NCM + ICMS + IPI" },
      { name: "ICMS", description: "CRUD de ICMS" },
      { name: "IPI", description: "CRUD de IPI" },
      { name: "NCM", description: "CRUD de NCM" },
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
                    ncm_code: { type: "string" },
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
                    ncm_code: { type: "string" },
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
