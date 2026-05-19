import type { OpenApiDocument } from "@workspace/shared/http";

import type { TiServiceEnv } from "../config/env.js";

export function buildTiServiceOpenApiSpec(env?: Pick<TiServiceEnv, "port">): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "ti-service",
      version: "1.0.0",
      description: "Servico de Tecnologia da Informacao.",
    },
    servers: [{ url: `http://localhost:${env?.port ?? 3040}` }],
    tags: [{ name: "Health", description: "Saude do servico" }],
    components: {
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
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness",
          responses: {
            "200": {
              description: "Servico pronto",
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
