import type { ReportArea, ReportsCatalogSource } from "../types/report.types";

export function getTaskDepartmentReportPreset(
  sources: readonly ReportsCatalogSource[],
): { label: string; description: string; areas: ReportArea[] } | null {
  const source = sources.find((item) => item.key === "integracao.tasks");
  const department = source?.fields.find((field) => field.key === "department");
  if (
    !department ||
    department.selectable === false ||
    department.sensitive === true ||
    !department.groupable ||
    !department.aggregationFunctions?.includes("count")
  ) return null;

  return {
    label: "Quantidade de tarefas por departamento",
    description: "Conta as tarefas pelo departamento ao qual estão vinculadas.",
    areas: [
      {
        source: source.key,
        fields: ["department"],
        groupBy: ["department"],
        aggregations: [{ field: "department", function: "count" }],
      },
    ],
  };
}
