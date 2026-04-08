import type { OpenApiDocument } from "@workspace/shared/http";

import type { RegularizeServiceEnv } from "../config/env.js";

function successEnvelopeContent() {
  return {
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/SuccessEnvelope" },
      },
    },
  };
}

export function buildRegularizeServiceOpenApiSpec(env: RegularizeServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "regularize-service",
      version: "1.0.0",
      description: "API do modulo regularize, com rotas autenticadas e endpoints internos.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saude do servico" },
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
      "/regularize/passwords": {
        get: {
          tags: ["Passwords"],
          summary: "Listar senhas por cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "client_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
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
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Detalhe da senha", ...successEnvelopeContent() } },
        },
      },
      "/regularize/sites-pass": {
        get: {
          tags: ["Sites"],
          summary: "Listar sites base",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "status", in: "query", required: true, schema: { type: "boolean" } },
          ],
          responses: { "200": { description: "Lista de sites", ...successEnvelopeContent() } },
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
          summary: "Detalhar site base",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Detalhe do site", ...successEnvelopeContent() } },
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
          responses: { "200": { description: "Detalhe do cliente PF", ...successEnvelopeContent() } },
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
          responses: { "200": { description: "Cliente PF atualizado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/pfs": {
        get: {
          tags: ["PF"],
          summary: "Listar clientes PF",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "status", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Lista de clientes PF", ...successEnvelopeContent() } },
        },
      },
      "/regularize/partners": {
        get: {
          tags: ["Partners"],
          summary: "Listar socios",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "type", in: "query", required: true, schema: { type: "string", enum: ["pf", "pj"] } },
            { name: "client_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
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
      "/regularize/partner": {
        get: {
          tags: ["Partners"],
          summary: "Detalhar socio",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Detalhe do socio", ...successEnvelopeContent() } },
        },
      },
      "/regularize/municipal-taxes": {
        get: {
          tags: ["MunicipalTaxes"],
          summary: "Listar tributos municipais por ano",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "year", in: "query", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Lista de tributos municipais", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["MunicipalTaxes"],
          summary: "Criar tributo municipal",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Tributo municipal criado", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["MunicipalTaxes"],
          summary: "Atualizar tributo municipal",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Tributo municipal atualizado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/municipal-taxes-detail": {
        get: {
          tags: ["MunicipalTaxes"],
          summary: "Detalhar tributo municipal",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Detalhe do tributo municipal", ...successEnvelopeContent() } },
        },
      },
      "/regularize/process": {
        get: {
          tags: ["Processes"],
          summary: "Detalhar processo",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Detalhe do processo", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Processes"],
          summary: "Criar processo",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Processo criado", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Processes"],
          summary: "Atualizar processo",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Processo atualizado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/processes": {
        get: {
          tags: ["Processes"],
          summary: "Listar processos",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "status", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Lista de processos", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance": {
        post: {
          tags: ["Guidance"],
          summary: "Criar orientacao procedural",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Orientacao criada", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Guidance"],
          summary: "Atualizar orientacao procedural",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Orientacao atualizada", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/detail": {
        get: {
          tags: ["Guidance"],
          summary: "Detalhar orientacao procedural",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Detalhe da orientacao", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/list": {
        get: {
          tags: ["Guidance"],
          summary: "Listar orientacoes por processo",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "process_id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Lista de orientacoes", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/activity/add": {
        post: {
          tags: ["Guidance"],
          summary: "Adicionar atividade economica",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Atividade adicionada", ...successEnvelopeContent() } },
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
          parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Detalhe da licenca", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Licenses"],
          summary: "Criar licenca",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Licenca criada", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Licenses"],
          summary: "Atualizar licenca",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Licenca atualizada", ...successEnvelopeContent() } },
        },
      },
      "/regularize/licenses": {
        get: {
          tags: ["Licenses"],
          summary: "Listar licencas",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "status", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Lista de licencas", ...successEnvelopeContent() } },
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
    },
  };
}
