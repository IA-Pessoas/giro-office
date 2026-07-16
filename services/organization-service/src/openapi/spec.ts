import type { OpenApiDocument } from "@workspace/shared/http";

import type { OrganizationEnv } from "../config/env.js";

export function buildOrganizationServiceOpenApiSpec(env: OrganizationEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;
  const createOrganizationExample = {
    name: "Castelo Tecnologia",
    email_created_by: "admin@castelo.com",
    cnpj: "12345678000190",
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
      { name: "Platform", description: "Gestao global de organizacoes pela plataforma" },
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
                    cnpj: { type: "string" },
                  },
                  required: ["name", "email_created_by", "cnpj"],
                  additionalProperties: true,
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
      "/platform/organizations": {
        get: {
          tags: ["Platform"],
          summary: "Listar organizacoes via plataforma",
          description: "Uso interno via gateway para super admin de plataforma.",
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
          tags: ["Platform"],
          summary: "Criar organizacao via plataforma",
          description: "Uso interno via gateway para super admin de plataforma.",
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
                    cnpj: { type: "string" },
                  },
                  required: ["name", "email_created_by", "cnpj"],
                  additionalProperties: true,
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
          },
        },
      },
      "/platform/organizations/{id}": {
        get: {
          tags: ["Platform"],
          summary: "Buscar organizacao via plataforma",
          description: "Uso interno via gateway para super admin de plataforma.",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Organizacao",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        patch: {
          tags: ["Platform"],
          summary: "Atualizar organizacao via plataforma",
          description: "Atualiza status, plano de assinatura e/ou URL de logo.",
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
                    subscription_plan: { type: "string" },
                    logo_url: { type: ["string", "null"] },
                  },
                  additionalProperties: true,
                  example: {
                    status: "active",
                    subscription_plan: "enterprise",
                    logo_url: "https://cdn.castelo.com/logos/organization.png",
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Atualizada",
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
