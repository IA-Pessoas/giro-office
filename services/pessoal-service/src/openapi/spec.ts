import type { OpenApiDocument } from "@workspace/shared/http";

import type { PessoalServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

const errorJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
    },
  },
} as const;

const bearerSecurity = [{ bearerAuth: [] }];
const internalSecurity = [{ internalServiceToken: [] }];

const idParam = (name: string) =>
  ({
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }) as const;

const queryParam = (name: string, format?: string, required = true) =>
  ({
    name,
    in: "query",
    required,
    schema: format ? { type: "string", format } : { type: "string" },
  }) as const;

const internalReportingHeader = (name: string) =>
  ({
    name,
    in: "header",
    required: true,
    schema: { type: "string", minLength: 1 },
  }) as const;

const mutationResponses = {
  "200": { description: "OK", ...successJson },
  "201": { description: "Created", ...successJson },
  "400": { description: "Bad request", ...errorJson },
  "401": { description: "Unauthorized", ...errorJson },
  "403": { description: "Forbidden", ...errorJson },
  "404": { description: "Not found", ...errorJson },
  "409": { description: "Conflict", ...errorJson },
} as const;

const deleteResponses = {
  "200": { description: "OK", ...successJson },
  "400": { description: "Bad request", ...errorJson },
  "401": { description: "Unauthorized", ...errorJson },
  "403": { description: "Forbidden", ...errorJson },
  "404": { description: "Not found", ...errorJson },
} as const;

const readResponses = {
  "200": { description: "OK", ...successJson },
  "400": { description: "Bad request", ...errorJson },
  "401": { description: "Unauthorized", ...errorJson },
  "404": { description: "Not found", ...errorJson },
} as const;

const unionListResponses = {
  ...readResponses,
  "200": {
    description: "Array completo ou pagina de sindicatos",
    content: {
      "application/json": {
        schema: {
          oneOf: [
            {
              type: "object",
              properties: {
                success: { type: "boolean" },
                data: { type: "array", items: { type: "object" } },
              },
            },
            {
              type: "object",
              properties: {
                success: { type: "boolean" },
                data: {
                  type: "object",
                  required: ["data", "total", "page", "limit", "hasMore"],
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                    total: { type: "integer", minimum: 0 },
                    page: { type: "integer", minimum: 1 },
                    limit: { type: "integer", minimum: 1, maximum: 100 },
                    hasMore: { type: "boolean" },
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
} as const;

const jsonRequestBody = (schema: Record<string, unknown>) =>
  ({
    required: true,
    content: {
      "application/json": {
        schema,
      },
    },
  }) as const;

const strictObjectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  ...(required.length > 0 ? { required } : {}),
  properties,
});

const uuidSchema = { type: "string", format: "uuid" } as const;
const textSchema = { type: "string", minLength: 1 } as const;
const nullableTextSchema = { type: "string", minLength: 1, nullable: true } as const;
const nullableDateSchema = { type: "string", format: "date-time", nullable: true } as const;
const nullableNonNegativeNumberSchema = { type: "number", minimum: 0, nullable: true } as const;
const nullableBooleanSchema = { type: "boolean", nullable: true } as const;
const competenceSchema = { type: "string", pattern: "^\\d{4}-\\d{2}$" } as const;
const reportingFieldSchema = { type: "string", minLength: 1, maxLength: 64 } as const;
const internalReportingExtractRequestSchema = strictObjectSchema(
  {
    source: { type: "string", enum: ["pessoal.ldd", "pessoal.payroll"] },
    fields: {
      type: "array",
      minItems: 1,
      maxItems: 25,
      items: reportingFieldSchema,
    },
    limit: { type: "integer", minimum: 1, maximum: 101 },
  },
  ["source", "fields", "limit"],
);

const createLddRequestSchema = strictObjectSchema(
  {
    client_id: uuidSchema,
    type: textSchema,
    period: nullableTextSchema,
    due_date: nullableDateSchema,
    balance_amount: nullableNonNegativeNumberSchema,
    registration_status: nullableTextSchema,
    status: nullableTextSchema,
  },
  ["client_id", "type"],
);

const updateLddRequestSchema = strictObjectSchema({
  type: textSchema,
  period: nullableTextSchema,
  due_date: nullableDateSchema,
  balance_amount: nullableNonNegativeNumberSchema,
  registration_status: nullableTextSchema,
  status: nullableTextSchema,
});

const createSituationRequestSchema = strictObjectSchema(
  {
    client_id: uuidSchema,
    title: textSchema,
    description: textSchema,
  },
  ["client_id", "title", "description"],
);

const updateSituationRequestSchema = strictObjectSchema({
  status: { type: "string", enum: ["Em andamento", "Finalizado"] },
  title: textSchema,
  description: textSchema,
});

const createUnionRequestSchema = strictObjectSchema(
  {
    name: textSchema,
    cnpj: textSchema,
    base_date: nullableDateSchema,
  },
  ["name", "cnpj"],
);

const updateUnionRequestSchema = strictObjectSchema({
  name: textSchema,
  cnpj: textSchema,
  base_date: nullableDateSchema,
});

const createPayrollRequestSchema = strictObjectSchema(
  {
    client_id: uuidSchema,
    responsible_id: { ...uuidSchema, nullable: true },
    advance: { type: "boolean" },
    advance_type: nullableTextSchema,
    advance_amount: nullableNonNegativeNumberSchema,
    info: textSchema,
    previous: { type: "boolean" },
    onvio: { type: "boolean" },
    group: textSchema,
    vt: { type: "boolean" },
    vt_value: nullableNonNegativeNumberSchema,
    vt_type: nullableTextSchema,
    va: { type: "boolean" },
    assistance_fee: { type: "boolean" },
    union_id: { ...uuidSchema, nullable: true },
    bem_mais: { type: "boolean" },
    bsf: { type: "boolean" },
    reinf: { type: "boolean" },
    employees: { type: "integer", minimum: 0 },
    contact: nullableTextSchema,
  },
  [
    "client_id",
    "advance",
    "info",
    "previous",
    "onvio",
    "group",
    "vt",
    "va",
    "assistance_fee",
    "bem_mais",
    "bsf",
    "reinf",
    "employees",
  ],
);

const updatePayrollRequestSchema = strictObjectSchema({
  responsible_id: { ...uuidSchema, nullable: true },
  advance: { type: "boolean" },
  advance_type: nullableTextSchema,
  advance_amount: nullableNonNegativeNumberSchema,
  info: textSchema,
  previous: { type: "boolean" },
  onvio: { type: "boolean" },
  group: textSchema,
  vt: { type: "boolean" },
  vt_value: nullableNonNegativeNumberSchema,
  vt_type: nullableTextSchema,
  va: { type: "boolean" },
  assistance_fee: { type: "boolean" },
  union_id: { ...uuidSchema, nullable: true },
  bem_mais: { type: "boolean" },
  bsf: { type: "boolean" },
  reinf: { type: "boolean" },
  employees: { type: "integer", minimum: 0 },
  contact: nullableTextSchema,
});

const createObligationRequestSchema = strictObjectSchema(
  {
    client_id: uuidSchema,
    competence: competenceSchema,
  },
  ["client_id", "competence"],
);

const updateObligationFieldRequestSchema = strictObjectSchema({
  advance: nullableBooleanSchema,
  payroll: nullableBooleanSchema,
  charges: nullableBooleanSchema,
  assistance_fee: nullableBooleanSchema,
  responsavel_id: { ...uuidSchema, nullable: true },
  bem_mais: nullableBooleanSchema,
  bsf: nullableBooleanSchema,
  va: nullableBooleanSchema,
  vt: nullableBooleanSchema,
});

const createPasswordRequestSchema = strictObjectSchema(
  {
    client_id: uuidSchema,
    service_name: textSchema,
    login_main: nullableTextSchema,
    senha_main: nullableTextSchema,
    login_secondary: nullableTextSchema,
    senha_secondary: nullableTextSchema,
    responsavel_id: { ...uuidSchema, nullable: true },
    notes: nullableTextSchema,
  },
  ["client_id", "service_name"],
);

const updatePasswordRequestSchema = strictObjectSchema({
  service_name: textSchema,
  login_main: nullableTextSchema,
  senha_main: nullableTextSchema,
  login_secondary: nullableTextSchema,
  senha_secondary: nullableTextSchema,
  responsavel_id: { ...uuidSchema, nullable: true },
  notes: nullableTextSchema,
});

const successJsonWithData = (dataSchema: Record<string, unknown>) =>
  ({
    content: {
      "application/json": {
        schema: {
          allOf: [
            { $ref: "#/components/schemas/SuccessEnvelope" },
            {
              type: "object",
              properties: {
                data: dataSchema,
              },
            },
          ],
        },
      },
    },
  }) as const;

const passwordListResponses = {
  ...readResponses,
  "200": {
    description: "Lista de senhas sem campos secretos",
    ...successJsonWithData({
      type: "array",
      items: { $ref: "#/components/schemas/PessoalPasswordListItem" },
    }),
  },
} as const;

const passwordDetailResponses = {
  ...readResponses,
  "200": {
    description: "Detalhe de senha; campos secretos so sao retornados com permissao 3",
    ...successJsonWithData({ $ref: "#/components/schemas/PessoalPasswordDetail" }),
  },
} as const;

const passwordMutationResponses = {
  ...mutationResponses,
  "200": {
    description: "Registro de senha sem campos secretos",
    ...successJsonWithData({ $ref: "#/components/schemas/PessoalPasswordListItem" }),
  },
  "201": {
    description: "Registro de senha criado sem campos secretos",
    ...successJsonWithData({ $ref: "#/components/schemas/PessoalPasswordListItem" }),
  },
} as const;

const obligationGenerationResponses = {
  ...mutationResponses,
  "200": {
    description: "Resumo da geracao global de obrigacoes",
    ...successJsonWithData({ $ref: "#/components/schemas/PessoalObligationGenerationResult" }),
  },
} as const;

const optionalDetailResponses = {
  "200": {
    description: "OK; data e null quando o registro ainda nao existe",
    ...successJsonWithData({ type: "object", nullable: true, additionalProperties: true }),
  },
  "400": { description: "Bad request", ...errorJson },
  "401": { description: "Unauthorized", ...errorJson },
} as const;

const pessoalOverviewResponses = {
  "200": {
    description: "Resumo consolidado da visao geral de pessoal",
    ...successJsonWithData({
      type: "object",
      required: ["unions", "ldd"],
      properties: {
        unions: {
          type: "object",
          required: ["total", "withBaseDate", "withoutBaseDate", "withCnpj"],
          properties: {
            total: { type: "integer", minimum: 0 },
            withBaseDate: { type: "integer", minimum: 0 },
            withoutBaseDate: { type: "integer", minimum: 0 },
            withCnpj: { type: "integer", minimum: 0 },
          },
        },
        ldd: {
          type: "object",
          required: ["total", "open", "overdue", "paid"],
          properties: {
            total: { type: "integer", minimum: 0 },
            open: { type: "integer", minimum: 0 },
            overdue: { type: "integer", minimum: 0 },
            paid: { type: "integer", minimum: 0 },
          },
        },
      },
    }),
  },
  "401": { description: "Unauthorized", ...errorJson },
} as const;

export function buildPessoalServiceOpenApiSpec(env: PessoalServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "pessoal-service",
      version: "1.0.0",
      description: "Servico de Pessoal com contratos modernos para rotinas trabalhistas.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Pessoal LDD", description: "Controle de LDD" },
      { name: "Pessoal Situations", description: "Situacoes de clientes" },
      { name: "Pessoal Unions", description: "Sindicatos" },
      { name: "Pessoal Payroll", description: "Configuracao de folha" },
      { name: "Pessoal Obligations", description: "Obrigacoes mensais" },
      {
        name: "Pessoal Passwords",
        description: "Registros de senha com lista sem campos secretos",
      },
      {
        name: "Pessoal Internal",
        description: "Rotas internas para schedulers e integracoes servico-a-servico",
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
          description: "Resposta de sucesso padrao do workspace",
          additionalProperties: true,
        },
        ErrorEnvelope: {
          type: "object",
          description: "Resposta de erro padrao do workspace",
          additionalProperties: true,
        },
        PessoalPasswordListItem: {
          type: "object",
          description: "Item de senha sem campos secretos.",
          required: ["id", "client_id", "service_name", "responsavel_id"],
          properties: {
            id: { type: "string", format: "uuid" },
            client_id: { type: "string", format: "uuid" },
            service_name: { type: "string" },
            responsavel_id: { type: "string", format: "uuid", nullable: true },
            responsavel: { type: "object", nullable: true, additionalProperties: true },
          },
        },
        PessoalPasswordDetail: {
          allOf: [
            { $ref: "#/components/schemas/PessoalPasswordListItem" },
            {
              type: "object",
              description: "Detalhe de senha com campos secretos descriptografados.",
              properties: {
                login_main: { type: "string", nullable: true },
                senha_main: { type: "string", nullable: true },
                login_secondary: { type: "string", nullable: true },
                senha_secondary: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
                organization_id: { type: "string", format: "uuid" },
              },
            },
          ],
        },
        PessoalObligationGenerationResult: {
          type: "object",
          description: "Contadores retornados pela geracao global de obrigacoes.",
          required: [
            "clients",
            "payrollRows",
            "existing",
            "created",
            "skippedExisting",
            "skippedNoPayroll",
          ],
          properties: {
            clients: { type: "integer", minimum: 0 },
            payrollRows: { type: "integer", minimum: 0 },
            existing: { type: "integer", minimum: 0 },
            created: { type: "integer", minimum: 0 },
            skippedExisting: { type: "integer", minimum: 0 },
            skippedNoPayroll: { type: "integer", minimum: 0 },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          operationId: "getPessoalHealth",
          responses: {
            "200": { description: "OK", ...successJson },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          operationId: "getPessoalReadiness",
          responses: {
            "200": { description: "Ready", ...successJson },
          },
        },
      },
      "/pessoal/ldd": {
        get: {
          tags: ["Pessoal LDD"],
          security: bearerSecurity,
          summary: "Listar LDD por organizacao ou cliente",
          operationId: "listPessoalLdd",
          parameters: [queryParam("client_id", "uuid", false)],
          responses: readResponses,
        },
        post: {
          tags: ["Pessoal LDD"],
          security: bearerSecurity,
          summary: "Criar LDD",
          operationId: "createPessoalLdd",
          requestBody: jsonRequestBody(createLddRequestSchema),
          responses: obligationGenerationResponses,
        },
      },
      "/pessoal/ldd/{id}": {
        patch: {
          tags: ["Pessoal LDD"],
          security: bearerSecurity,
          summary: "Atualizar LDD",
          operationId: "updatePessoalLdd",
          parameters: [idParam("id")],
          requestBody: jsonRequestBody(updateLddRequestSchema),
          responses: mutationResponses,
        },
        delete: {
          tags: ["Pessoal LDD"],
          security: bearerSecurity,
          summary: "Remover LDD",
          operationId: "deletePessoalLdd",
          parameters: [idParam("id")],
          responses: mutationResponses,
        },
      },
      "/pessoal/overview": {
        get: {
          tags: ["Pessoal Overview"],
          security: bearerSecurity,
          summary: "Resumo consolidado da visao geral",
          operationId: "getPessoalOverview",
          responses: pessoalOverviewResponses,
        },
      },
      "/pessoal/situations": {
        get: {
          tags: ["Pessoal Situations"],
          security: bearerSecurity,
          summary: "Listar situacoes por cliente",
          operationId: "listPessoalSituations",
          parameters: [queryParam("client_id", "uuid")],
          responses: readResponses,
        },
        post: {
          tags: ["Pessoal Situations"],
          security: bearerSecurity,
          summary: "Criar situacao",
          operationId: "createPessoalSituation",
          requestBody: jsonRequestBody(createSituationRequestSchema),
          responses: mutationResponses,
        },
      },
      "/pessoal/situations/{id}": {
        get: {
          tags: ["Pessoal Situations"],
          security: bearerSecurity,
          summary: "Detalhar situacao",
          operationId: "getPessoalSituation",
          parameters: [idParam("id")],
          responses: readResponses,
        },
        patch: {
          tags: ["Pessoal Situations"],
          security: bearerSecurity,
          summary: "Atualizar situacao",
          operationId: "updatePessoalSituation",
          parameters: [idParam("id")],
          requestBody: jsonRequestBody(updateSituationRequestSchema),
          responses: mutationResponses,
        },
        delete: {
          tags: ["Pessoal Situations"],
          security: bearerSecurity,
          summary: "Remover situacao",
          operationId: "deletePessoalSituation",
          parameters: [idParam("id")],
          responses: deleteResponses,
        },
      },
      "/pessoal/unions": {
        get: {
          tags: ["Pessoal Unions"],
          security: bearerSecurity,
          summary: "Listar sindicatos",
          operationId: "listPessoalUnions",
          parameters: [
            queryParam("search", undefined, false),
            {
              name: "page",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: unionListResponses,
        },
        post: {
          tags: ["Pessoal Unions"],
          security: bearerSecurity,
          summary: "Criar sindicato",
          operationId: "createPessoalUnion",
          requestBody: jsonRequestBody(createUnionRequestSchema),
          responses: mutationResponses,
        },
      },
      "/pessoal/unions/{id}": {
        get: {
          tags: ["Pessoal Unions"],
          security: bearerSecurity,
          summary: "Detalhar sindicato",
          operationId: "getPessoalUnion",
          parameters: [idParam("id")],
          responses: readResponses,
        },
        patch: {
          tags: ["Pessoal Unions"],
          security: bearerSecurity,
          summary: "Atualizar sindicato",
          operationId: "updatePessoalUnion",
          parameters: [idParam("id")],
          requestBody: jsonRequestBody(updateUnionRequestSchema),
          responses: mutationResponses,
        },
        delete: {
          tags: ["Pessoal Unions"],
          security: bearerSecurity,
          summary: "Excluir sindicato",
          operationId: "deletePessoalUnion",
          parameters: [idParam("id")],
          responses: mutationResponses,
        },
      },
      "/pessoal/payroll": {
        post: {
          tags: ["Pessoal Payroll"],
          security: bearerSecurity,
          summary: "Criar configuracao de folha",
          operationId: "createPessoalPayroll",
          requestBody: jsonRequestBody(createPayrollRequestSchema),
          responses: mutationResponses,
        },
      },
      "/pessoal/payroll/{client_id}": {
        get: {
          tags: ["Pessoal Payroll"],
          security: bearerSecurity,
          summary: "Detalhar configuracao de folha",
          operationId: "getPessoalPayroll",
          parameters: [idParam("client_id")],
          responses: optionalDetailResponses,
        },
        patch: {
          tags: ["Pessoal Payroll"],
          security: bearerSecurity,
          summary: "Atualizar configuracao de folha",
          operationId: "updatePessoalPayroll",
          parameters: [idParam("client_id")],
          requestBody: jsonRequestBody(updatePayrollRequestSchema),
          responses: mutationResponses,
        },
      },
      "/pessoal/obrigations": {
        get: {
          tags: ["Pessoal Obligations"],
          security: bearerSecurity,
          summary: "Detalhar obrigacao por cliente e competencia",
          operationId: "getPessoalObligation",
          parameters: [queryParam("client_id", "uuid"), queryParam("competence")],
          responses: optionalDetailResponses,
        },
        post: {
          tags: ["Pessoal Obligations"],
          security: bearerSecurity,
          summary: "Criar obrigacao idempotente",
          operationId: "createPessoalObligation",
          requestBody: jsonRequestBody(createObligationRequestSchema),
          responses: mutationResponses,
        },
      },
      "/pessoal/obrigations/{id}": {
        patch: {
          tags: ["Pessoal Obligations"],
          security: bearerSecurity,
          summary: "Atualizar um campo da obrigacao",
          operationId: "updatePessoalObligationField",
          parameters: [idParam("id")],
          requestBody: jsonRequestBody(updateObligationFieldRequestSchema),
          responses: mutationResponses,
        },
      },
      "/pessoal/obrigations/competences/{competence}/generate": {
        post: {
          tags: ["Pessoal Obligations"],
          security: bearerSecurity,
          summary: "Gerar obrigacoes por competencia",
          operationId: "generatePessoalObligationsForCompetence",
          parameters: [
            {
              name: "competence",
              in: "path",
              required: true,
              schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            },
          ],
          responses: mutationResponses,
        },
      },
      "/pessoal/passwords": {
        get: {
          tags: ["Pessoal Passwords"],
          security: bearerSecurity,
          summary: "Listar senhas por cliente sem campos secretos",
          operationId: "listPessoalPasswords",
          parameters: [queryParam("client_id", "uuid")],
          responses: passwordListResponses,
        },
        post: {
          tags: ["Pessoal Passwords"],
          security: bearerSecurity,
          summary: "Criar registro de senha criptografado",
          operationId: "createPessoalPassword",
          requestBody: jsonRequestBody(createPasswordRequestSchema),
          responses: passwordMutationResponses,
        },
      },
      "/pessoal/passwords/{id}": {
        get: {
          tags: ["Pessoal Passwords"],
          security: bearerSecurity,
          summary: "Detalhar senha com campos secretos descriptografados",
          operationId: "getPessoalPassword",
          parameters: [idParam("id")],
          responses: passwordDetailResponses,
        },
        patch: {
          tags: ["Pessoal Passwords"],
          security: bearerSecurity,
          summary: "Atualizar registro de senha",
          operationId: "updatePessoalPassword",
          parameters: [idParam("id")],
          requestBody: jsonRequestBody(updatePasswordRequestSchema),
          responses: passwordMutationResponses,
        },
        delete: {
          tags: ["Pessoal Passwords"],
          security: bearerSecurity,
          summary: "Remover registro de senha",
          operationId: "deletePessoalPassword",
          parameters: [idParam("id")],
          responses: passwordMutationResponses,
        },
      },
      "/internal/pessoal/union-notifications/run": {
        post: {
          tags: ["Pessoal Internal"],
          security: internalSecurity,
          summary: "Executar rotina interna de notificacoes de sindicatos",
          operationId: "runPessoalUnionNotifications",
          responses: {
            "200": {
              description: "OK",
              ...successJsonWithData({
                type: "object",
                required: [
                  "organizations",
                  "unionsMatched",
                  "notificationsCreated",
                  "duplicatesSkipped",
                ],
                properties: {
                  organizations: { type: "integer", minimum: 0 },
                  unionsMatched: { type: "integer", minimum: 0 },
                  notificationsCreated: { type: "integer", minimum: 0 },
                  duplicatesSkipped: { type: "integer", minimum: 0 },
                },
              }),
            },
            "401": { description: "Unauthorized", ...errorJson },
            "403": { description: "Forbidden", ...errorJson },
            "500": { description: "Internal error", ...errorJson },
          },
        },
      },
      "/internal/reporting/catalog": {
        get: {
          tags: ["Pessoal Internal"],
          security: internalSecurity,
          summary: "Consultar catálogo interno de reporting de pessoal",
          operationId: "getPessoalReportingCatalog",
          parameters: [
            internalReportingHeader("x-request-id"),
            internalReportingHeader("x-reports-grant"),
            internalReportingHeader("x-reports-grant-signature"),
          ],
          responses: {
            "200": {
              description: "Catálogo seguro de fontes de pessoal",
              ...successJsonWithData({
                type: "object",
                required: ["sources", "relations"],
                properties: {
                  sources: { type: "array", items: { type: "object" } },
                  relations: { type: "array", items: { type: "object" } },
                },
              }),
            },
            "403": { description: "Forbidden", ...errorJson },
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          tags: ["Pessoal Internal"],
          security: internalSecurity,
          summary: "Extrair fonte de pessoal para o reports-service",
          operationId: "extractPessoalReportingData",
          parameters: [
            internalReportingHeader("x-request-id"),
            internalReportingHeader("x-reports-grant"),
            internalReportingHeader("x-reports-grant-signature"),
          ],
          requestBody: jsonRequestBody(internalReportingExtractRequestSchema),
          responses: {
            "200": {
              description: "Linhas projetadas e indicação de limite atingido, sem campos sensíveis",
              ...successJsonWithData({
                type: "object",
                required: ["rows", "reachedLimit"],
                properties: {
                  rows: { type: "array", items: { type: "object" } },
                  reachedLimit: { type: "boolean" },
                },
              }),
            },
            "400": { description: "Bad request", ...errorJson },
            "403": { description: "Forbidden", ...errorJson },
          },
        },
      },
    },
  };
}
