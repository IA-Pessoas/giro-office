import type { OpenApiDocument } from "@workspace/shared/http";

import type { OrganizationEnv } from "../config/env.js";

export function buildOrganizationServiceOpenApiSpec(env: OrganizationEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;
  const createOrganizationExample = {
    name: "Castelo Tecnologia",
    email_created_by: "admin@castelo.com",
    cnpj: "11222333000181",
  };
  const cnpjSchema = {
    description:
      "CNPJ com dígitos verificadores válidos, em 14 dígitos ou máscara oficial. Persistido sem máscara; duplicidade considera ambas as grafias.",
    oneOf: [
      { type: "string", pattern: "^[0-9]{14}$", example: "11222333000181" },
      {
        type: "string",
        pattern: "^[0-9]{2}\\.[0-9]{3}\\.[0-9]{3}/[0-9]{4}-[0-9]{2}$",
        example: "11.222.333/0001-81",
      },
    ],
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "organization-service",
      version: "1.0.0",
      description: "Organizações. Endpoints autenticados usam JWT.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Organizações", description: "Listagem e gestão" },
      { name: "Platform", description: "Consultas globais da plataforma" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "cw.session",
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
      "/platform/organizations": {
        get: {
          tags: ["Platform"],
          summary: "Listar organizações pela plataforma",
          description:
            "Consulta somente leitura, restrita à sessão HTTP-only de um super administrador da plataforma. Não retorna credenciais ou e-mail do criador.",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "page",
              in: "query",
              description:
                "Página iniciada em 1. A combinação com pageSize não pode produzir offset superior a 10.000.",
              schema: { type: "integer", minimum: 1, maximum: 10_001, default: 1 },
            },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: ["trial", "past_due", "active", "suspended", "cancelled"],
              },
            },
            { name: "search", in: "query", schema: { type: "string", maxLength: 100 } },
          ],
          responses: {
            "200": {
              description: "Página de organizações",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "400": { description: "Parâmetros inválidos" },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Identidade não é um super administrador da plataforma" },
          },
        },
        post: {
          tags: ["Platform"],
          summary: "Criar organização pela plataforma",
          description:
            "Cria somente a organização com status active e plano trial. O e-mail do criador é derivado da sessão validada.",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "x-csrf-token",
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
                  properties: {
                    name: { type: "string" },
                    cnpj: cnpjSchema,
                  },
                  required: ["name", "cnpj"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "201": { description: "Organização criada" },
            "400": { description: "Body inválido" },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Acesso negado ou CSRF inválido" },
            "409": { description: "Slug ou CNPJ já existe" },
          },
        },
      },
      "/platform/organizations/{id}": {
        get: {
          tags: ["Platform"],
          summary: "Buscar organização pela plataforma",
          security: [{ cookieAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Organização sem campos privados" },
            "400": { description: "ID inválido" },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Acesso negado" },
            "404": { description: "Organização não encontrada" },
          },
        },
      },
      "/platform/organizations/{id}/status": {
        patch: {
          tags: ["Platform"],
          summary: "Atualizar status pela plataforma",
          security: [{ cookieAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "x-csrf-token",
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
                  properties: {
                    status: {
                      type: "string",
                      enum: ["trial", "past_due", "active", "suspended", "cancelled"],
                    },
                    expected_updated_at: { type: "string", format: "date-time" },
                  },
                  required: ["status", "expected_updated_at"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": { description: "Status atualizado" },
            "400": { description: "Parâmetros ou body inválidos" },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Acesso negado ou CSRF inválido" },
            "404": { description: "Organização não encontrada" },
            "409": { description: "Organização alterada por outra operação" },
          },
        },
      },
      "/platform/organizations/{id}/subscription-plan": {
        patch: {
          tags: ["Platform"],
          summary: "Atualizar plano pela plataforma",
          security: [{ cookieAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "x-csrf-token",
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
                  properties: {
                    subscription_plan: {
                      type: "string",
                      enum: ["trial", "pro", "enterprise"],
                    },
                    expected_updated_at: { type: "string", format: "date-time" },
                  },
                  required: ["subscription_plan", "expected_updated_at"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": { description: "Plano atualizado" },
            "400": { description: "Parâmetros ou body inválidos" },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Acesso negado ou CSRF inválido" },
            "404": { description: "Organização não encontrada" },
            "409": { description: "Organização alterada por outra operação" },
          },
        },
      },
      "/platform/organizations/{id}/logo-url": {
        patch: {
          tags: ["Platform"],
          summary: "Atualizar URL HTTPS do logo pela plataforma",
          security: [{ cookieAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "x-csrf-token",
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
                  properties: {
                    logo_url: {
                      type: "string",
                      format: "uri",
                      pattern: "^https://(?![^/?#]*@).+$",
                      maxLength: 2_048,
                      nullable: true,
                      description:
                        "URL HTTPS sem credenciais embutidas, ou null para remover a logo.",
                    },
                    expected_updated_at: { type: "string", format: "date-time" },
                  },
                  required: ["logo_url", "expected_updated_at"],
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": { description: "Logo atualizado" },
            "400": { description: "Parâmetros ou body inválidos" },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Acesso negado ou CSRF inválido" },
            "404": { description: "Organização não encontrada" },
            "409": { description: "Organização alterada por outra operação" },
          },
        },
      },
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
      "/organizations": {
        get: {
          tags: ["Organizações"],
          summary: "Listar organizações",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
            {
              name: "status",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Lista paginada",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Organizações"],
          summary: "Criar organização",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    email_created_by: { type: "string" },
                    cnpj: cnpjSchema,
                  },
                  required: ["name", "email_created_by", "cnpj"],
                  additionalProperties: false,
                  example: createOrganizationExample,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Criada",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "400": { description: "Body ou CNPJ inválido" },
            "409": { description: "Slug ou CNPJ já existe" },
          },
        },
      },
      "/organizations/{id}": {
        get: {
          tags: ["Organizações"],
          summary: "Buscar organização por ID",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Organização",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/organizations/{id}/status": {
        patch: {
          tags: ["Organizações"],
          summary: "Atualizar status",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                  },
                  required: ["status"],
                  additionalProperties: true,
                  example: { status: "inactive" },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/organizations/{id}/subscription-plan": {
        patch: {
          tags: ["Organizações"],
          summary: "Atualizar plano de assinatura",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    subscription_plan: { type: "string" },
                  },
                  required: ["subscription_plan"],
                  additionalProperties: true,
                  example: { subscription_plan: "enterprise" },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/organizations/{id}/logo-url": {
        patch: {
          tags: ["Organizações"],
          summary: "Atualizar URL do logo",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    logo_url: { type: ["string", "null"] },
                  },
                  required: ["logo_url"],
                  additionalProperties: true,
                  example: { logo_url: "https://cdn.castelo.com/logos/organization.png" },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Atualizado",
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
