import type { OpenApiDocument } from "@workspace/shared/http";

import type { DepartmentServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

const bearer: Array<Record<string, string[]>> = [{ bearerAuth: [] }];

function createObjectRequestBody(options: {
  example: Record<string, unknown>;
  properties: Record<string, unknown>;
  required?: string[];
}) {
  const { example, properties, required } = options;

  return {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties,
            ...(required ? { required } : {}),
            example,
          },
        },
      },
    },
  } as const;
}

const createDepartmentRequestBody = createObjectRequestBody({
  example: {
    name: "Tecnologia",
    color: "#0F766E",
    solution: true,
  },
  required: ["name", "color"],
  properties: {
    name: { type: "string" },
    color: { type: "string" },
    solution: { type: "boolean" },
  },
});

const updateDepartmentRequestBody = createObjectRequestBody({
  example: {
    dep_id: "department-uuid",
    name: "Tecnologia e Produto",
    color: "#1D4ED8",
    status: "Ativo",
    solution: true,
  },
  required: ["dep_id"],
  properties: {
    dep_id: { type: "string" },
    name: { type: "string" },
    color: { type: "string" },
    status: { type: "string", enum: ["Ativo", "Inativo"] },
    solution: { type: "boolean" },
  },
});

export function buildDepartmentServiceOpenApiSpec(env: DepartmentServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "department-service",
      version: "1.0.0",
      description: "Gestão de departamentos. Endpoints marcados exigem JWT.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Departments", description: "CRUD de departamentos" },
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
            "200": { description: "OK", ...successJson },
          },
        },
      },
      "/department/list": {
        get: {
          tags: ["Departments"],
          summary: "Listar departamentos",
          security: bearer,
          parameters: [
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["Todos", "Ativo", "Inativo"] },
            },
            {
              name: "administrative",
              in: "query",
              description: "Use true para consultar a lista na área administrativa.",
              schema: { type: "string", enum: ["true"] },
            },
            {
              name: "administrative",
              in: "query",
              description: "Use true para a consulta administrativa de departamentos.",
              schema: { type: "string", enum: ["true"] },
            },
          ],
          responses: { "200": { description: "Lista", ...successJson } },
        },
      },
      "/department": {
        get: {
          tags: ["Departments"],
          summary: "Detalhar departamento",
          security: bearer,
          parameters: [
            {
              name: "dep_id",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Detalhe", ...successJson } },
        },
        post: {
          tags: ["Departments"],
          summary: "Criar departamento",
          security: bearer,
          ...createDepartmentRequestBody,
          responses: { "201": { description: "Criado", ...successJson } },
        },
        put: {
          tags: ["Departments"],
          summary: "Atualizar departamento",
          security: bearer,
          ...updateDepartmentRequestBody,
          responses: { "200": { description: "Atualizado", ...successJson } },
        },
      },
    },
  };
}
