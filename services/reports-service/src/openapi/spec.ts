import type { OpenApiDocument } from "@workspace/shared/http";

import type { ReportsServiceEnv } from "../config/env.js";

const successResponse = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

export function buildReportsServiceOpenApiSpec(env: ReportsServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Reports Service",
      version: "1.0.0",
      description: "Contrato do servico de relatorios.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Reports", description: "Catalogo de relatorios" },
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
          required: ["success", "data"],
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object", additionalProperties: true },
          },
        },
        ErrorEnvelope: {
          type: "object",
          required: ["success", "error", "code"],
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string" },
            code: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: { "200": { description: "OK", ...successResponse } },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          responses: { "200": { description: "Ready", ...successResponse } },
        },
      },
      "/reports/catalog": {
        get: {
          tags: ["Reports"],
          summary: "Listar catalogo de relatorios",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Catalogo de relatorios", ...successResponse },
            "401": {
              description: "Contexto autenticado ausente",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                },
              },
            },
          },
        },
      },
      "/reports/preview": {
        post: {
          tags: ["Reports"],
          summary: "Gerar prévia limitada de relatório",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["definition"],
                  additionalProperties: false,
                  properties: {
                    definition: { type: "object", additionalProperties: true },
                    parameterValues: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Prévia limitada com linhas, apresentação e hasMore",
              ...successResponse,
            },
            "400": { description: "Definição inválida" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Fonte ou campo não autorizado" },
          },
        },
      },
      "/reports/jobs": {
        post: {
          tags: ["Reports"],
          summary: "Enfileirar execução durável de relatório",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    definition: { type: "object", additionalProperties: true },
                    modelVersionId: { type: "string", format: "uuid" },
                    parameterValues: { type: "object", additionalProperties: true },
                    format: { type: "string", enum: ["json", "csv"] },
                  },
                  oneOf: [{ required: ["definition"] }, { required: ["modelVersionId"] }],
                },
              },
            },
          },
          responses: {
            "201": { description: "Job enfileirado", ...successResponse },
            "400": { description: "Entrada inválida" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Definição ou modelo não autorizado" },
          },
        },
      },
      "/reports/jobs/{id}": {
        get: {
          tags: ["Reports"],
          summary: "Consultar job próprio de relatório",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Job", ...successResponse },
            "404": { description: "Job não encontrado" },
          },
        },
      },
      "/reports/jobs/list": {
        get: {
          tags: ["Reports"],
          summary: "Listar historico pessoal ou acervo departamental",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "scope",
              in: "query",
              schema: { type: "string", enum: ["personal", "library"], default: "personal" },
            },
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "queued",
                  "processing",
                  "completed",
                  "cancelled",
                  "failed",
                  "expired",
                  "deleted",
                ],
              },
            },
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "model_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "author_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "cursor", in: "query", schema: { type: "integer", minimum: 0 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          ],
          responses: {
            "200": { description: "Historico paginado", ...successResponse },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Membro do departamento atual necessario" },
          },
        },
      },
      "/reports/retention": {
        get: {
          tags: ["Reports"],
          summary: "Consultar retenção organizacional de relatórios",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Política de retenção", ...successResponse },
            "403": { description: "Somente owner" },
          },
        },
        put: {
          tags: ["Reports"],
          summary: "Definir retenção para jobs futuros",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["retention_days"],
                  additionalProperties: false,
                  properties: { retention_days: { type: "integer", minimum: 1, maximum: 365 } },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Política atualizada; o evento de alteração é gravado na auditoria local",
              ...successResponse,
            },
            "400": { description: "Retenção inválida" },
            "403": { description: "Somente owner" },
          },
        },
      },
      "/reports/jobs/{id}/cancel": {
        post: {
          tags: ["Reports"],
          summary: "Cancelar job enfileirado ou em processamento",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "204": { description: "Cancelado" },
            "404": { description: "Job não encontrado" },
          },
        },
      },
      "/reports/jobs/{id}/snapshot": {
        get: {
          tags: ["Reports"],
          summary: "Ler snapshot concluído e paginado",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "scope",
              in: "query",
              description:
                "Use scope=personal, or omit it, to open the author's personal snapshot, including after source permission loss. Use scope=library for shared snapshots; this requires the current department.",
              schema: { type: "string", enum: ["personal", "library"], default: "personal" },
            },
            { name: "cursor", in: "query", schema: { type: "integer", minimum: 0 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500 } },
          ],
          responses: {
            "200": { description: "Snapshot paginado", ...successResponse },
            "403": {
              description:
                "Departamento atual necessário para o acervo ou scope=library obrigatório para snapshot compartilhado",
            },
            "404": { description: "Snapshot não encontrado ou indisponível" },
          },
        },
      },
      "/reports/snapshots/{id}/export": {
        get: {
          tags: ["Reports"],
          summary: "Exportar snapshot autorizado sem persistir arquivo",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "format",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["csv", "xlsx", "pdf"] },
            },
          ],
          responses: {
            "200": {
              description: "Arquivo efêmero gerado a partir do snapshot",
              content: {
                "text/csv": { schema: { type: "string", format: "binary" } },
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                  schema: { type: "string", format: "binary" },
                },
                "application/pdf": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            "400": { description: "Formato inválido" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Snapshot não autorizado" },
            "404": { description: "Snapshot não encontrado ou expirado" },
          },
        },
      },
      "/reports/snapshots/{id}/delete": {
        post: {
          tags: ["Reports"],
          summary: "Excluir snapshot por solicitação administrativa",
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
                  required: ["justification"],
                  additionalProperties: false,
                  properties: { justification: { type: "string", minLength: 10, maxLength: 1000 } },
                },
              },
            },
          },
          responses: {
            "204": { description: "Snapshot excluído" },
            "400": { description: "Justificativa inválida" },
            "403": { description: "Admin 3 do departamento necessário" },
            "404": { description: "Snapshot não encontrado" },
            "409": { description: "Snapshot indisponível" },
          },
        },
      },
      "/reports/models/shared": {
        post: {
          tags: ["Reports"],
          summary: "Criar modelo compartilhado do departamento",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "definition"],
                  properties: {
                    name: { type: "string" },
                    definition: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Modelo compartilhado criado", ...successResponse },
            "400": { description: "Entrada inválida" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Permissão departamental insuficiente" },
          },
        },
      },
      "/reports/models/shared/list": {
        get: {
          tags: ["Reports"],
          summary: "Listar acervo compartilhado do departamento atual",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Acervo compartilhado", ...successResponse },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Departamento atual indisponível" },
          },
        },
      },
      "/reports/models/shared/{id}": {
        patch: {
          tags: ["Reports"],
          summary: "Criar nova versão de modelo compartilhado",
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
                  required: ["definition"],
                  properties: {
                    name: { type: "string" },
                    definition: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Nova versão compartilhada", ...successResponse },
            "400": { description: "Entrada inválida" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Permissão departamental insuficiente" },
            "404": { description: "Modelo não encontrado" },
          },
        },
      },
      "/reports/models/shared/{id}/copy": {
        post: {
          tags: ["Reports"],
          summary: "Copiar modelo compartilhado como modelo pessoal",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "201": { description: "Modelo pessoal copiado", ...successResponse },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Departamento atual indisponível" },
            "404": { description: "Modelo não encontrado" },
          },
        },
      },
      "/reports/models/shared/{id}/preview": {
        post: {
          tags: ["Reports"],
          summary: "Gerar prévia com a concessão do modelo compartilhado",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Prévia limitada", ...successResponse },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Concessão ou departamento indisponível" },
            "404": { description: "Modelo não encontrado" },
          },
        },
      },
      "/reports/models": {
        post: {
          tags: ["Reports"],
          summary: "Criar modelo pessoal de relatório",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "definition"],
                  properties: {
                    name: { type: "string", example: "Saldo mensal" },
                    definition: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Modelo pessoal criado", ...successResponse },
            "400": { description: "Entrada inválida" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Fonte ou campo não autorizado" },
          },
        },
      },
      "/reports/models/list": {
        get: {
          tags: ["Reports"],
          summary: "Listar modelos pessoais autorizados",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Modelos pessoais", ...successResponse },
            "401": { description: "Contexto autenticado ausente" },
            "503": { description: "Contexto de acesso indisponível" },
          },
        },
      },
      "/reports/models/{id}": {
        get: {
          tags: ["Reports"],
          summary: "Consultar modelo pessoal",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Modelo pessoal", ...successResponse },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Fonte ou campo não autorizado" },
            "404": { description: "Modelo não encontrado" },
          },
        },
        patch: {
          tags: ["Reports"],
          summary: "Criar nova versão de modelo pessoal",
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
                    name: { type: "string" },
                    definition: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Nova versão criada", ...successResponse },
            "400": { description: "Entrada inválida" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Fonte ou campo não autorizado" },
            "404": { description: "Modelo não encontrado" },
          },
        },
        delete: {
          tags: ["Reports"],
          summary: "Excluir modelo pessoal",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "204": { description: "Modelo excluído" },
            "401": { description: "Contexto autenticado ausente" },
            "404": { description: "Modelo não encontrado" },
          },
        },
      },
    },
  };
}
