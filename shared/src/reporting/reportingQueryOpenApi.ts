const name = { type: "string", pattern: "^[a-z][a-z0-9_]*$", maxLength: 64 } as const;
const scalar = {
  anyOf: [
    { type: "string", maxLength: 2048, nullable: true },
    { type: "number", nullable: true },
    { type: "boolean", nullable: true },
  ],
} as const;

export const reportingQueryOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  description:
    "Critérios executados sobre o conjunto autorizado completo antes do limite de saída. Grupos são combinados com AND; filtros fora de grupos também. Capacidade: 50 mil registros/20 MiB; excesso retorna 422, nunca resultado parcial. Leitura em páginas de 100. count conta valores não nulos; outros resumos vazios retornam null. Sem grupos, resumo vazio retorna uma linha; agrupamento vazio retorna nenhuma. Ordenação por campos agrupados nos resumos; nulos ao final em asc e início em desc.",
  properties: {
    filters: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "operator", "parameter", "value"],
        properties: {
          field: name,
          parameter: name,
          operator: {
            type: "string",
            enum: ["eq", "neq", "contains", "in", "gt", "gte", "lt", "lte", "between"],
          },
          value: {
            oneOf: [scalar, { type: "array", maxItems: 100, items: scalar }],
            description:
              "Valor tipado; in recebe lista (vazia não encontra registros), between recebe dois valores inclusivos; eq/neq/in aceitam null. contains é literal e sensível a maiúsculas.",
          },
        },
      },
    },
    filter_groups: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["operator", "filters"],
        properties: {
          operator: { type: "string", enum: ["and", "or"] },
          filters: { type: "array", minItems: 1, maxItems: 100, items: name },
        },
      },
    },
    group_by: { type: "array", maxItems: 25, uniqueItems: true, items: name },
    aggregations: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "function", "alias"],
        properties: {
          field: name,
          function: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
          alias: name,
        },
      },
    },
    order_by: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "direction"],
        properties: { field: name, direction: { type: "string", enum: ["asc", "desc"] } },
      },
    },
  },
} as const;
