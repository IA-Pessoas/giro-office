import {
  MAX_REPORTING_QUERY_LIMIT,
  REGULARIZE_GUIDANCE_CHECKLIST_CODES,
  REGULARIZE_GUIDANCE_CHECKLIST_STATUSES,
  REGULARIZE_GUIDANCE_TARGET_TYPES,
  reportingQueryOpenApiSchema,
} from "@workspace/shared";

import {
  CANONICAL_GUIDANCE_STATUSES,
  CANONICAL_LICENSE_STATUSES,
  CANONICAL_PROCESS_STATUSES,
  FINANCIAL_STATUS_VALUES,
  LEGACY_LICENSE_STATUS_ALIASES,
  LEGACY_PROCESS_STATUS_ALIASES,
} from "../schemas/status.schemas.js";

type OpenApiDocument = Record<string, unknown> & {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, unknown>;
};

interface RegularizeServiceOpenApiEnv {
  port: number;
}

function successEnvelopeContent() {
  return {
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/SuccessEnvelope" },
      },
    },
  };
}

const processRecordOpenApiSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", format: "uuid" },
    status: { type: "string", enum: [...CANONICAL_PROCESS_STATUSES] },
    financial_status: { type: "string", enum: [...FINANCIAL_STATUS_VALUES] },
    client_notice_date: { type: "string", format: "date", nullable: true },
    locking_type: { type: "string", nullable: true },
    elapsed_days: { type: "integer", minimum: 0, nullable: true },
  },
};

function processRecordSuccessEnvelopeContent() {
  return {
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean" },
            data: {
              oneOf: [
                processRecordOpenApiSchema,
                {
                  type: "object",
                  required: ["create"],
                  properties: { create: processRecordOpenApiSchema },
                },
                {
                  type: "object",
                  required: ["detail"],
                  properties: { detail: processRecordOpenApiSchema },
                },
              ],
            },
          },
        },
      },
    },
  };
}

function dualListSuccessEnvelopeContent() {
  const itemArray = { type: "array", items: { type: "object" } };
  return {
    content: {
      "application/json": {
        schema: {
          oneOf: [
            {
              type: "object",
              properties: { success: { type: "boolean" }, data: itemArray },
            },
            {
              type: "object",
              properties: {
                success: { type: "boolean" },
                data: {
                  type: "object",
                  required: ["data", "total", "page", "limit", "hasMore"],
                  properties: {
                    data: itemArray,
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
  };
}

function protectedErrorResponses() {
  return {
    "400": { description: "Dados de entrada invalidos" },
    "401": { description: "Autenticacao ausente ou invalida" },
    "403": { description: "Permissao insuficiente para o modulo Regularize" },
  };
}

const guidanceChecklistItemOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "status"],
  properties: {
    code: { type: "string", enum: [...REGULARIZE_GUIDANCE_CHECKLIST_CODES] },
    status: { type: "string", enum: [...REGULARIZE_GUIDANCE_CHECKLIST_STATUSES] },
    observation: { type: "string" },
  },
};

const guidanceChecklistOpenApiSchema = {
  type: "array",
  minItems: 17,
  maxItems: 17,
  description: "Os 17 códigos canônicos, cada um exatamente uma vez.",
  items: guidanceChecklistItemOpenApiSchema,
};

const guidanceChecklistResponseItemOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "guidance_id",
    "code",
    "label",
    "status",
    "observation",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    guidance_id: { type: "string", format: "uuid" },
    code: { type: "string", enum: [...REGULARIZE_GUIDANCE_CHECKLIST_CODES] },
    label: { type: "string" },
    status: { type: "string", enum: [...REGULARIZE_GUIDANCE_CHECKLIST_STATUSES] },
    observation: { type: "string", nullable: true },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
};

const guidanceChecklistItemsResponseOpenApiSchema = {
  type: "array",
  minItems: 17,
  maxItems: 17,
  description: "Os 17 itens canônicos persistidos, na ordem de apresentação.",
  items: guidanceChecklistResponseItemOpenApiSchema,
};

const guidanceEconomicActivityInputOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "description", "type"],
  properties: {
    id: { type: "string", format: "uuid" },
    code: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    type: { type: "string", enum: ["Principal", "Secundária", "Secundaria"] },
  },
};

const guidanceEconomicActivityResponseOpenApiSchema = {
  ...guidanceEconomicActivityInputOpenApiSchema,
  required: ["id", "code", "description", "type"],
};

const guidancePartnerInputOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "cpf"],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 1 },
    cpf: { type: "string", minLength: 1 },
    percentage: { type: "number", minimum: 0, maximum: 100 },
    role: { type: "string" },
    profession: { type: "string" },
    marital_status: { type: "string" },
    rg: { type: "string" },
    cnh: { type: "string" },
    address: { type: "string" },
    share: { type: "number" },
  },
};

const guidancePartnerResponseOpenApiSchema = {
  ...guidancePartnerInputOpenApiSchema,
  required: ["id", "name", "cpf"],
};

const guidanceSnapshotProperties = {
  version: { type: "integer", enum: [1] },
  source: { type: "string", enum: ["manual", "client_pj", "client_pf"] },
  name: { type: "string" },
  document: { type: "string" },
  address: { type: "string" },
  city: { type: "string" },
  state: { type: "string" },
  company_name: { type: "string" },
  trade_name: { type: "string" },
  cpf_cnpj: { type: "string" },
  legal_nature: { type: "string" },
  share_capital: { oneOf: [{ type: "number" }, { type: "string" }] },
  type: { type: "string" },
  request: { type: "string" },
  framework_obs: { type: "string" },
  iptu: { type: "string" },
  comporate_purpose: { type: "string" },
  carryng: { type: "string" },
  regime: { type: "string" },
  legal_representative: { type: "string" },
  economic_activities: {
    type: "array",
    items: guidanceEconomicActivityInputOpenApiSchema,
  },
  partners: {
    type: "array",
    items: guidancePartnerInputOpenApiSchema,
  },
  status: { type: "string", enum: [...CANONICAL_GUIDANCE_STATUSES] },
};

const guidanceTargetSnapshotOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "source"],
  properties: guidanceSnapshotProperties,
};

const guidanceInputTargetSnapshotOpenApiSchema = {
  ...guidanceTargetSnapshotOpenApiSchema,
  required: ["version", "source", "name"],
  properties: {
    ...guidanceSnapshotProperties,
    source: { type: "string", enum: ["manual"] },
    name: { type: "string", minLength: 1 },
  },
};

const guidanceBranchDataOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "address", "city", "state"],
  properties: {
    name: { type: "string", minLength: 1 },
    document: { type: "string", minLength: 1 },
    address: { type: "string", minLength: 1 },
    city: { type: "string", minLength: 1 },
    state: { type: "string", minLength: 1 },
  },
};

const guidanceOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "organization_id",
    "process_id",
    "type",
    "request",
    "framework_obs",
    "legal_nature",
    "company_name",
    "trade_name",
    "cpf_cnpj",
    "share_capital",
    "iptu",
    "address",
    "comporate_purpose",
    "carryng",
    "regime",
    "legal_representative",
    "status",
    "economic_activities",
    "partners",
    "target_type",
    "client_pj_id",
    "client_pf_id",
    "target_snapshot",
    "checklist_items",
    "branch_data",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    organization_id: { type: "string", format: "uuid" },
    process_id: { type: "string", format: "uuid", nullable: true },
    type: { type: "string", nullable: true },
    request: { type: "string", nullable: true },
    framework_obs: { type: "string", nullable: true },
    legal_nature: { type: "string", nullable: true },
    company_name: { type: "string", nullable: true },
    trade_name: { type: "string", nullable: true },
    cpf_cnpj: { type: "string", nullable: true },
    share_capital: { type: "number", nullable: true },
    iptu: { type: "string", nullable: true },
    address: { type: "string", nullable: true },
    comporate_purpose: { type: "string", nullable: true },
    carryng: { type: "string", nullable: true },
    regime: { type: "string", nullable: true },
    legal_representative: { type: "string", nullable: true },
    status: { type: "string", enum: [...CANONICAL_GUIDANCE_STATUSES] },
    economic_activities: {
      type: "array",
      nullable: true,
      items: guidanceEconomicActivityResponseOpenApiSchema,
    },
    partners: { type: "array", nullable: true, items: guidancePartnerResponseOpenApiSchema },
    target_type: { type: "string", enum: [...REGULARIZE_GUIDANCE_TARGET_TYPES] },
    client_pj_id: { type: "string", format: "uuid", nullable: true },
    client_pf_id: { type: "string", format: "uuid", nullable: true },
    target_snapshot: guidanceTargetSnapshotOpenApiSchema,
    checklist_items: guidanceChecklistItemsResponseOpenApiSchema,
    branch_data: { ...guidanceBranchDataOpenApiSchema, nullable: true },
  },
};

function guidanceRequestBody(required: string[], includeId: boolean, includeCollections: boolean) {
  return {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
            required,
            properties: {
              ...(includeId ? { id: { type: "string", format: "uuid" } } : {}),
              process_id: { type: "string", format: "uuid", nullable: true },
              target_type: { type: "string", enum: [...REGULARIZE_GUIDANCE_TARGET_TYPES] },
              client_pj_id: { type: "string", format: "uuid", nullable: true },
              client_pf_id: { type: "string", format: "uuid", nullable: true },
              target_snapshot: guidanceInputTargetSnapshotOpenApiSchema,
              checklist: guidanceChecklistOpenApiSchema,
              branch_data: { ...guidanceBranchDataOpenApiSchema, nullable: true },
              type: { type: "string" },
              request: { type: "string" },
              framework_obs: { type: "string" },
              legal_nature: { type: "string" },
              company_name: { type: "string" },
              trade_name: { type: "string" },
              cpf_cnpj: { type: "string" },
              share_capital: { type: "number" },
              iptu: { type: "string" },
              address: { type: "string" },
              comporate_purpose: { type: "string" },
              carryng: { type: "string" },
              regime: { type: "string" },
              legal_representative: { type: "string" },
              status: { type: "string", enum: [...CANONICAL_GUIDANCE_STATUSES] },
              ...(includeCollections
                ? {
                    economic_activities: {
                      type: "array",
                      items: guidanceEconomicActivityInputOpenApiSchema,
                    },
                    partners: { type: "array", items: guidancePartnerInputOpenApiSchema },
                  }
                : {}),
            },
          },
        },
      },
    },
  };
}

function guidanceSuccessEnvelopeContent(list = false) {
  return {
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["success", "data"],
          properties: {
            success: { type: "boolean", enum: [true] },
            data: list ? { type: "array", items: guidanceOpenApiSchema } : guidanceOpenApiSchema,
          },
        },
      },
    },
  };
}

function guidanceErrorResponses() {
  return {
    ...protectedErrorResponses(),
    "404": { description: "Orientação, processo ou cadastro não encontrado" },
    "409": { description: "Já existe orientação em andamento para este processo" },
    "422": { description: "Alvo, checklist ou dados de filial inconsistentes" },
  };
}

function statusRequestBody(
  statuses: readonly string[],
  required: string[],
  statusDescription = "Estado canonico; aliases legados nao sao aceitos em novas escritas.",
) {
  return {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: true,
            required,
            properties: {
              status: {
                type: "string",
                enum: [...statuses],
                description: statusDescription,
              },
            },
          },
        },
      },
    },
  };
}

function processRequestBody(required: string[]) {
  return {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
            required,
            description: "Informe exatamente um cliente PJ ou PF.",
            properties: {
              id: { type: "string", format: "uuid" },
              client_pj_id: { type: "string", format: "uuid" },
              client_pf_id: { type: "string", format: "uuid" },
              cpf_cnpj: { type: "string", minLength: 1 },
              process_type: { type: "string", minLength: 1 },
              description: { type: "string", minLength: 1 },
              entry_date: { type: "string", format: "date-time" },
              completion_date: { type: "string", format: "date-time" },
              expected_date: { type: "string", format: "date-time" },
              client_notice_date: { type: "string", format: "date", nullable: true },
              status: { type: "string", enum: [...CANONICAL_PROCESS_STATUSES] },
              financial_status: {
                oneOf: [
                  { type: "string", enum: [...FINANCIAL_STATUS_VALUES] },
                  { type: "integer", enum: [0, 1, 3, 4] },
                  { type: "string", enum: ["0", "1", "3", "4"] },
                ],
              },
              observation: { type: "string", nullable: true },
              responsible1_id: { type: "string", format: "uuid" },
              responsible2_id: { type: "string", format: "uuid" },
              responsible3_id: { type: "string", format: "uuid" },
              locking_type: { type: "string", nullable: true },
              urgency: { type: "string", nullable: true },
              task_id: { type: "string", format: "uuid" },
            },
          },
        },
      },
    },
  };
}

function paginatedClientPfSuccessEnvelopeContent() {
  return {
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean" },
            data: {
              type: "object",
              required: ["data", "total", "page", "limit", "hasMore"],
              properties: {
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "name"],
                    properties: {
                      id: { type: "string", format: "uuid" },
                      code: { type: "string", nullable: true },
                      name: { type: "string" },
                      cpf: { type: "string", nullable: true },
                    },
                  },
                },
                total: { type: "integer", minimum: 0 },
                page: { type: "integer", minimum: 1 },
                limit: { type: "integer", minimum: 1, maximum: 100 },
                hasMore: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  };
}

function paginatedMunicipalTaxesSuccessEnvelopeContent() {
  return {
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean" },
            data: {
              type: "object",
              required: ["data", "total", "page", "limit", "hasMore"],
              properties: {
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "name"],
                    properties: {
                      id: { type: "string", format: "uuid" },
                      dominio_code: { type: "string", nullable: true },
                      name: { type: "string" },
                      cpf_cnpj: { type: "string", nullable: true },
                      city: { type: "string", nullable: true },
                      municipalTaxes: {
                        type: "array",
                        items: {
                          type: "object",
                          required: ["id"],
                          properties: { id: { type: "string", format: "uuid" } },
                        },
                      },
                    },
                  },
                },
                total: { type: "integer", minimum: 0 },
                page: { type: "integer", minimum: 1 },
                limit: { type: "integer", minimum: 1, maximum: 100 },
                hasMore: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  };
}

export function buildRegularizeServiceOpenApiSpec(
  env: RegularizeServiceOpenApiEnv,
): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "regularize-service",
      version: "1.0.0",
      description:
        "API do modulo regularize. As rotas de negocio exigem contexto autenticado, permissao Regularize 1 para leitura e 2 para mutacoes; chamadas internas usam token de servico. Status legados continuam aceitos nas leituras, enquanto novas escritas usam somente estados canonicos.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Dashboard", description: "Resumo do modulo Regularize" },
      { name: "Passwords", description: "Senhas por cliente" },
      { name: "Sites", description: "Sites e credenciais base" },
      { name: "PF", description: "Clientes PF do regularize" },
      { name: "Partners", description: "Quadro societario" },
      { name: "MunicipalTaxes", description: "Tributos municipais" },
      {
        name: "DTE",
        description: "Importação manual de avisos, caixa de avisos e consultas diárias ao DTE",
      },
      { name: "Processes", description: "Processos de regularize" },
      { name: "Guidance", description: "Orientacoes procedurais" },
      { name: "Licenses", description: "Alvaras e licencas" },
      { name: "Internal", description: "Rotinas internas de reconciliacao" },
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
      "/regularize/dashboard": {
        get: {
          tags: ["Dashboard"],
          summary: "Obter resumo do dashboard do Regularize",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "year",
              in: "query",
              required: true,
              schema: { type: "integer" },
            },
          ],
          responses: {
            "200": { description: "Resumo do dashboard", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/passwords": {
        get: {
          tags: ["Passwords"],
          summary: "Listar senhas por cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: { "200": { description: "Lista de senhas", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Passwords"],
          summary: "Criar senha",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Senha criada", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Passwords"],
          summary: "Atualizar senha",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Senha atualizada", ...successEnvelopeContent() } },
        },
      },
      "/regularize/password": {
        get: {
          tags: ["Passwords"],
          summary: "Detalhar senha",
          description: "Revela login e senha somente para usuarios com permissao Regularize 2.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe da senha", ...successEnvelopeContent() },
            "403": { description: "Permissao insuficiente para revelar credencial" },
          },
        },
      },
      "/regularize/sites-pass": {
        get: {
          tags: ["Sites"],
          summary: "Listar sites base",
          description: "Retorna somente campos seguros da lista; o campo password nao e retornado.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "status", in: "query", required: true, schema: { type: "boolean" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Lista completa ou pagina de sites",
              ...dualListSuccessEnvelopeContent(),
            },
          },
        },
        post: {
          tags: ["Sites"],
          summary: "Criar site base",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Site criado", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Sites"],
          summary: "Atualizar site base",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Site atualizado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/sites-pass-detail": {
        get: {
          tags: ["Sites"],
          summary: "Detalhar site base com credencial",
          description: "Revela usuario e senha somente para usuarios com permissao de revelacao.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe do site com credencial", ...successEnvelopeContent() },
            "403": { description: "Permissao insuficiente para revelar credencial" },
          },
        },
      },
      "/regularize/pf": {
        get: {
          tags: ["PF"],
          summary: "Detalhar cliente PF",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe do cliente PF", ...successEnvelopeContent() },
          },
        },
        post: {
          tags: ["PF"],
          summary: "Criar cliente PF",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Cliente PF criado", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["PF"],
          summary: "Atualizar cliente PF",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Cliente PF atualizado", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/pfs": {
        get: {
          tags: ["PF"],
          summary: "Listar clientes PF com busca e paginação",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "status", in: "query", required: true, schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            "200": {
              description: "Página de clientes PF",
              ...paginatedClientPfSuccessEnvelopeContent(),
            },
          },
        },
      },
      "/regularize/partners": {
        get: {
          tags: ["Partners"],
          summary: "Listar socios",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "type",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["pf", "pj"] },
            },
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: { "200": { description: "Lista de socios", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Partners"],
          summary: "Criar socio",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Socio criado", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Partners"],
          summary: "Atualizar socio",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Socio atualizado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/partners/{id}": {
        delete: {
          tags: ["Partners"],
          summary: "Remover vinculo de socio",
          description: "Remove somente o vinculo entre PF e PJ, preservando a Pessoa Fisica.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Vinculo removido", ...successEnvelopeContent() } },
        },
      },
      "/regularize/partner": {
        get: {
          tags: ["Partners"],
          summary: "Detalhar socio",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Detalhe do socio", ...successEnvelopeContent() } },
        },
      },
      "/regularize/dte/import": {
        post: {
          tags: ["DTE"],
          summary: "Importar avisos DTE colados em HTML ou JSON",
          description:
            "Extrai a primeira tabela conforme o legado e ignora avisos repetidos. Leitor verificado apenas com casos sintéticos.",
          security: [{ bearerAuth: [] }],
          responses: {
            "201": { description: "Resumo da importação", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/dte/imports": {
        get: {
          tags: ["DTE"],
          summary: "Listar importações de DTE com recusas e duplicatas",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            "200": { description: "Página de importações", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/dte/notices": {
        get: {
          tags: ["DTE"],
          summary: "Listar avisos DTE importados",
          description:
            "Sem `from`, lista os avisos emitidos nos últimos 45 dias. O período usa a data de emissão do aviso; quando ela não pôde ser lida, a data da importação.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
            {
              name: "tipo",
              in: "query",
              description: "Trecho da classe do selo (ex.: badge-warning); vazio lista os sem cor.",
              schema: { type: "string" },
            },
            { name: "search", in: "query", schema: { type: "string", default: "" } },
            {
              name: "reading",
              in: "query",
              schema: { type: "string", enum: ["Todos", "Pendente", "Lido"], default: "Todos" },
            },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            "200": { description: "Página de avisos DTE", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/dte/notices/reading": {
        put: {
          tags: ["DTE"],
          summary: "Alterar o estado de leitura de um aviso DTE",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Aviso atualizado", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/dte/queries": {
        get: {
          tags: ["DTE"],
          summary: "Grade de consultas diárias ao DTE por cliente",
          description:
            "Clientes de comércio ou indústria da BA com inscrição estadual, na carteira da competência do dia, mais os que já têm registro na data.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "date",
              in: "query",
              required: true,
              schema: { type: "string", format: "date" },
            },
          ],
          responses: {
            "200": { description: "Situação por cliente no dia", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/dte/queries/status": {
        put: {
          tags: ["DTE"],
          summary: "Marcar a consulta de um cliente como feita, não feita ou sem registro",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Situação atualizada", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/dte/queries/import": {
        post: {
          tags: ["DTE"],
          summary: "Registrar consultas do dia por listas de CPF/CNPJ",
          description:
            "Recebe as listas de feitas e não feitas; documento nas duas listas não é aplicado.",
          security: [{ bearerAuth: [] }],
          responses: {
            "201": { description: "Resumo do registro", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/municipal-taxes": {
        get: {
          tags: ["MunicipalTaxes"],
          summary: "Listar tributos municipais com filtros e paginação",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "year", in: "query", required: true, schema: { type: "integer" } },
            { name: "search", in: "query", schema: { type: "string", default: "" } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["Todos", "Criado", "Pendente"], default: "Todos" },
            },
            { name: "type", in: "query", schema: { type: "string", enum: ["TFF", "TLP", "TLL"] } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            "200": {
              description: "Página de tributos municipais",
              ...paginatedMunicipalTaxesSuccessEnvelopeContent(),
            },
          },
        },
        post: {
          tags: ["MunicipalTaxes"],
          summary: "Criar tributo municipal",
          security: [{ bearerAuth: [] }],
          responses: {
            "201": { description: "Tributo municipal criado", ...successEnvelopeContent() },
          },
        },
        put: {
          tags: ["MunicipalTaxes"],
          summary: "Atualizar tributo municipal",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Tributo municipal atualizado", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/municipal-taxes-detail": {
        get: {
          tags: ["MunicipalTaxes"],
          summary: "Detalhar tributo municipal",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe do tributo municipal", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/process": {
        get: {
          tags: ["Processes"],
          summary: "Detalhar processo com responsáveis, prazo e histórico",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe do processo", ...processRecordSuccessEnvelopeContent() },
            "404": { description: "Processo nao encontrado" },
            ...protectedErrorResponses(),
          },
        },
        post: {
          tags: ["Processes"],
          summary: "Criar processo",
          security: [{ bearerAuth: [] }],
          ...processRequestBody(["cpf_cnpj", "process_type", "description", "status"]),
          responses: {
            "201": { description: "Processo criado", ...processRecordSuccessEnvelopeContent() },
            "404": { description: "Cliente, responsavel ou tarefa nao encontrado" },
            "409": { description: "Processo duplicado" },
            ...protectedErrorResponses(),
          },
        },
        put: {
          tags: ["Processes"],
          summary: "Atualizar processo",
          security: [{ bearerAuth: [] }],
          ...processRequestBody(["id", "cpf_cnpj", "process_type", "description", "status"]),
          responses: {
            "200": { description: "Processo atualizado", ...processRecordSuccessEnvelopeContent() },
            "404": { description: "Processo, cliente, responsavel ou tarefa nao encontrado" },
            "409": { description: "Processo duplicado ou alterado" },
            ...protectedErrorResponses(),
          },
        },
      },
      "/regularize/process/send-to-fiscal": {
        post: {
          tags: ["Processes"],
          summary: "Registrar envio do processo ao Fiscal",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id"],
                  properties: { id: { type: "string", format: "uuid" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Envio ao Fiscal registrado", ...successEnvelopeContent() },
            "404": { description: "Processo nao encontrado" },
            ...protectedErrorResponses(),
          },
        },
      },
      "/regularize/process/return-from-fiscal": {
        post: {
          tags: ["Processes"],
          summary: "Registrar retorno do processo pelo Fiscal",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id"],
                  properties: { id: { type: "string", format: "uuid" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Retorno do Fiscal registrado", ...successEnvelopeContent() },
            "404": { description: "Processo nao encontrado" },
            ...protectedErrorResponses(),
          },
        },
      },
      "/regularize/processes": {
        get: {
          tags: ["Processes"],
          summary: "Listar processos",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "status",
              in: "query",
              required: true,
              schema: {
                type: "string",
                enum: ["Todos", ...CANONICAL_PROCESS_STATUSES, ...LEGACY_PROCESS_STATUS_ALIASES],
              },
            },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Lista completa ou pagina de processos",
              ...dualListSuccessEnvelopeContent(),
            },
          },
        },
      },
      "/regularize/guidance": {
        post: {
          tags: ["Guidance"],
          summary: "Criar orientação procedural independente ou vinculada a processo",
          security: [{ bearerAuth: [] }],
          ...guidanceRequestBody(["target_type", "checklist", "status"], false, true),
          responses: {
            "201": {
              description: "Orientação completa criada",
              ...guidanceSuccessEnvelopeContent(),
            },
            ...guidanceErrorResponses(),
          },
        },
        put: {
          tags: ["Guidance"],
          summary: "Atualizar orientação procedural completa",
          security: [{ bearerAuth: [] }],
          ...guidanceRequestBody(["id"], true, false),
          responses: {
            "200": {
              description: "Orientação completa atualizada",
              ...guidanceSuccessEnvelopeContent(),
            },
            ...guidanceErrorResponses(),
          },
        },
      },
      "/regularize/guidance/detail": {
        get: {
          tags: ["Guidance"],
          summary: "Detalhar orientacao procedural",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe da orientação", ...guidanceSuccessEnvelopeContent() },
            ...guidanceErrorResponses(),
          },
        },
      },
      "/regularize/guidance/pdf": {
        get: {
          tags: ["Guidance"],
          summary: "Visualizar PDF da orientação processual selecionada",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "PDF da orientação processual",
              content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
            },
            ...guidanceErrorResponses(),
          },
        },
      },
      "/regularize/guidance/list": {
        get: {
          tags: ["Guidance"],
          summary: "Listar orientações, opcionalmente filtradas por processo ou alvo",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "process_id",
              in: "query",
              required: false,
              schema: { type: "string", format: "uuid", nullable: true },
            },
            {
              name: "target_type",
              in: "query",
              required: false,
              schema: { type: "string", enum: [...REGULARIZE_GUIDANCE_TARGET_TYPES] },
            },
          ],
          responses: {
            "200": { description: "Lista de orientações", ...guidanceSuccessEnvelopeContent(true) },
            ...guidanceErrorResponses(),
          },
        },
      },
      "/regularize/guidance/activity/add": {
        post: {
          tags: ["Guidance"],
          summary: "Adicionar atividade econômica (compatibilidade legada)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Atividade adicionada", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/guidance/activity/remove": {
        post: {
          tags: ["Guidance"],
          summary: "Remover atividade econômica (compatibilidade legada)",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Atividade removida", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/activity": {
        put: {
          tags: ["Guidance"],
          summary: "Atualizar atividade econômica da orientação",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["guidance_id", "activity"],
                  properties: {
                    guidance_id: { type: "string", format: "uuid" },
                    activity: guidanceEconomicActivityResponseOpenApiSchema,
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Atividade atualizada", ...successEnvelopeContent() },
            ...guidanceErrorResponses(),
          },
        },
      },
      "/regularize/guidance/partner/add": {
        post: {
          tags: ["Guidance"],
          summary: "Adicionar sócio na orientação (compatibilidade legada)",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Socio adicionado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/partner/remove": {
        post: {
          tags: ["Guidance"],
          summary: "Remover sócio da orientação (compatibilidade legada)",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Socio removido", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/partner": {
        put: {
          tags: ["Guidance"],
          summary: "Atualizar sócio da orientação",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["guidance_id", "partner"],
                  properties: {
                    guidance_id: { type: "string", format: "uuid" },
                    partner: guidancePartnerResponseOpenApiSchema,
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Socio atualizado", ...successEnvelopeContent() },
            ...guidanceErrorResponses(),
          },
        },
      },
      "/regularize/license": {
        get: {
          tags: ["Licenses"],
          summary: "Detalhar licenca",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Detalhe da licenca", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Licenses"],
          summary: "Criar licenca",
          security: [{ bearerAuth: [] }],
          ...statusRequestBody(CANONICAL_LICENSE_STATUSES, ["status"]),
          responses: {
            "201": { description: "Licenca criada", ...successEnvelopeContent() },
            ...protectedErrorResponses(),
          },
        },
        put: {
          tags: ["Licenses"],
          summary: "Atualizar licenca",
          security: [{ bearerAuth: [] }],
          ...statusRequestBody(
            [...CANONICAL_LICENSE_STATUSES, ...LEGACY_LICENSE_STATUS_ALIASES],
            ["id", "status"],
            "Estado canonico; aliases legados sao aceitos para preservar registros existentes.",
          ),
          responses: {
            "200": { description: "Licenca atualizada", ...successEnvelopeContent() },
            ...protectedErrorResponses(),
          },
        },
      },
      "/regularize/license/{id}/protocol": {
        post: {
          tags: ["Licenses"],
          summary: "Cadastrar ou substituir o protocolo privado vigente",
          description:
            "Aceita um único PDF, JPG, PNG ou WebP de até 10 MB. O storage deve ser privado e o caminho interno nunca é retornado.",
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
                  additionalProperties: false,
                  required: ["file"],
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "PDF, JPG, PNG ou WebP com no máximo 10 MB.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Protocolo vigente substituído", ...successEnvelopeContent() },
            ...protectedErrorResponses(),
            "404": { description: "Licença não encontrada" },
            "413": { description: "Arquivo do protocolo excede 10 MB" },
          },
        },
        get: {
          tags: ["Licenses"],
          summary: "Gerar acesso temporário ao protocolo vigente",
          description: "Retorna URL assinada válida por 300 segundos, sem expor o caminho interno.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "URL assinada temporária", ...successEnvelopeContent() },
            ...protectedErrorResponses(),
            "404": { description: "Licença ou protocolo não encontrado" },
          },
        },
      },
      "/regularize/licenses": {
        get: {
          tags: ["Licenses"],
          summary: "Listar licencas",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "status",
              in: "query",
              required: true,
              description:
                "Use Todos para listar todos os status. A vencer e Vencido são derivados de due_date; aliases legados permanecem disponíveis para leitura.",
              schema: {
                type: "string",
                enum: [
                  "Todos",
                  ...CANONICAL_LICENSE_STATUSES,
                  ...LEGACY_LICENSE_STATUS_ALIASES,
                  "A vencer",
                  "Vencido",
                ],
              },
            },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Lista completa ou pagina de licencas",
              ...dualListSuccessEnvelopeContent(),
            },
          },
        },
      },
      "/internal/reconciliation/run": {
        post: {
          tags: ["Internal"],
          summary: "Executar reconciliacao interna do regularize",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Reconciliacao executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/internal/reporting/catalog": {
        get: {
          tags: ["Internal"],
          summary: "Obter catálogo interno de relatórios do Regularize",
          security: [{ internalToken: [] }],
          parameters: [
            {
              name: "x-request-id",
              in: "header",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            { name: "x-reports-grant", in: "header", required: true, schema: { type: "string" } },
            {
              name: "x-reports-grant-signature",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Catálogo seguro", ...successEnvelopeContent() },
            "403": { description: "Token ou grant inválido" },
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          tags: ["Internal"],
          summary:
            "Extrair licenças, processos, tributos municipais, carteira e grupos para o reports-service",
          security: [{ internalToken: [] }],
          parameters: [
            {
              name: "x-request-id",
              in: "header",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
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
                      enum: [
                        "regularize.licenses",
                        "regularize.processes",
                        "regularize.municipal_taxes",
                        "regularize.clients",
                        "regularize.client_groups",
                      ],
                    },
                    fields: {
                      type: "array",
                      minItems: 1,
                      maxItems: 25,
                      items: { type: "string" },
                    },
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
              description: "Linhas projetadas e limite de origem",
              ...successEnvelopeContent(),
            },
            "400": { description: "Entrada inválida" },
            "403": { description: "Token, grant ou campo inválido" },
          },
        },
      },
      "/internal/reconciliation/license-notifications/run": {
        post: {
          tags: ["Internal"],
          summary: "Executar reconciliacao de notificacoes de licencas",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Reconciliacao de licencas executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/internal/reconciliation/client-pf-status/run": {
        post: {
          tags: ["Internal"],
          summary: "Executar reconciliacao de status de cliente PF",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Reconciliacao de status executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/internal/reconciliation/client-pf-documents/run": {
        post: {
          tags: ["Internal"],
          summary: "Executar reconciliacao de documentos vencidos de cliente PF",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Reconciliacao de documentos executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
    },
  };
}
