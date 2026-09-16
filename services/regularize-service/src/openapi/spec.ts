import { reportingQueryOpenApiSchema } from "@workspace/shared";

import {
  CANONICAL_GUIDANCE_STATUSES,
  CANONICAL_LICENSE_STATUSES,
  CANONICAL_PROCESS_STATUSES,
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
              status: { type: "string", enum: [...CANONICAL_PROCESS_STATUSES] },
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
          responses: { "200": { description: "Detalhe do processo", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Processes"],
          summary: "Criar processo",
          security: [{ bearerAuth: [] }],
          ...processRequestBody(["cpf_cnpj", "process_type", "description", "status"]),
          responses: {
            "201": { description: "Processo criado", ...successEnvelopeContent() },
            ...protectedErrorResponses(),
          },
        },
        put: {
          tags: ["Processes"],
          summary: "Atualizar processo",
          security: [{ bearerAuth: [] }],
          ...processRequestBody(["id", "cpf_cnpj", "process_type", "description", "status"]),
          responses: {
            "200": { description: "Processo atualizado", ...successEnvelopeContent() },
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
          summary: "Criar orientacao procedural",
          security: [{ bearerAuth: [] }],
          ...statusRequestBody(CANONICAL_GUIDANCE_STATUSES, ["status"]),
          responses: {
            "201": { description: "Orientacao criada", ...successEnvelopeContent() },
            ...protectedErrorResponses(),
          },
        },
        put: {
          tags: ["Guidance"],
          summary: "Atualizar orientacao procedural",
          security: [{ bearerAuth: [] }],
          ...statusRequestBody(CANONICAL_GUIDANCE_STATUSES, ["id"]),
          responses: {
            "200": { description: "Orientacao atualizada", ...successEnvelopeContent() },
            ...protectedErrorResponses(),
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
            "200": { description: "Detalhe da orientacao", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/guidance/list": {
        get: {
          tags: ["Guidance"],
          summary: "Listar orientacoes por processo",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "process_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Lista de orientacoes", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/guidance/activity/add": {
        post: {
          tags: ["Guidance"],
          summary: "Adicionar atividade economica",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Atividade adicionada", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/guidance/activity/remove": {
        post: {
          tags: ["Guidance"],
          summary: "Remover atividade economica",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Atividade removida", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/partner/add": {
        post: {
          tags: ["Guidance"],
          summary: "Adicionar socio na orientacao",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Socio adicionado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/partner/remove": {
        post: {
          tags: ["Guidance"],
          summary: "Remover socio da orientacao",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Socio removido", ...successEnvelopeContent() } },
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
          summary: "Extrair licenças, processos e tributos municipais para o reports-service",
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
                      ],
                    },
                    fields: {
                      type: "array",
                      minItems: 1,
                      maxItems: 25,
                      items: { type: "string" },
                    },
                    limit: { type: "integer", minimum: 1, maximum: 101 },
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
