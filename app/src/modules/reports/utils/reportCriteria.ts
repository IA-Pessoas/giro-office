import type { ReportArea, ReportComposition, ReportsCatalogSource } from "../types/report.types";
import { getSelectableReportFields } from "./reportBuilder.ts";

export const operatorLabels: Record<string, string> = {
  eq: "é igual a",
  neq: "é diferente de",
  contains: "contém",
  in: "é um destes",
  gt: "é maior que",
  gte: "é maior ou igual a",
  lt: "é menor que",
  lte: "é menor ou igual a",
  between: "está entre",
};
export const summaryLabels: Record<string, string> = {
  count: "Contagem",
  sum: "Soma",
  avg: "Média",
  min: "Mínimo",
  max: "Máximo",
};

function typedValue(value: unknown, type: string, label: string): unknown {
  if (value === undefined || value === null || value === "")
    throw new Error(`Preencha ${label} para continuar.`);
  if (type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Informe um número válido em ${label}.`);
    return number;
  }
  if (type === "boolean") {
    if (value !== true && value !== false && value !== "true" && value !== "false")
      throw new Error(`Escolha Sim ou Não em ${label}.`);
    return value === true || value === "true";
  }
  if (type === "date" && !Number.isFinite(Date.parse(String(value))))
    throw new Error(`Informe uma data válida em ${label}.`);
  return String(value);
}

export function buildReportComposition(
  areas: ReportArea[],
  sources: ReportsCatalogSource[],
): ReportComposition {
  return {
    version: 2,
    areas: areas.map((area) => {
      const source = sources.find((item) => item.key === area.source);
      if (!source) throw new Error("Seu acesso mudou. Confira as áreas disponíveis.");
      const selectableKeys = new Set(getSelectableReportFields(source).map((field) => field.key));
      if (area.fields.some((field) => !selectableKeys.has(field)))
        throw new Error(
          `Um dos campos selecionados em ${source.label} não está mais disponível. Atualize os campos e tente novamente.`,
        );
      const parameterValues: Record<string, unknown> = {};
      if (
        (area.groupBy?.length || area.aggregations?.length) &&
        area.orderBy?.some((item) => !area.groupBy?.includes(item.field))
      )
        throw new Error(
          `Em ${source.label}, remova a ordenação de campos não agrupados em Mais opções.`,
        );
      for (const parameter of source.parameters ?? []) {
        const value = area.parameterValues?.[parameter.key];
        if (!parameter.required && (value === undefined || value === "")) continue;
        parameterValues[parameter.key] = typedValue(
          value,
          parameter.type,
          `${parameter.label} em ${source.label}`,
        );
      }
      return {
        ...area,
        ...(source.parameters?.length ? { parameterValues } : {}),
        filters: (area.filters ?? []).map((filter) => {
          const field = source.fields.find((item) => item.key === filter.field);
          if (!field || !field.operators?.includes(filter.operator))
            throw new Error(`Confira os critérios de ${source.label}.`);
          const list = filter.operator === "in" || filter.operator === "between";
          const values = list
            ? Array.isArray(filter.value)
              ? filter.value
              : String(filter.value)
                  .split(";")
                  .map((item) => item.trim())
            : [filter.value];
          if (filter.operator === "between" && values.length !== 2)
            throw new Error(
              `Informe dois valores separados por ponto e vírgula em ${field.label}.`,
            );
          const parsed = values.map((value) =>
            typedValue(value, field.type, `${field.label} em ${source.label}`),
          );
          return { ...filter, value: list ? parsed : parsed[0] };
        }),
      };
    }),
  };
}
