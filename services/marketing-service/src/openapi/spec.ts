import type { MarketingServiceEnv } from "../config/env.js";

export function buildMarketingServiceOpenApiSpec(env: MarketingServiceEnv) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Marketing Service API",
      version: "1.0.0",
      description: "Leitura do dashboard inicial de Marketing.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    paths: {
      "/marketing/dashboard": {
        get: {
          summary: "Consultar dashboard inicial de Marketing",
          description:
            "Retorna contagens de solicitações existentes e aniversários da organização autenticada.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Resumo do dashboard.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { type: "object" },
                    },
                    required: ["success", "data"],
                  },
                },
              },
            },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão Marketing insuficiente." },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  };
}
