import type { OpenApiDocument } from "@workspace/shared/http";

import type { ReportsServiceEnv } from "../config/env.js";

const fieldReference = {
  source: { type: "string" },
  field: { type: "string", pattern: "^[a-z][a-z0-9_]*$", maxLength: 64 },
} as const;
const reportDefinition = {
  type: "object",
  additionalProperties: false,
  required: ["sources", "columns"],
  description:
    "Definição legada compatível. Critérios são independentes por área. Resumos retornam group_by e aliases (padrão field_function); não retornam colunas não agrupadas. count ignora nulos; demais resumos vazios retornam null. Valores dos parâmetros devem corresponder ao tipo declarado/campo e ao operador.",
  properties: {
    sources: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
      items: { type: "string" },
    },
    columns: {
      type: "array",
      minItems: 1,
      maxItems: 25,
      items: {
        type: "object",
        required: ["source", "field", "alias"],
        additionalProperties: false,
        properties: { ...fieldReference, alias: { type: "string" } },
      },
    },
    joins: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        required: ["relation", "type"],
        additionalProperties: false,
        properties: {
          relation: { type: "string" },
          type: { type: "string", enum: ["inner", "left"] },
        },
      },
    },
    filters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "field", "operator", "parameter"],
        properties: {
          ...fieldReference,
          operator: {
            type: "string",
            enum: ["eq", "neq", "contains", "in", "gt", "gte", "lt", "lte", "between"],
          },
          parameter: { type: "string" },
        },
      },
    },
    filter_groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["operator", "filters"],
        properties: {
          operator: { type: "string", enum: ["and", "or"] },
          filters: { type: "array", minItems: 1, items: { type: "string" } },
        },
      },
    },
    parameters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type"],
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["string", "number", "date", "boolean"] },
        },
      },
    },
    aggregations: {
      type: "array",
      items: {
        type: "object",
        required: ["source", "field", "function"],
        additionalProperties: false,
        properties: {
          ...fieldReference,
          function: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
          alias: {
            type: "string",
            description: "Opcional; padrão field_function. Deve ser único no resultado.",
          },
        },
      },
    },
    group_by: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        required: ["source", "field"],
        additionalProperties: false,
        properties: fieldReference,
      },
    },
    order_by: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        required: ["source", "field", "direction"],
        additionalProperties: false,
        properties: { ...fieldReference, direction: { type: "string", enum: ["asc", "desc"] } },
      },
    },
    declared_cost: {
      type: "object",
      additionalProperties: false,
      required: ["rows", "bytes"],
      properties: {
        rows: { type: "integer", minimum: 0, maximum: 50000 },
        bytes: { type: "integer", minimum: 0, maximum: 20971520 },
      },
    },
  },
} as const;

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
        ReportDefinition: reportDefinition,
        ReportComposition: {
          type: "object",
          additionalProperties: false,
          required: ["version", "areas"],
          properties: {
            version: { type: "integer", enum: [2] },
            areas: {
              type: "array",
              minItems: 1,
              maxItems: 32,
              description: "Áreas únicas e independentes; ordem exclusivamente visual.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["source", "fields"],
                properties: {
                  source: { type: "string" },
                  filterLogic: { type: "string", enum: ["and", "or"], default: "and" },
                  filters: {
                    type: "array",
                    maxItems: 100,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["field", "operator", "value"],
                      properties: {
                        field: { type: "string", minLength: 1, maxLength: 64 },
                        operator: reportDefinition.properties.filters.items.properties.operator,
                        value: {
                          description:
                            "Valor tipado; in usa lista e between usa dois extremos. Máximo 100 valores, textos até 2048 caracteres.",
                          oneOf: [
                            { type: "string", maxLength: 2048 },
                            { type: "number" },
                            { type: "boolean" },
                            {
                              type: "array",
                              maxItems: 100,
                              items: {
                                nullable: true,
                                oneOf: [
                                  { type: "string", maxLength: 2048 },
                                  { type: "number" },
                                  { type: "boolean" },
                                ],
                              },
                            },
                          ],
                          nullable: true,
                        },
                      },
                    },
                  },
                  parameterValues: {
                    type: "object",
                    additionalProperties: true,
                    description:
                      "Parâmetros publicados e obrigatórios da própria área, com tipos e opções do catálogo.",
                  },
                  groupBy: {
                    type: "array",
                    maxItems: 25,
                    items: { type: "string", minLength: 1, maxLength: 64 },
                  },
                  aggregations: {
                    type: "array",
                    maxItems: 25,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["field", "function"],
                      properties: {
                        field: { type: "string", minLength: 1, maxLength: 64 },
                        function: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
                      },
                    },
                  },
                  orderBy: {
                    type: "array",
                    maxItems: 25,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["field", "direction"],
                      properties: {
                        field: { type: "string", minLength: 1, maxLength: 64 },
                        direction: { type: "string", enum: ["asc", "desc"] },
                      },
                    },
                  },
                  fields: {
                    type: "array",
                    minItems: 1,
                    maxItems: 100,
                    uniqueItems: true,
                    items: { type: "string", minLength: 1, maxLength: 64 },
                  },
                },
              },
            },
          },
        },
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
      "/reports/definitions/validate": {
        post: {
          tags: ["Reports"],
          summary: "Revisar áreas e campos autorizados sem executar ou persistir",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["definition"],
                  properties: {
                    definition: {
                      oneOf: [
                        { $ref: "#/components/schemas/ReportComposition" },
                        { $ref: "#/components/schemas/ReportDefinition" },
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Definição validada, preservando versão e ordem",
              ...successResponse,
            },
            "400": { description: "Escolhas inválidas, repetidas, vazias ou acima dos limites" },
            "401": { description: "Contexto autenticado ausente" },
            "403": { description: "Área ou campo não autorizado" },
          },
        },
      },
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
            "200": {
              description:
                "Áreas autorizadas com key, label, module, department_label, description e fields autorizados. Agrupar por department_label; identificadores internos não são rótulos de interface.",
              ...successResponse,
            },
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
          summary: "Visualizar prévia opcional e temporária, sem execução ou histórico",
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
                    definition: {
                      oneOf: [
                        { $ref: "#/components/schemas/ReportDefinition" },
                        { $ref: "#/components/schemas/ReportComposition" },
                      ],
                    },
                    parameterValues: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            "422": { description: "Capacidade excedida; nenhum resultado parcial" },
            "200": {
              description:
                "Legado: rows, presentation.columns, limit e hasMore. Composição: blocks em ordem visual, cada um com source, label amigável, rows independentes, presentation.columns com key/label amigável, limit e hasMore. Bloco vazio é válido. Nenhum resultado parcial em falha.",
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
                    definition: {
                      oneOf: [
                        { $ref: "#/components/schemas/ReportComposition" },
                        { $ref: "#/components/schemas/ReportDefinition" },
                      ],
                    },
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
                "application/zip": {
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
                    definition: { $ref: "#/components/schemas/ReportDefinition" },
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
                    definition: { $ref: "#/components/schemas/ReportDefinition" },
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
                    definition: { $ref: "#/components/schemas/ReportDefinition" },
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
                    definition: { $ref: "#/components/schemas/ReportDefinition" },
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
