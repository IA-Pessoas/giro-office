import type { OpenApiDocument } from "@workspace/shared/http";

import type { UserServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;
const bearer = [{ bearerAuth: [] }] as const;

export function buildUserServiceOpenApiSpec(env: UserServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "user-service",
      version: "1.0.0",
      description:
        "Autenticação, usuários e permissões. Rotas autenticadas aceitam Bearer JWT (mesmo segredo que o gateway) ou, em chamadas internas, o token de serviço (`x-internal-service-token` igual a AUDIT_SERVICE_TOKEN) com `x-auth-user-id` e `x-auth-organization-id`, como o gateway encaminha.",
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
      "/user/session": {
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
      "/user/start-config": {
        post: {
          tags: ["Auth"],
          summary: "Primeira configuração (bootstrap)",
          responses: {
            "200": { description: "Usuário inicial", ...successJson },
          },
        },
      },
      "/user/me": {
        get: {
          tags: ["Auth"],
          summary: "Usuário autenticado (JWT ou contexto encaminhado pelo gateway)",
          security: bearer,
          responses: {
            "200": { description: "Dados do usuário", ...successJson },
          },
        },
      },
      "/user": {
        get: {
          tags: ["Users"],
          summary: "Listar usuários",
          security: bearer,
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
          security: bearer,
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    login: { type: "string" },
                    password: { type: "string" },
                    department_id: { type: "string" },
                    permission: { type: "integer" },
                    status: { type: "string" },
                    photo_url: { type: "string" },
                    invited_by: { type: "string" },
                    organization_id: { type: "string" },
                    type: { type: "string" },
                    first_owner_flag: { type: "boolean" },
                    modules: {
                      type: "object",
                      additionalProperties: { type: ["integer", "null"] },
                    },
                  },
                  required: ["name", "login", "password", "department_id", "permission"],
                  additionalProperties: true,
                  example: {
                    name: "Joao Silva",
                    login: "joao.silva@castelo.com",
                    password: "temporary-password",
                    department_id: "department-uuid",
                    permission: 2,
                    status: "active",
                    photo_url: "https://cdn.castelo.com/users/joao.png",
                    invited_by: "admin-user-uuid",
                    organization_id: "organization-uuid",
                    type: "owner",
                    first_owner_flag: true,
                    modules: {
                      administracao: 2,
                      integracao: 3,
                      rh: 1,
                    },
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
      "/user/{id}": {
        get: {
          tags: ["Users"],
          summary: "Buscar usuário por ID",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Usuário", ...successJson },
          },
        },
        patch: {
          tags: ["Users"],
          summary: "Atualizar usuário",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    login: { type: "string" },
                    password: { type: "string" },
                    department_id: { type: "string" },
                    permission: { type: "integer" },
                    status: { type: "string" },
                    photo_url: { type: "string" },
                    organization_id: { type: "string" },
                    type: { type: "string" },
                    first_owner_flag: { type: "boolean" },
                    modules: {
                      type: "object",
                      additionalProperties: { type: ["integer", "null"] },
                    },
                  },
                  additionalProperties: true,
                  example: {
                    name: "Joao Silva Atualizado",
                    login: "joao.silva@castelo.com",
                    password: "new-password",
                    department_id: "department-uuid",
                    permission: 3,
                    status: "inactive",
                    photo_url: "https://cdn.castelo.com/users/joao-atualizado.png",
                    organization_id: "organization-uuid",
                    type: "user",
                    first_owner_flag: false,
                    modules: {
                      administracao: 1,
                      integracao: 2,
                      rh: null,
                    },
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
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Desativado", ...successJson },
          },
        },
      },
      "/user/{id}/photo": {
        get: {
          tags: ["Users"],
          summary: "Obter foto do usuário (binário ou redirecionamento)",
          description:
            "Com armazenamento local devolve o ficheiro da imagem. Com URL pública (ex.: Supabase) responde 302 para essa URL.",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Corpo binário da imagem (armazenamento local)",
              content: {
                "image/png": { schema: { type: "string", format: "binary" } },
                "image/jpeg": { schema: { type: "string", format: "binary" } },
                "image/webp": { schema: { type: "string", format: "binary" } },
                "image/gif": { schema: { type: "string", format: "binary" } },
                "application/octet-stream": { schema: { type: "string", format: "binary" } },
              },
            },
            "302": {
              description: "Redireciona para a URL pública da foto",
              headers: {
                Location: {
                  schema: { type: "string" },
                  description: "URL da imagem",
                },
              },
            },
            "404": { description: "Usuário ou foto não encontrados" },
          },
        },
        post: {
          tags: ["Users"],
          summary: "Upload de foto do usuário",
          security: bearer,
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
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Foto removida", ...successJson },
          },
        },
      },
      "/user/permission/{userId}": {
        get: {
          tags: ["Permission"],
          summary: "Buscar permissões do usuário",
          security: bearer,
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
          security: bearer,
          parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    administracao: { type: ["integer", "null"] },
                    integracao: { type: ["integer", "null"] },
                    rh: { type: ["integer", "null"] },
                  },
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
