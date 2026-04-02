import type { OpenApiDocument } from "@workspace/shared/http";

import type { UserServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

export function buildUserServiceOpenApiSpec(env: UserServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "user-service",
      version: "1.0.0",
      description:
        "Autenticação, usuários e permissões. Rotas autenticadas costumam receber JWT via gateway; /me usa o header x-auth-user-id encaminhado.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Auth", description: "Sessão e configuração inicial" },
      { name: "Users", description: "Usuários" },
      { name: "Permission", description: "Permissões por usuário" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        forwardedAuthUserId: {
          type: "apiKey",
          in: "header",
          name: "x-auth-user-id",
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
            "200": { description: "Serviço disponível", ...successJson },
          },
        },
      },
      "/session": {
        post: {
          tags: ["Auth"],
          summary: "Login (criar sessão)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["login", "password"],
                  properties: {
                    login: { type: "string" },
                    password: { type: "string" },
                  },
                  example: {
                    login: "admin@castelo.com",
                    password: "strong-password",
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Sessão", ...successJson },
          },
        },
      },
      "/start-config": {
        post: {
          tags: ["Auth"],
          summary: "Primeira configuração (bootstrap)",
          responses: {
            "200": { description: "Usuário inicial", ...successJson },
          },
        },
      },
      "/me": {
        get: {
          tags: ["Auth"],
          summary: "Usuário autenticado (via header encaminhado)",
          security: [{ forwardedAuthUserId: [] }],
          responses: {
            "200": { description: "Dados do usuário", ...successJson },
          },
        },
      },
      "/users": {
        get: {
          tags: ["Users"],
          summary: "Listar usuários",
          parameters: [
            { name: "skip", in: "query", schema: { type: "integer" } },
            { name: "take", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
        post: {
          tags: ["Users"],
          summary: "Criar usuário",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  example: {
                    name: "Joao Silva",
                    login: "joao.silva@castelo.com",
                    password: "temporary-password",
                    permission: 2,
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Criado", ...successJson },
          },
        },
      },
      "/users/{id}": {
        get: {
          tags: ["Users"],
          summary: "Buscar usuário por ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Usuário", ...successJson },
          },
        },
        patch: {
          tags: ["Users"],
          summary: "Atualizar usuário",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                  example: {
                    name: "Joao Silva Atualizado",
                    permission: 3,
                    active: true,
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Atualizado", ...successJson },
          },
        },
        delete: {
          tags: ["Users"],
          summary: "Desativar usuário",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Desativado", ...successJson },
          },
        },
      },
      "/users/{id}/photo": {
        post: {
          tags: ["Users"],
          summary: "Upload de foto do usuário",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                  },
                  required: ["file"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Foto atualizada", ...successJson },
          },
        },
        delete: {
          tags: ["Users"],
          summary: "Remover foto do usuário",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Foto removida", ...successJson },
          },
        },
      },
      "/permission/{userId}": {
        get: {
          tags: ["Permission"],
          summary: "Buscar permissões do usuário",
          parameters: [
            { name: "userId", in: "path", required: true, schema: { type: "string" } },
            { name: "modulo", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Permissões", ...successJson },
          },
        },
        put: {
          tags: ["Permission"],
          summary: "Atualizar módulos de permissão",
          parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: { type: "integer", nullable: true },
                  example: {
                    administracao: 2,
                    integracao: 3,
                    rh: 1,
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Atualizado", ...successJson },
          },
        },
      },
    },
  };
}
