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
          description: "Resposta de sucesso padrao do workspace",
          additionalProperties: true,
        },
        ErrorEnvelope: {
          type: "object",
          description: "Resposta de erro padrao do workspace",
          additionalProperties: true,
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
    },
  };
}
