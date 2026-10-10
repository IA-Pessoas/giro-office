import type { OpenApiDocument } from "@workspace/shared/http";

import type { TriagemServiceEnv } from "../config/env.js";
import { TRIAGE_CATALOG_CODE_MAX_LENGTH } from "../services/triageCatalog.constants.js";

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
    kind: {
      type: "string",
      enum: ["JUSTIFICATION", "LINK_TYPE", "DELIVERY_METHOD", "STATE_SITE", "REQUEST_CATEGORY"],
    },
    code: { type: "string", minLength: 1, maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH },
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
    type: { type: "string", minLength: 1, maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH },
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

const solicitation = {
  type: "object",
  required: [
    "id",
    "client_id",
    "competence",
    "category_id",
    "description",
    "requester_id",
    "responsible_id",
    "status",
    "closed_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: { type: "string", format: "uuid" },
    client_id: { type: "string", format: "uuid" },
    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
    category_id: { type: "string", format: "uuid" },
    description: { type: "string", minLength: 1, maxLength: 2000 },
    requester_id: { type: "string", format: "uuid" },
    responsible_id: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["OPEN", "CLOSED"] },
    closed_at: { type: ["string", "null"], format: "date-time" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    client: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } },
    },
    category: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        code: { type: "string" },
        label: { type: "string" },
      },
    },
    requester: { $ref: "#/components/schemas/TriageUserRef" },
    responsible: { $ref: "#/components/schemas/TriageUserRef" },
  },
} as const;

const userRef = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: ["string", "null"] },
    full_name: { type: ["string", "null"] },
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

const overviewItem = {
  type: "object",
  required: ["client_id", "legal_name", "competence", "status"],
  properties: {
    client_id: { type: "string", format: "uuid" },
    legal_name: { type: "string" },
    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
    status: {
      type: "string",
      enum: ["URGENT_OPEN", "ROUTINE_PENDING", "BANK_PENDING", "COMPLETE", "NO_APPLICABLE_ITEMS"],
    },
  },
} as const;

const overviewIndicators = {
  type: "object",
  required: ["urgent_open", "routine_pending", "bank_pending", "complete", "no_applicable_items"],
  properties: {
    urgent_open: { type: "integer", minimum: 0 },
    routine_pending: { type: "integer", minimum: 0 },
    bank_pending: { type: "integer", minimum: 0 },
    complete: { type: "integer", minimum: 0 },
    no_applicable_items: { type: "integer", minimum: 0 },
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
      {
        name: "Solicitations",
        description: "Solicitações legadas por cliente e competência, distintas das urgentes",
      },
      { name: "Overview", description: "Painel operacional consolidado" },
      { name: "Audit", description: "Histórico append-only da Triagem" },
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
      "/triagem/overview": {
        get: {
          tags: ["Overview"],
          summary: "Listar o painel operacional consolidado",
          security: bearer,
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "page_size",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            { name: "client_id", in: "query", schema: { type: "string", format: "uuid" } },
            {
              name: "competence",
              in: "query",
              schema: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
            },
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "URGENT_OPEN",
                  "ROUTINE_PENDING",
                  "BANK_PENDING",
                  "COMPLETE",
                  "NO_APPLICABLE_ITEMS",
                ],
              },
            },
          ],
          responses: {
            "200": {
              description: "Painel consolidado",
              ...successEnvelope({
                type: "object",
                required: ["items", "total", "page", "page_size", "indicators"],
                properties: {
                  items: {
                    type: "array",
                    items: { $ref: "#/components/schemas/TriageOverviewItem" },
                  },
                  total: { type: "integer", minimum: 0 },
                  page: { type: "integer", minimum: 1 },
                  page_size: { type: "integer", minimum: 1, maximum: 100 },
                  indicators: { $ref: "#/components/schemas/TriageOverviewIndicators" },
                },
              }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "400": { description: "Entrada inválida" },
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
      "/triagem/competencies/{id}/history": {
        get: {
          tags: ["Audit"],
          summary: "Consultar histórico da competência",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "page_size",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            "200": {
              description: "Timeline append-only",
              ...successEnvelope({
                type: "object",
                required: ["items", "total", "page", "page_size"],
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["id", "action", "actor", "competence", "occurred_at", "context"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        action: { type: "string" },
                        actor: {
                          type: "object",
                          required: ["id", "name", "full_name"],
                          properties: {
                            id: { type: "string", format: "uuid" },
                            name: { type: "string" },
                            full_name: { type: ["string", "null"] },
                          },
                        },
                        competence: { type: "string" },
                        occurred_at: { type: "string", format: "date-time" },
                        context: {
                          type: "object",
                          required: ["before", "after"],
                          properties: {
                            before: { type: ["object", "null"], additionalProperties: true },
                            after: { type: "object", additionalProperties: true },
                          },
                        },
                      },
                    },
                  },
                  total: { type: "integer", minimum: 0 },
                  page: { type: "integer", minimum: 1 },
                  page_size: { type: "integer", minimum: 1, maximum: 100 },
                },
              }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Competência não encontrada" },
          },
        },
      },
      "/internal/triagem/audit/reconcile": {
        post: {
          tags: ["Audit"],
          summary: "Reconciliar o outbox de auditoria da Triagem",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "x-auth-user-id",
              in: "header",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "x-auth-organization-id",
              in: "header",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "x-auth-permission",
              in: "header",
              required: false,
              schema: { type: "integer", minimum: 0 },
            },
            {
              name: "x-auth-modules",
              in: "header",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Eventos reconciliados",
              ...successEnvelope({
                type: "object",
                required: ["reconciled", "dispatched", "pending"],
                properties: {
                  reconciled: { type: "integer", minimum: 0 },
                  dispatched: { type: "integer", minimum: 0 },
                  pending: { type: "integer", minimum: 0 },
                },
              }),
            },
            "401": { description: "Token interno ausente" },
            "403": { description: "Sem permissão" },
            "500": { description: "Falha de reconciliação" },
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
                enum: [
                  "JUSTIFICATION",
                  "LINK_TYPE",
                  "DELIVERY_METHOD",
                  "STATE_SITE",
                  "REQUEST_CATEGORY",
                ],
              },
            },
            { name: "include_archived", in: "query", schema: { type: "boolean" } },
            { name: "client_id", in: "query", schema: { type: "string", format: "uuid" } },
            {
              name: "competence",
              in: "query",
              schema: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
            },
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
                      enum: [
                        "JUSTIFICATION",
                        "LINK_TYPE",
                        "DELIVERY_METHOD",
                        "STATE_SITE",
                        "REQUEST_CATEGORY",
                      ],
                    },
                    code: {
                      type: "string",
                      minLength: 1,
                      maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH,
                    },
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
                      enum: [
                        "JUSTIFICATION",
                        "LINK_TYPE",
                        "DELIVERY_METHOD",
                        "STATE_SITE",
                        "REQUEST_CATEGORY",
                      ],
                    },
                    code: {
                      type: "string",
                      minLength: 1,
                      maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH,
                    },
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
                    type: {
                      type: "string",
                      minLength: 1,
                      maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH,
                    },
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
                    type: {
                      type: "string",
                      minLength: 1,
                      maxLength: TRIAGE_CATALOG_CODE_MAX_LENGTH,
                    },
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
      "/triagem/solicitations": {
        get: {
          tags: ["Solicitations"],
          summary: "Listar solicitações",
          description:
            "Administrador (nível 3) vê todas da organização; operador comum só as sob sua responsabilidade.",
          security: bearer,
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["OPEN", "CLOSED"] } },
            { name: "client_id", in: "query", schema: { type: "string", format: "uuid" } },
            {
              name: "competence",
              in: "query",
              schema: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
            },
          ],
          responses: {
            "200": {
              description: "Solicitações",
              ...successEnvelope({
                type: "array",
                items: { $ref: "#/components/schemas/TriageSolicitation" },
              }),
            },
            "400": { description: "Filtros inválidos" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
          },
        },
        post: {
          tags: ["Solicitations"],
          summary: "Criar solicitação",
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
                    "category_id",
                    "description",
                    "responsible_id",
                  ],
                  properties: {
                    client_id: { type: "string", format: "uuid" },
                    competence: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
                    category_id: {
                      type: "string",
                      format: "uuid",
                      description: "Item ativo do catálogo REQUEST_CATEGORY da organização",
                    },
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
              ...successEnvelope({ $ref: "#/components/schemas/TriageSolicitation" }),
            },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Cliente, responsável ou categoria não encontrado" },
            "409": { description: "Competência arquivada" },
          },
        },
      },
      "/triagem/solicitations/{id}": {
        get: {
          tags: ["Solicitations"],
          summary: "Consultar solicitação",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Solicitação",
              ...successEnvelope({ $ref: "#/components/schemas/TriageSolicitation" }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Solicitação não encontrada" },
          },
        },
      },
      "/triagem/solicitations/{id}/close": {
        patch: {
          tags: ["Solicitations"],
          summary: "Fechar solicitação",
          description: "Idempotente: fechar de novo mantém a data de fechamento original.",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Fechada",
              ...successEnvelope({ $ref: "#/components/schemas/TriageSolicitation" }),
            },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão" },
            "404": { description: "Solicitação não encontrada" },
            "409": { description: "Competência arquivada" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        internalServiceToken: { type: "apiKey", in: "header", name: "x-internal-service-token" },
      },
      schemas: {
        TriageCompetence: competence,
        TriageCatalogItem: catalogItem,
        TriageExternalLink: externalLink,
        TriageUrgentRequest: urgentRequest,
        TriageSolicitation: solicitation,
        TriageUserRef: userRef,
        TriageOverviewItem: overviewItem,
        TriageOverviewIndicators: overviewIndicators,
      },
    },
  };
}
