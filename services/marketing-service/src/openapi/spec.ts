import type { MarketingServiceEnv } from "../config/env.js";
import {
  MARKETING_EVENT_PRIORITIES,
  MARKETING_EVENT_STATUSES,
} from "../schemas/marketingEvent.schemas.js";

const marketingEventSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", maxLength: 50 },
    logo: { type: "string", maxLength: 100 },
    status: { type: "string", enum: MARKETING_EVENT_STATUSES },
    priority: { type: "string", enum: MARKETING_EVENT_PRIORITIES },
    objective: { type: "string" },
    audience: { type: "string" },
  },
  required: ["id", "name", "logo", "status", "priority", "objective", "audience"],
} as const;

const marketingEventInputSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 50 },
    logo: { type: "string", maxLength: 100, default: "" },
    priority: { type: "string", enum: MARKETING_EVENT_PRIORITIES },
    objective: { type: "string", default: "" },
    audience: { type: "string", default: "" },
  },
  required: ["name", "priority"],
  additionalProperties: false,
} as const;

const marketingEventUpdateSchema = {
  type: "object",
  properties: {
    ...marketingEventInputSchema.properties,
    status: {
      type: "string",
      enum: MARKETING_EVENT_STATUSES,
    },
  },
  required: [],
  minProperties: 1,
  additionalProperties: false,
} as const;

const marketingEventResponse = {
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    data: { $ref: "#/components/schemas/MarketingEvent" },
  },
  required: ["success", "data"],
} as const;

export function buildMarketingServiceOpenApiSpec(env: MarketingServiceEnv) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Marketing Service API",
      version: "1.0.0",
      description: "Dashboard e cadastro de eventos do Marketing.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    paths: {
      "/marketing/dashboard": {
        get: {
          summary: "Consultar dashboard inicial de Marketing",
          description:
            "Retorna contagens de solicitações existentes e aniversários da organização autenticada.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Resumo do dashboard.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { type: "object" },
                    },
                    required: ["success", "data"],
                  },
                },
              },
            },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão Marketing insuficiente." },
          },
        },
      },
      "/marketing/events/list": {
        get: {
          summary: "Listar eventos da organização",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Eventos da organização autenticada.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/MarketingEvent" },
                      },
                    },
                    required: ["success", "data"],
                  },
                },
              },
            },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão Marketing insuficiente." },
          },
        },
      },
      "/marketing/events": {
        post: {
          summary: "Cadastrar evento",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MarketingEventInput" } },
            },
          },
          responses: {
            "201": {
              description: "Evento cadastrado.",
              content: { "application/json": { schema: marketingEventResponse } },
            },
            "400": { description: "Dados do evento inválidos." },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão de edição do Marketing necessária." },
            "409": { description: "Já existe um evento com esse nome na organização." },
          },
        },
      },
      "/marketing/events/{id}": {
        put: {
          summary: "Editar evento",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MarketingEventUpdate" } },
            },
          },
          responses: {
            "200": {
              description: "Evento atualizado.",
              content: { "application/json": { schema: marketingEventResponse } },
            },
            "400": { description: "Dados do evento inválidos." },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão de edição do Marketing necessária." },
            "404": { description: "Evento não encontrado na organização." },
            "409": { description: "Já existe um evento com esse nome na organização." },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        MarketingEvent: marketingEventSchema,
        MarketingEventInput: marketingEventInputSchema,
        MarketingEventUpdate: marketingEventUpdateSchema,
      },
    },
  };
}
