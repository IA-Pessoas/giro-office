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
        ProspectingListClient: {
          allOf: [
            { $ref: "#/components/schemas/ProspectingClient" },
            {
              type: "object",
              required: ["cpf_cnpj"],
              properties: {
                cpf_cnpj: { type: "string" },
                number: { type: "string", nullable: true },
                email: { type: "string", nullable: true },
                indication: { type: "string", nullable: true },
                partners: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["clientPF"],
                    properties: {
                      clientPF: {
                        type: "object",
                        required: ["name"],
                        properties: { name: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
        ProspectingListItem: {
          allOf: [
            { $ref: "#/components/schemas/Prospecting" },
            {
              type: "object",
              properties: { client: { $ref: "#/components/schemas/ProspectingListClient" } },
            },
          ],
        },
        ProspectingPage: {
          type: "object",
          required: ["items", "page", "page_size", "total", "total_pages"],
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/ProspectingListItem" } },
            page: { type: "integer", minimum: 1 },
            page_size: { type: "integer", minimum: 1, maximum: 100 },
            total: { type: "integer", minimum: 0 },
            total_pages: { type: "integer", minimum: 0 },
          },
        },
        ProspectingPageEnvelope: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean" },
            data: { $ref: "#/components/schemas/ProspectingPage" },
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
            closed_at: { type: "string", format: "date-time", nullable: true },
            solution: {
              type: "string",
              enum: ["CASTELO", "KALANGO", "META", "NIT"],
              nullable: true,
            },
            reference_month: { type: "string", nullable: true },
            service: { type: "string", nullable: true },
            description: { type: "string", nullable: true },
            participants: { type: "string", nullable: true },
            meeting_mode: { type: "string", nullable: true },
            branch: { type: "string", nullable: true },
            reset_date: { type: "string", format: "date", nullable: true },
            reset_scheduled_by: { type: "string", format: "uuid", nullable: true },
            reset_scheduled_by_name: { type: "string", nullable: true },
            reset_registered_at: { type: "string", format: "date-time", nullable: true },
            reset_processed_at: { type: "string", format: "date-time", nullable: true },
            pause_reason: { type: "string", nullable: true },
            attachment_name: { type: "string", nullable: true },
            attachment_mime_type: { type: "string", nullable: true },
            attachment_size_bytes: { type: "integer", nullable: true },
            client: { $ref: "#/components/schemas/ProspectingClient" },
          },
        },
        ProspectingInput: {
          type: "object",
          additionalProperties: false,
          required: ["client_id", "status", "status_date", "solution", "reference_month"],
          properties: {
            client_id: { type: "string", format: "uuid" },
            status: { $ref: "#/components/schemas/Prospecting/properties/status" },
            status_date: { type: "string", format: "date-time" },
            solution: { type: "string", enum: ["CASTELO", "KALANGO", "META", "NIT"] },
            reference_month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            service: { type: "string", nullable: true },
            description: { type: "string", maxLength: 5000, nullable: true },
            participants: { type: "string", nullable: true },
            meeting_mode: { type: "string", nullable: true },
            branch: { type: "string", nullable: true },
            pause_reason: { type: "string", nullable: true },
          },
        },
        ProspectingPatch: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            status: {
              anyOf: [
                { $ref: "#/components/schemas/Prospecting/properties/status" },
                { type: "string", enum: ["Fechado SE"] },
              ],
            },
            status_date: { type: "string", format: "date-time" },
            solution: { type: "string", enum: ["CASTELO", "KALANGO", "META", "NIT"] },
            reference_month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
            service: { type: "string", nullable: true },
            description: { type: "string", maxLength: 5000, nullable: true },
            participants: { type: "string", nullable: true },
            meeting_mode: { type: "string", nullable: true },
            branch: { type: "string", nullable: true },
            pause_reason: { type: "string", nullable: true },
            reset_date: { type: "string", format: "date", nullable: true },
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
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "page_size",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: "status",
              in: "query",
              schema: {
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
            },
            { name: "search", in: "query", schema: { type: "string", maxLength: 120 } },
          ],
          responses: {
            "200": {
              description: "Lista paginada de prospecções da organização.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProspectingPageEnvelope" },
                },
              },
            },
            "401": { description: "Não autenticado." },
          },
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
            "400": { description: "Identificador inválido." },
            "404": { description: "Não encontrado." },
          },
        },
      },
      "/commercial/prospecting/{id}/history": {
        get: {
          tags: ["Commercial"],
          summary: "Consultar histórico por campo da prospecção",
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
      "/commercial/prospecting/{id}/attachment": {
        get: {
          tags: ["Commercial"],
          summary: "Criar link temporário para o anexo da prospecção",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": successResponse,
            "401": { description: "Não autenticado." },
            "404": { description: "Anexo não encontrado." },
          },
        },
        put: {
          tags: ["Commercial"],
          summary: "Anexar arquivo à prospecção paralisada",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "string", format: "binary" } },
                },
              },
            },
          },
          responses: {
            "200": successResponse,
            "400": { description: "Arquivo inválido ou situação sem paralisação." },
            "401": { description: "Não autenticado." },
            "404": { description: "Prospecção não encontrada." },
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
