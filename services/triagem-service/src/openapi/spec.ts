import type { OpenApiDocument } from "@workspace/shared/http";

import type { TriagemServiceEnv } from "../config/env.js";

function successEnvelope(data: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["success", "data"],
          properties: {
            success: { type: "boolean" },
            data,
          },
        },
      },
    },
  };
}

const bearer = [{ bearerAuth: [] }] as const;

const competence = {
  type: "object",
  required: [
    "id",
    "client_id",
    "competence",
    "configuration_snapshot",
    "responsible_snapshot",
    "archived_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    client_id: { type: "string", format: "uuid" },
    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
    configuration_snapshot: { type: "object", additionalProperties: true },
    responsible_snapshot: { type: "object", additionalProperties: true },
    archived_at: { type: ["string", "null"], format: "date-time" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

const catalogItem = {
  type: "object",
  required: ["id", "kind", "code", "label", "url", "archived_at", "created_at", "updated_at"],
  properties: {
    id: { type: "string", format: "uuid" },
    kind: { type: "string", enum: ["JUSTIFICATION", "LINK_TYPE", "DELIVERY_METHOD", "STATE_SITE"] },
    code: { type: "string", minLength: 1, maxLength: 100 },
    label: { type: "string", minLength: 1, maxLength: 255 },
    url: { type: ["string", "null"], format: "uri", pattern: "^https://" },
    archived_at: { type: ["string", "null"], format: "date-time" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

const externalLink = {
  type: "object",
  required: [
    "id",
    "client_id",
    "competence",
    "type",
    "url",
    "description",
    "responsible_id",
    "archived_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    client_id: { type: "string", format: "uuid" },
    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
    type: { type: "string", minLength: 1, maxLength: 100 },
    url: { type: "string", format: "uri", pattern: "^https://" },
    description: { type: ["string", "null"] },
    responsible_id: { type: "string", format: "uuid" },
    responsible: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        status: { type: "string" },
      },
    },
    archived_at: { type: ["string", "null"], format: "date-time" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

const urgentRequest = {
  type: "object",
  required: [
    "id",
    "client_id",
    "competence",
    "requester_id",
    "responsible_id",
    "urgency_code",
    "description",
    "status",
    "resolution_note",
    "resolved_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    client_id: { type: "string", format: "uuid" },
    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
    requester_id: { type: "string", format: "uuid" },
    responsible_id: { type: ["string", "null"], format: "uuid" },
    urgency_code: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    description: { type: "string", minLength: 1, maxLength: 2000 },
    status: { type: "string", enum: ["OPEN", "CLOSED"] },
    resolution_note: { type: ["string", "null"], maxLength: 2000 },
    resolved_at: { type: ["string", "null"], format: "date-time" },
    requester: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: ["string", "null"] },
        full_name: { type: ["string", "null"] },
      },
    },
    responsible: {
      type: ["object", "null"],
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: ["string", "null"] },
        full_name: { type: ["string", "null"] },
      },
    },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

export function buildTriagemServiceOpenApiSpec(env: TriagemServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Triagem Service",
      version: "1.0.0",
      description: "Contrato do serviço oficial de Triagem.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Competencies", description: "Competências mensais da Triagem" },
      { name: "Catalogs", description: "Catálogos operacionais da Triagem" },
      { name: "ExternalLinks", description: "Links externos por competência" },
      { name: "UrgentRequests", description: "Solicitações urgentes por competência" },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": {
              description: "OK",
              ...successEnvelope({ type: "object", additionalProperties: true }),
            },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          responses: {
            "200": {
              description: "Ready",
              ...successEnvelope({ type: "object", additionalProperties: true }),
            },
          },
        },
      },
      "/triagem/competencies": {
        get: {
          tags: ["Competencies"],
          summary: "Listar competências mensais",
          security: bearer,
          parameters: [
            { name: "client_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "competence", in: "query", schema: { type: "string" } },
            { name: "include_archived", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            "200": {
              description: "Competências",
              ...successEnvelope({
                type: "array",
                items: { $ref: "#/components/schemas/TriageCompetence" },
              }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
          },
        },
        post: {
          tags: ["Competencies"],
          summary: "Criar competência mensal",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence"],
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Criada",
              ...successEnvelope({ $ref: "#/components/schemas/TriageCompetence" }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Cliente não encontrado" },
          },
        },
      },
      "/triagem/competencies/{id}/archive": {
        patch: {
          tags: ["Competencies"],
          summary: "Arquivar competência mensal",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Arquivada",
              ...successEnvelope({ $ref: "#/components/schemas/TriageCompetence" }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Competência não encontrada" },
          },
        },
      },
      "/triagem/catalogs": {
        get: {
          tags: ["Catalogs"],
          summary: "Listar itens de catálogo",
          security: bearer,
          parameters: [
            {
              name: "kind",
              in: "query",
              schema: {
                type: "string",
                enum: ["JUSTIFICATION", "LINK_TYPE", "DELIVERY_METHOD", "STATE_SITE"],
              },
            },
            { name: "include_archived", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            "200": {
              description: "Itens de catálogo",
              ...successEnvelope({
                type: "array",
                items: { $ref: "#/components/schemas/TriageCatalogItem" },
              }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
          },
        },
        post: {
          tags: ["Catalogs"],
          summary: "Criar item de catálogo",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["kind", "code", "label"],
                  properties: {
                    kind: {
                      type: "string",
                      enum: ["JUSTIFICATION", "LINK_TYPE", "DELIVERY_METHOD", "STATE_SITE"],
                    },
                    code: { type: "string", minLength: 1, maxLength: 100 },
                    label: { type: "string", minLength: 1, maxLength: 255 },
                    url: { type: "string", format: "uri", pattern: "^https://" },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Criado",
              ...successEnvelope({ $ref: "#/components/schemas/TriageCatalogItem" }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "409": { description: "Código já cadastrado" },
          },
        },
      },
      "/triagem/catalogs/{id}": {
        patch: {
          tags: ["Catalogs"],
          summary: "Atualizar item de catálogo",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  minProperties: 1,
                  properties: {
                    kind: {
                      type: "string",
                      enum: ["JUSTIFICATION", "LINK_TYPE", "DELIVERY_METHOD", "STATE_SITE"],
                    },
                    code: { type: "string", minLength: 1, maxLength: 100 },
                    label: { type: "string", minLength: 1, maxLength: 255 },
                    url: { type: ["string", "null"], format: "uri", pattern: "^https://" },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Atualizado",
              ...successEnvelope({ $ref: "#/components/schemas/TriageCatalogItem" }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Item não encontrado" },
            "409": { description: "Código já cadastrado" },
          },
        },
      },
      "/triagem/catalogs/{id}/archive": {
        patch: {
          tags: ["Catalogs"],
          summary: "Arquivar item de catálogo",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Arquivado",
              ...successEnvelope({ $ref: "#/components/schemas/TriageCatalogItem" }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Item não encontrado" },
          },
        },
      },
      "/triagem/external-links": {
        get: {
          tags: ["ExternalLinks"],
          summary: "Listar links externos",
          security: bearer,
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
              schema: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
            },
            { name: "include_archived", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            "200": {
              description: "Links externos",
              ...successEnvelope({
                type: "array",
                items: { $ref: "#/components/schemas/TriageExternalLink" },
              }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
          },
        },
        post: {
          tags: ["ExternalLinks"],
          summary: "Criar link externo",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["client_id", "competence", "type", "url"],
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                    type: { type: "string", minLength: 1, maxLength: 100 },
                    url: { type: "string", format: "uri", pattern: "^https://" },
                    description: { type: ["string", "null"] },
                    responsible_id: { type: ["string", "null"], format: "uuid" },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Criado",
              ...successEnvelope({ $ref: "#/components/schemas/TriageExternalLink" }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Cliente ou responsável não encontrado" },
          },
        },
      },
      "/triagem/external-links/{id}": {
        put: {
          tags: ["ExternalLinks"],
          summary: "Revisar link externo",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type", "url"],
                  properties: {
                    type: { type: "string", minLength: 1, maxLength: 100 },
                    url: { type: "string", format: "uri", pattern: "^https://" },
                    description: { type: ["string", "null"] },
                    responsible_id: { type: ["string", "null"], format: "uuid" },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Atualizado",
              ...successEnvelope({ $ref: "#/components/schemas/TriageExternalLink" }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Link ou responsável não encontrado" },
          },
        },
      },
      "/triagem/external-links/{id}/archive": {
        patch: {
          tags: ["ExternalLinks"],
          summary: "Arquivar link externo",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Arquivado",
              ...successEnvelope({ $ref: "#/components/schemas/TriageExternalLink" }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Link não encontrado" },
          },
        },
      },
      "/triagem/urgent-requests": {
        get: {
          tags: ["UrgentRequests"],
          summary: "Listar solicitações urgentes",
          security: bearer,
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
              schema: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
            },
            { name: "status", in: "query", schema: { type: "string", enum: ["OPEN", "CLOSED"] } },
          ],
          responses: {
            "200": {
              description: "Solicitações urgentes",
              ...successEnvelope({
                type: "array",
                items: { $ref: "#/components/schemas/TriageUrgentRequest" },
              }),
            },
            "400": { description: "Filtros inválidos" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
          },
        },
        post: {
          tags: ["UrgentRequests"],
          summary: "Criar solicitação urgente",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "client_id",
                    "competence",
                    "urgency_code",
                    "description",
                    "responsible_id",
                  ],
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                    urgency_code: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                    description: { type: "string", minLength: 1, maxLength: 2000 },
                    responsible_id: { type: "string", format: "uuid" },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Criada",
              ...successEnvelope({ $ref: "#/components/schemas/TriageUrgentRequest" }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Cliente ou responsável não encontrado" },
          },
        },
      },
      "/triagem/urgent-requests/{id}": {
        put: {
          tags: ["UrgentRequests"],
          summary: "Atualizar solicitação urgente",
          security: bearer,
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
                    urgency_code: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                    description: { type: "string", minLength: 1, maxLength: 2000 },
                    responsible_id: { type: "string", format: "uuid" },
                  },
                  minProperties: 1,
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Atualizada",
              ...successEnvelope({ $ref: "#/components/schemas/TriageUrgentRequest" }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Solicitação ou responsável não encontrado" },
            "409": { description: "Solicitação fechada" },
          },
        },
      },
      "/triagem/urgent-requests/{id}/close": {
        patch: {
          tags: ["UrgentRequests"],
          summary: "Fechar solicitação urgente",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["resolution_note"],
                  properties: {
                    resolution_note: { type: "string", minLength: 1, maxLength: 2000 },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Fechada",
              ...successEnvelope({ $ref: "#/components/schemas/TriageUrgentRequest" }),
            },
            "400": { description: "Nota inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Solicitação não encontrada" },
          },
        },
      },
      "/triagem/urgent-requests/{id}/reopen": {
        patch: {
          tags: ["UrgentRequests"],
          summary: "Reabrir solicitação urgente",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Reaberta",
              ...successEnvelope({ $ref: "#/components/schemas/TriageUrgentRequest" }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Solicitação não encontrada" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        TriageCompetence: competence,
        TriageCatalogItem: catalogItem,
        TriageExternalLink: externalLink,
        TriageUrgentRequest: urgentRequest,
      },
    },
  };
}
