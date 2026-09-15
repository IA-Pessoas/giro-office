import type { OpenApiDocument } from "@workspace/shared/http";

import type { CommercialServiceEnv } from "../config/env.js";

const successResponse = {
  description: "Resposta padronizada.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
} as const;

export function buildCommercialServiceOpenApiSpec(env: CommercialServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Commercial Service",
      version: "1.0.0",
      description: "Catálogo de propostas e prospecção do módulo Comercial.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [{ name: "Commercial", description: "Catálogo do módulo Comercial" }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          required: ["success", "data"],
          properties: { success: { type: "boolean" }, data: {} },
        },
        ProposalConfig: {
          type: "object",
          required: ["id", "name", "contract_value"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", minLength: 1, maxLength: 120 },
            contract_value: {
              type: "number",
              minimum: 0,
              description: "Valor base do contrato ou proposta em reais.",
            },
          },
        },
        ProposalConfigInput: {
          type: "object",
          additionalProperties: false,
          required: ["name", "contract_value"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            contract_value: {
              type: "number",
              minimum: 0,
              description: "Valor base do contrato ou proposta em reais.",
            },
          },
        },
        ProposalConfigPatch: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            contract_value: {
              type: "number",
              minimum: 0,
              description: "Valor base do contrato ou proposta em reais.",
            },
          },
        },
        ProspectingClient: {
          type: "object",
          required: ["id", "name"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            company_name: { type: "string", nullable: true },
            fantasy_name: { type: "string", nullable: true },
          },
        },
        Prospecting: {
          type: "object",
          required: ["id", "client_id", "status", "status_date", "description", "client"],
          properties: {
            id: { type: "string", format: "uuid" },
            client_id: { type: "string", format: "uuid" },
            status: {
              type: "string",
              enum: [
                "Análise Financeira",
                "Análise/Agendamento",
                "Envio de Proposta",
                "Paralisado",
                "Recusado pelo Cliente",
                "Fechado",
              ],
            },
            status_date: { type: "string", format: "date-time", nullable: true },
            description: { type: "string", nullable: true },
            client: { $ref: "#/components/schemas/ProspectingClient" },
          },
        },
        ProspectingInput: {
          type: "object",
          additionalProperties: false,
          required: ["client_id", "status"],
          properties: {
            client_id: { type: "string", format: "uuid" },
            status: { $ref: "#/components/schemas/Prospecting/properties/status" },
            status_date: { type: "string", format: "date-time", nullable: true },
            description: { type: "string", maxLength: 5000, nullable: true },
          },
        },
        ProspectingPatch: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            status: { $ref: "#/components/schemas/Prospecting/properties/status" },
            status_date: { type: "string", format: "date-time", nullable: true },
            description: { type: "string", maxLength: 5000, nullable: true },
          },
        },
        TaskBilling: {
          type: "object",
          required: [
            "id",
            "task_id",
            "task_name",
            "task_status",
            "billing",
            "hiring_status",
            "payment",
            "billing_description",
          ],
          properties: {
            id: { type: ["string", "null"], format: "uuid" },
            task_id: { type: "string", format: "uuid" },
            task_name: { type: "string" },
            task_status: { type: "string" },
            billing: { type: "string" },
            hiring_status: {
              type: ["string", "null"],
              enum: ["A Realizar", "Contratado", "Não Contratado", null],
            },
            payment: { type: ["string", "null"] },
            billing_description: { type: ["string", "null"] },
          },
        },
        TaskBillingInput: {
          type: "object",
          additionalProperties: false,
          required: ["hiring_status"],
          properties: {
            hiring_status: {
              type: "string",
              enum: ["A Realizar", "Contratado", "Não Contratado"],
            },
            payment: { type: ["string", "null"], maxLength: 255 },
            billing_description: { type: ["string", "null"], maxLength: 5000 },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          responses: { "200": successResponse },
        },
      },
      "/commercial/proposal-configs": {
        get: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          responses: { "200": successResponse, "401": { description: "Não autenticado." } },
        },
        post: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProposalConfigInput" } },
            },
          },
          responses: {
            "201": successResponse,
            "400": { description: "Payload inválido." },
            "409": { description: "Nome duplicado." },
          },
        },
      },
      "/commercial/proposal-configs/{id}": {
        get: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": successResponse, "404": { description: "Não encontrado." } },
        },
        patch: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProposalConfigPatch" } },
            },
          },
          responses: {
            "200": successResponse,
            "400": { description: "Payload inválido." },
            "404": { description: "Não encontrado." },
            "409": { description: "Nome duplicado." },
          },
        },
        delete: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": successResponse,
            "401": { description: "Não autenticado." },
            "404": { description: "Não encontrado." },
            "409": { description: "Configuração possui referências." },
          },
        },
      },
      "/commercial/prospecting/clients": {
        get: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          responses: { "200": successResponse, "401": { description: "Não autenticado." } },
        },
      },
      "/commercial/prospecting": {
        get: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          responses: { "200": successResponse, "401": { description: "Não autenticado." } },
        },
        post: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProspectingInput" } },
            },
          },
          responses: {
            "201": successResponse,
            "400": { description: "Payload inválido." },
            "404": { description: "Cliente não encontrado." },
            "409": { description: "Cliente já possui prospecção." },
          },
        },
      },
      "/commercial/prospecting/{id}": {
        get: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": successResponse, "404": { description: "Não encontrado." } },
        },
        patch: {
          tags: ["Commercial"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProspectingPatch" } },
            },
          },
          responses: {
            "200": successResponse,
            "400": { description: "Payload inválido." },
            "404": { description: "Não encontrado." },
            "409": { description: "Transição inválida." },
          },
        },
        delete: {
          tags: ["Commercial"],
          summary: "Arquivar prospecção comercial sem excluir histórico",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": successResponse,
            "401": { description: "Não autenticado." },
            "404": { description: "Não encontrado." },
          },
        },
      },
      "/commercial/outbox/status": {
        get: {
          tags: ["Commercial"],
          summary: "Consultar estado de entrega da outbox comercial",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": successResponse,
            "401": { description: "Não autenticado." },
          },
        },
      },
      "/commercial/task-billing": {
        get: {
          tags: ["Commercial"],
          summary: "Listar cobranças comerciais de tarefas",
          security: [{ bearerAuth: [] }],
          responses: { "200": successResponse, "401": { description: "Não autenticado." } },
        },
      },
      "/commercial/task-billing/{taskId}": {
        put: {
          tags: ["Commercial"],
          summary: "Atualizar cobrança comercial de tarefa",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/TaskBillingInput" } },
            },
          },
          responses: {
            "200": successResponse,
            "400": { description: "Payload inválido." },
            "404": { description: "Tarefa não encontrada." },
          },
        },
      },
    },
  };
}
