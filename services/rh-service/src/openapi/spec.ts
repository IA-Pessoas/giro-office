import type { OpenApiDocument } from "@workspace/shared/http";

import type { RhEnv } from "../config/env.js";

export function buildRhServiceOpenApiSpec(env: RhEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "rh-service",
      version: "1.0.0",
      description: "RH — configuração de ponto e rotas sob o prefixo /rh.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Ponto", description: "Configuração de jornada" },
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
          description: "Resposta de sucesso padrão do workspace",
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
              description: "Serviço disponível",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/rh/point-config": {
        put: {
          tags: ["Ponto"],
          summary: "Criar ou atualizar configuração de ponto",
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  example: {
                    target_user_id: "user-uuid",
                    start_time: "08:00",
                    lunch_break: "12:00",
                    lunch_return: "13:00",
                    end_time: "17:30",
                    work_days: "1,2,3,4,5",
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Configuração salva",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        get: {
          tags: ["Ponto"],
          summary: "Obter configuração de ponto do usuário autenticado",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Configuração",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/rh/point-config/{userId}": {
        get: {
          tags: ["Ponto"],
          summary: "Obter configuração de ponto por usuário",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Configuração",
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
