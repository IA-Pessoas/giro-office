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
