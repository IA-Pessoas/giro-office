import type { ReportArea, ReportComposition, ReportCompositionV3, ReportRelationship, ReportsCatalogSource } from "../types/report.types";
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
  count_rows: "Contagem de registros",
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
      const { relationship: _relationship, ...reportArea } = area;
      const source = sources.find((item) => item.key === area.source);
      if (!source) throw new Error("Seu acesso mudou. Confira as áreas disponíveis.");
      const selectableKeys = new Set(getSelectableReportFields(source).map((field) => field.key));
      if (area.fields.some((field) => !selectableKeys.has(field)))
        throw new Error(
          `Um dos campos selecionados em ${source.label} não está mais disponível. Atualize os campos e tente novamente.`,
        );
      const selectedFields = new Set(area.fields);
      const aggregations = area.aggregations?.filter((aggregation) =>
        selectedFields.has(aggregation.field),
      );
      const parameterValues: Record<string, unknown> = {};
      if (
        (area.groupBy?.length || aggregations?.length) &&
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
        ...reportArea,
        ...(aggregations ? { aggregations } : {}),
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

export function defaultRelationship(area: ReportArea, source: ReportsCatalogSource): ReportRelationship {
  const sortableGroup = area.fields.find((key) => {
    const field = source.fields.find((item) => item.key === key);
    return field?.groupable && field.sortable;
  });
  const dimensions = sortableGroup ? [sortableGroup] : area.fields.filter((key) => source.fields.find((field) => field.key === key)?.groupable).slice(0, 1);
  const details = area.fields.filter((key) => !dimensions.includes(key));
  const layout = details.length && sortableGroup ? "grouped_list" : "summary";
  return {
    layout,
    dimensions,
    measures: [{ key: "report_total", function: "count_rows" }],
    visibleColumns: layout === "grouped_list" ? area.fields : [...dimensions, "report_total"],
  };
}

export function buildReportCompositionV3(
  areas: ReportArea[],
  sources: ReportsCatalogSource[],
): ReportCompositionV3 {
  const normalized = buildReportComposition(areas.map((area) => ({ ...area, groupBy: [], aggregations: [], orderBy: [] })), sources);
  return {
    version: 3,
    areas: normalized.areas.map((area, index) => {
      const source = sources.find((item) => item.key === area.source)!;
      const settings = areas[index].relationship ?? defaultRelationship(areas[index], source);
      const dimensions = settings.dimensions.filter((key) => area.fields.includes(key));
      const details = settings.layout === "grouped_list"
        ? area.fields.filter((key) => !dimensions.includes(key)) : [];
      const measures = settings.layout === "summary"
        ? settings.measures.filter((item) => item.function === "count_rows" || (item.field !== undefined && area.fields.includes(item.field)))
        : [];
      if (!dimensions.length || (settings.layout === "grouped_list" && !details.length) ||
        (settings.layout === "summary" && !measures.length)) {
        throw new Error(`Defina dimensões e ${settings.layout === "summary" ? "medidas" : "detalhes"} em ${source.label}.`);
      }
      const available = new Set([...dimensions, ...details, ...measures.map((item) => item.key)]);
      const columns = settings.visibleColumns.filter((key) => available.has(key));
      if (!columns.length) throw new Error(`Escolha ao menos uma coluna visível em ${source.label}.`);
      if (settings.layout === "grouped_list" && !details.some((key) => columns.includes(key)))
        throw new Error(`Mostre ao menos um detalhe na lista por grupo de ${source.label}.`);
      const orderBy = settings.order && available.has(settings.order.key)
        ? [measures.some((item) => item.key === settings.order?.key)
          ? { measure: settings.order.key, direction: settings.order.direction }
          : { field: settings.order.key, direction: settings.order.direction }]
        : undefined;
      return {
        source: area.source,
        layout: settings.layout,
        dimensions,
        details,
        measures,
        display: { columns, ...(settings.layout === "grouped_list" ? { groupHeadings: true } : {}) },
        filters: area.filters,
        filterLogic: area.filterLogic,
        parameterValues: area.parameterValues,
        orderBy,
      };
    }),
  };
}
