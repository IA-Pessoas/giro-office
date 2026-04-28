import type { OpenApiDocument } from "@workspace/shared/http";

import type { ContabilServiceEnv } from "../config/env.js";

export function buildContabilServiceOpenApiSpec(env: ContabilServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  const createControlExample = {
    client_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    competence: "2026-01",
  };

  const patchControlExample = {
    field: "notes",
    value: "Observação do fechamento.",
  };

  const createResponsibleExample = {
    client_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    person_responsible_id: "7b9e3f1a-2c4d-5e6f-7890-abcdef123456",
    posted_by_id: "8c0f4a2b-3d5e-6f70-8901-bcdef1234567",
    customer_with_movement: true,
  };

  const updateResponsibleExample = {
    customer_with_movement: false,
  };

  const createRelationshipExample = {
    client_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    bidding: true,
    chart_accounts: "Plano referencial",
    tool: "Domínio",
    system: "ERP X",
    note: "Cliente em implantação.",
  };

  const updateRelationshipExample = {
    note: "Atualizado após reunião.",
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "contabil-service",
      version: "1.0.0",
      description:
        "API contábil: controles operacionais por cliente e competência, responsáveis e relacionamento contábil. Endpoints autenticados exigem JWT válido.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Controls", description: "Checklist operacional por cliente e competência" },
      { name: "Responsibles", description: "Responsáveis contábeis por cliente" },
      { name: "Relationships", description: "Relacionamento contábil do cliente" },
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
      "/contabil/controls": {
        post: {
          tags: ["Controls"],
          summary: "Criar ou obter controle contábil",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", minLength: 1 },
                  },
                  example: createControlExample,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Controle já existente (retorno idempotente)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
            "201": {
              description: "Controle criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
        get: {
          tags: ["Controls"],
          summary: "Detalhe do controle por cliente e competência",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "competence",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": {
              description: "Controle encontrado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/controls/{id}": {
        patch: {
          tags: ["Controls"],
          summary: "Atualizar um campo do controle",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["field", "value"],
                  additionalProperties: false,
                  properties: {
                    field: { type: "string" },
                    value: {
                      oneOf: [{ type: "boolean" }, { type: "string" }],
                    },
                  },
                  example: patchControlExample,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Campo atualizado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/responsibles": {
        post: {
          tags: ["Responsibles"],
          summary: "Cadastrar responsável contábil",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    person_responsible_id: { type: "string", format: "uuid" },
                    posted_by_id: { type: "string", format: "uuid" },
                    customer_with_movement: { type: "boolean" },
                  },
                  example: createResponsibleExample,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/responsibles/{id}": {
        put: {
          tags: ["Responsibles"],
          summary: "Atualizar responsável contábil",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    person_responsible_id: { type: "string", format: "uuid", nullable: true },
                    posted_by_id: { type: "string", format: "uuid", nullable: true },
                    customer_with_movement: { type: "boolean" },
                  },
                  example: updateResponsibleExample,
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
        delete: {
          tags: ["Responsibles"],
          summary: "Remover responsável contábil",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Removido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/responsibles/client/{clientId}": {
        get: {
          tags: ["Responsibles"],
          summary: "Obter responsável por cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "clientId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Registro encontrado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/relationships": {
        post: {
          tags: ["Relationships"],
          summary: "Cadastrar relacionamento contábil",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "bidding", "chart_accounts", "tool", "system", "note"],
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    bidding: { type: "boolean" },
                    chart_accounts: { type: "string" },
                    tool: { type: "string" },
                    system: { type: "string" },
                    note: { type: "string" },
                  },
                  example: createRelationshipExample,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Criado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/relationships/{id}": {
        put: {
          tags: ["Relationships"],
          summary: "Atualizar relacionamento contábil",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    bidding: { type: "boolean" },
                    chart_accounts: { type: "string" },
                    tool: { type: "string" },
                    system: { type: "string" },
                    note: { type: "string" },
                  },
                  example: updateRelationshipExample,
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
        delete: {
          tags: ["Relationships"],
          summary: "Remover relacionamento contábil",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Removido",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SuccessEnvelope" },
                },
              },
            },
          },
        },
      },
      "/contabil/relationships/client/{clientId}": {
        get: {
          tags: ["Relationships"],
          summary: "Obter relacionamento por cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "clientId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Registro encontrado",
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
