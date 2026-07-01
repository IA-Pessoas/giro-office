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

const mutationResponses = {
  "200": { description: "OK", ...successJson },
  "201": { description: "Created", ...successJson },
  "400": { description: "Bad request", ...errorJson },
  "401": { description: "Unauthorized", ...errorJson },
  "404": { description: "Not found", ...errorJson },
  "409": { description: "Conflict", ...errorJson },
} as const;

const readResponses = {
  "200": { description: "OK", ...successJson },
  "400": { description: "Bad request", ...errorJson },
  "401": { description: "Unauthorized", ...errorJson },
  "404": { description: "Not found", ...errorJson },
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
    description: "Detalhe de senha com campos secretos descriptografados",
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
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
          responses: mutationResponses,
        },
      },
      "/pessoal/ldd/{id}": {
        patch: {
          tags: ["Pessoal LDD"],
          security: bearerSecurity,
          summary: "Atualizar LDD",
          operationId: "updatePessoalLdd",
          parameters: [idParam("id")],
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
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
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
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
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
          responses: mutationResponses,
        },
      },
      "/pessoal/unions": {
        get: {
          tags: ["Pessoal Unions"],
          security: bearerSecurity,
          summary: "Listar sindicatos",
          operationId: "listPessoalUnions",
          responses: readResponses,
        },
        post: {
          tags: ["Pessoal Unions"],
          security: bearerSecurity,
          summary: "Criar sindicato",
          operationId: "createPessoalUnion",
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
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
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
          responses: mutationResponses,
        },
      },
      "/pessoal/payroll": {
        post: {
          tags: ["Pessoal Payroll"],
          security: bearerSecurity,
          summary: "Criar configuracao de folha",
          operationId: "createPessoalPayroll",
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
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
          responses: readResponses,
        },
        patch: {
          tags: ["Pessoal Payroll"],
          security: bearerSecurity,
          summary: "Atualizar configuracao de folha",
          operationId: "updatePessoalPayroll",
          parameters: [idParam("client_id")],
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
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
          responses: readResponses,
        },
        post: {
          tags: ["Pessoal Obligations"],
          security: bearerSecurity,
          summary: "Criar obrigacao idempotente",
          operationId: "createPessoalObligation",
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
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
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
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
          requestBody: jsonRequestBody({
            type: "object",
            required: ["client_id", "service_name"],
            properties: {
              client_id: { type: "string", format: "uuid" },
              service_name: { type: "string" },
              login_main: { type: "string", nullable: true },
              senha_main: { type: "string", nullable: true },
              login_secondary: { type: "string", nullable: true },
              senha_secondary: { type: "string", nullable: true },
              responsavel_id: { type: "string", format: "uuid", nullable: true },
              notes: { type: "string", nullable: true },
            },
          }),
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
          requestBody: jsonRequestBody({ type: "object", additionalProperties: true }),
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
    },
  };
}
