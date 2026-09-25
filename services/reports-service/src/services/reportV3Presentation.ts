import type { ReportCatalogSource } from "../catalog/types.js";
import type { ReportCompositionV3 } from "../schemas/reportComposition.schemas.js";

type Area = ReportCompositionV3["areas"][number];

export function v3Columns(
  area: Area,
  source: ReportCatalogSource,
  includeHiddenGroups = false,
): Array<{ key: string; label: string; hidden?: boolean; exportable?: boolean }> {
  const labels: Record<string, string> = {
    count_rows: "Contagem de registros",
    count: "Contagem",
    sum: "Soma",
    avg: "Média",
    min: "Mínimo",
    max: "Máximo",
  };
  const visible = new Set(area.display.columns);
  const keys = [
    ...(includeHiddenGroups && area.layout === "grouped_list" ? area.dimensions : []),
    ...area.display.columns,
    ...area.dimensions,
    ...area.details,
    ...area.measures.map((item) => item.key),
  ];
  return [...new Set(keys)].map((key) => {
    const measure = area.measures.find((item) => item.key === key);
    const field = source.fields.find((item) => item.key === (measure?.field ?? key));
    return {
      key,
      ...(!visible.has(key) ? { hidden: true } : {}),
      ...(includeHiddenGroups &&
      area.layout === "grouped_list" &&
      area.dimensions.includes(key) &&
      !visible.has(key)
        ? { exportable: true }
        : {}),
      label: measure
        ? measure.function === "count_rows"
          ? labels.count_rows
          : `${labels[measure.function]} de ${field?.label ?? "campo"}`
        : includeHiddenGroups &&
            area.layout === "grouped_list" &&
            area.dimensions.includes(key) &&
            !visible.has(key)
          ? `Grupo: ${field?.label ?? key}`
          : (field?.label ?? key),
    };
  });
}

export function v3Rows(
  area: Area,
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const keys = new Set([
    ...area.dimensions,
    ...area.details,
    ...area.measures.map((item) => item.key),
  ]);
  return rows.map((row) => Object.fromEntries([...keys].map((key) => [key, row[key] ?? null])));
}
