import type { OpenApiDocument } from "@workspace/shared/http";

import type { ParcelamentoServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

const bearer = [{ bearerAuth: [] }] as const;

const successResponse = (schema: Record<string, unknown>) =>
  ({
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean", example: true },
            data: schema,
          },
        },
      },
    },
  }) as const;

const schemaRef = (schema: string) => ({ $ref: `#/components/schemas/${schema}` }) as const;

const pageSchema = (itemSchema: string) =>
  ({
    allOf: [
      schemaRef("ParcelamentoPage"),
      {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: schemaRef(itemSchema),
          },
        },
      },
    ],
  }) as const;

const idPathParameter = (name: string) =>
  ({
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }) as const;

const queryParameter = (name: string, schema: Record<string, unknown>) =>
  ({
    name,
    in: "query",
    required: false,
    schema,
  }) as const;

const paginationParameters = [
  queryParameter("page", { type: "integer", minimum: 1 }),
  queryParameter("page_size", { type: "integer", minimum: 1, maximum: 100 }),
] as const;

const requestBody = (schema: string) =>
  ({
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${schema}` },
        },
      },
    },
  }) as const;

const uuid = { type: "string", format: "uuid" } as const;
const text = { type: "string" } as const;
const nullableText = { type: ["string", "null"] } as const;
const dateTime = { type: ["string", "null"], format: "date-time" } as const;
const number = { type: "number", minimum: 0 } as const;
const integer = { type: "integer", minimum: 0 } as const;
const boolean = { type: "boolean" } as const;

export function buildParcelamentoServiceOpenApiSpec(env: ParcelamentoServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Parcelamento Service",
      version: "1.0.0",
      description: "Contrato do servico de parcelamento.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Installments", description: "Parcelamentos" },
      { name: "InstallmentCompetencies", description: "Competencias de parcelamento" },
      { name: "Panoramas", description: "Panoramas mensais de parcelamento" },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          operationId: "getParcelamentoHealth",
          responses: {
            "200": { description: "OK", ...successJson },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          operationId: "getParcelamentoReadiness",
          responses: {
            "200": { description: "Ready", ...successJson },
          },
        },
      },
      "/parcelamento/installments": {
        get: {
          tags: ["Installments"],
          summary: "Listar parcelamentos",
          operationId: "listParcelamentoInstallments",
          security: bearer,
          parameters: [
            ...paginationParameters,
            queryParameter("client_id", uuid),
            queryParameter("status", text),
            queryParameter("type", text),
            queryParameter("jurisdiction", text),
            queryParameter("search", text),
          ],
          responses: {
            "200": {
              description: "Lista de parcelamentos",
              ...successResponse(pageSchema("ParcelamentoInstallment")),
            },
          },
        },
        post: {
          tags: ["Installments"],
          summary: "Criar parcelamento",
          operationId: "createParcelamentoInstallment",
          security: bearer,
          ...requestBody("ParcelamentoInstallmentCreateRequest"),
          responses: {
            "201": {
              description: "Parcelamento criado",
              ...successResponse(schemaRef("ParcelamentoInstallment")),
            },
          },
        },
      },
      "/parcelamento/installments/{id}": {
        get: {
          tags: ["Installments"],
          summary: "Detalhar parcelamento",
          operationId: "getParcelamentoInstallment",
          security: bearer,
          parameters: [idPathParameter("id")],
          responses: {
            "200": {
              description: "Detalhe do parcelamento",
              ...successResponse(schemaRef("ParcelamentoInstallment")),
            },
          },
        },
        patch: {
          tags: ["Installments"],
          summary: "Atualizar parcelamento",
          operationId: "patchParcelamentoInstallment",
          security: bearer,
          parameters: [idPathParameter("id")],
          ...requestBody("ParcelamentoInstallmentPatchRequest"),
          responses: {
            "200": {
              description: "Parcelamento atualizado",
              ...successResponse(schemaRef("ParcelamentoInstallment")),
            },
          },
        },
      },
      "/parcelamento/installments/{installmentId}/competencies": {
        get: {
          tags: ["InstallmentCompetencies"],
          summary: "Listar competencias do parcelamento",
          operationId: "listParcelamentoInstallmentCompetencies",
          security: bearer,
          parameters: [idPathParameter("installmentId"), ...paginationParameters],
          responses: {
            "200": {
              description: "Lista de competencias",
              ...successResponse(pageSchema("ParcelamentoInstallmentCompetency")),
            },
          },
        },
        post: {
          tags: ["InstallmentCompetencies"],
          summary: "Criar competencia do parcelamento",
          operationId: "createParcelamentoInstallmentCompetency",
          security: bearer,
          parameters: [idPathParameter("installmentId")],
          ...requestBody("ParcelamentoInstallmentCompetencyCreateRequest"),
          responses: {
            "201": {
              description: "Competencia criada",
              ...successResponse(schemaRef("ParcelamentoInstallmentCompetency")),
            },
          },
        },
      },
      "/parcelamento/installment-competencies/{id}": {
        patch: {
          tags: ["InstallmentCompetencies"],
          summary: "Atualizar competencia do parcelamento",
          operationId: "patchParcelamentoInstallmentCompetency",
          security: bearer,
          parameters: [idPathParameter("id")],
          ...requestBody("ParcelamentoInstallmentCompetencyPatchRequest"),
          responses: {
            "200": {
              description: "Competencia atualizada",
              ...successResponse(schemaRef("ParcelamentoInstallmentCompetency")),
            },
          },
        },
      },
      "/parcelamento/panoramas": {
        get: {
          tags: ["Panoramas"],
          summary: "Listar panoramas",
          operationId: "listParcelamentoPanoramas",
          security: bearer,
          parameters: [
            ...paginationParameters,
            queryParameter("competence", text),
            queryParameter("client_id", uuid),
            queryParameter("responsavel_id", uuid),
          ],
          responses: {
            "200": {
              description: "Lista de panoramas",
              ...successResponse(pageSchema("ParcelamentoPanorama")),
            },
          },
        },
        post: {
          tags: ["Panoramas"],
          summary: "Criar panorama",
          operationId: "createParcelamentoPanorama",
          security: bearer,
          ...requestBody("ParcelamentoPanoramaCreateRequest"),
          responses: {
            "201": {
              description: "Panorama criado",
              ...successResponse(schemaRef("ParcelamentoPanorama")),
            },
          },
        },
      },
      "/parcelamento/panoramas/{id}": {
        get: {
          tags: ["Panoramas"],
          summary: "Detalhar panorama",
          operationId: "getParcelamentoPanorama",
          security: bearer,
          parameters: [idPathParameter("id")],
          responses: {
            "200": {
              description: "Detalhe do panorama",
              ...successResponse(schemaRef("ParcelamentoPanorama")),
            },
          },
        },
        patch: {
          tags: ["Panoramas"],
          summary: "Atualizar panorama",
          operationId: "patchParcelamentoPanorama",
          security: bearer,
          parameters: [idPathParameter("id")],
          ...requestBody("ParcelamentoPanoramaPatchRequest"),
          responses: {
            "200": {
              description: "Panorama atualizado",
              ...successResponse(schemaRef("ParcelamentoPanorama")),
            },
          },
        },
      },
      "/parcelamento/panoramas/competences/{competence}/generate": {
        post: {
          tags: ["Panoramas"],
          summary: "Gerar panoramas por competencia",
          operationId: "generateParcelamentoPanoramas",
          security: bearer,
          parameters: [
            {
              name: "competence",
              in: "path",
              required: true,
              schema: text,
            },
          ],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: false },
              },
            },
          },
          responses: {
            "200": {
              description: "Panoramas gerados",
              ...successResponse(schemaRef("ParcelamentoPanoramaGenerateResult")),
            },
          },
        },
      },
    },
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
          required: ["success", "data"],
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object", additionalProperties: true },
          },
        },
        ParcelamentoPage: {
          type: "object",
          required: ["items", "total", "page", "page_size", "has_more"],
          properties: {
            items: { type: "array", items: { type: "object", additionalProperties: true } },
            total: integer,
            page: { type: "integer", minimum: 1 },
            page_size: { type: "integer", minimum: 1 },
            has_more: boolean,
          },
        },
        ParcelamentoInstallment: {
          type: "object",
          properties: {
            id: uuid,
            client_id: uuid,
            agreement_number: nullableText,
            type: text,
            legal_nature: text,
            jurisdiction: text,
            status: text,
            is_automatic_debit: boolean,
            consolidated_total_amount: number,
            first_installment_amount: number,
            current_month_installment_amount: number,
            agreed_installments_count: { type: "integer", minimum: 1 },
            down_payment_installments_count: integer,
            paid_installments_count: integer,
            overdue_installments_count: integer,
            remaining_installments_count: integer,
            outstanding_balance: number,
            enrollment_date: dateTime,
            document_url: nullableText,
            situation_shutdown: nullableText,
            completion_date: dateTime,
          },
        },
        ParcelamentoInstallmentCreateRequest: {
          type: "object",
          required: [
            "client_id",
            "type",
            "legal_nature",
            "jurisdiction",
            "is_automatic_debit",
            "first_installment_amount",
            "current_month_installment_amount",
            "agreed_installments_count",
          ],
          properties: {
            client_id: uuid,
            agreement_number: nullableText,
            type: text,
            legal_nature: text,
            jurisdiction: text,
            is_automatic_debit: boolean,
            first_installment_amount: number,
            current_month_installment_amount: number,
            agreed_installments_count: { type: "integer", minimum: 1 },
            enrollment_date: dateTime,
          },
          additionalProperties: false,
        },
        ParcelamentoInstallmentPatchRequest: {
          type: "object",
          properties: {
            agreement_number: nullableText,
            type: text,
            legal_nature: text,
            jurisdiction: text,
            is_automatic_debit: boolean,
            consolidated_total_amount: number,
            first_installment_amount: number,
            current_month_installment_amount: number,
            agreed_installments_count: { type: "integer", minimum: 1 },
            enrollment_date: dateTime,
            document_url: text,
            situation_shutdown: nullableText,
            status: text,
            completion_date: dateTime,
          },
          additionalProperties: false,
        },
        ParcelamentoInstallmentCompetency: {
          type: "object",
          properties: {
            id: uuid,
            installment_id: uuid,
            competence: text,
            how_many_paid: integer,
            how_many_overdue: integer,
            download: boolean,
            download_notes: nullableText,
            upload_file: { type: ["boolean", "null"] },
            is_sent: { type: ["boolean", "null"] },
            submission_type: nullableText,
            notes: nullableText,
            installment_amount: number,
          },
        },
        ParcelamentoInstallmentCompetencyCreateRequest: {
          type: "object",
          required: [
            "competence",
            "how_many_paid",
            "how_many_overdue",
            "download",
            "installment_amount",
          ],
          properties: {
            competence: text,
            how_many_paid: integer,
            how_many_overdue: integer,
            download: boolean,
            download_notes: nullableText,
            upload_file: { type: ["boolean", "null"] },
            is_sent: { type: ["boolean", "null"] },
            submission_type: nullableText,
            notes: nullableText,
            installment_amount: number,
          },
          additionalProperties: false,
        },
        ParcelamentoInstallmentCompetencyPatchRequest: {
          type: "object",
          properties: {
            how_many_paid: integer,
            how_many_overdue: integer,
            download: boolean,
            download_notes: nullableText,
            upload_file: { type: ["boolean", "null"] },
            is_sent: { type: ["boolean", "null"] },
            submission_type: nullableText,
            notes: nullableText,
            installment_amount: number,
          },
          additionalProperties: false,
        },
        ParcelamentoPanorama: {
          type: "object",
          properties: {
            id: uuid,
            client_id: uuid,
            competence: text,
            cnd_municipal: boolean,
            cnd_state: boolean,
            cnd_federal: boolean,
            cnd_fgts: boolean,
            cnd_labor: boolean,
            protests: boolean,
            state_tax_situation: boolean,
            federal_tax_situation: boolean,
            responsavel_id: { type: ["string", "null"], format: "uuid" },
          },
        },
        ParcelamentoPanoramaCreateRequest: {
          type: "object",
          required: ["client_id", "competence"],
          properties: {
            client_id: uuid,
            competence: text,
            cnd_municipal: boolean,
            cnd_state: boolean,
            cnd_federal: boolean,
            cnd_fgts: boolean,
            cnd_labor: boolean,
            protests: boolean,
            state_tax_situation: boolean,
            federal_tax_situation: boolean,
            responsavel_id: { type: ["string", "null"], format: "uuid" },
          },
          additionalProperties: false,
        },
        ParcelamentoPanoramaPatchRequest: {
          type: "object",
          properties: {
            cnd_municipal: boolean,
            cnd_state: boolean,
            cnd_federal: boolean,
            cnd_fgts: boolean,
            cnd_labor: boolean,
            protests: boolean,
            state_tax_situation: boolean,
            federal_tax_situation: boolean,
            responsavel_id: { type: ["string", "null"], format: "uuid" },
          },
          additionalProperties: false,
        },
        ParcelamentoPanoramaGenerateResult: {
          type: "object",
          required: ["created", "existing", "totalActiveClients"],
          properties: {
            created: integer,
            existing: integer,
            totalActiveClients: integer,
          },
        },
      },
    },
  };
}
