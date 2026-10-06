import type { ReportArea, ReportsCatalogSource } from "../types/report.types";
import { isReportFieldSelectable } from "./reportBuilder.ts";

export function getTaskDepartmentReportPreset(
  sources: readonly ReportsCatalogSource[],
): { id: string; label: string; description: string; areas: ReportArea[] } | null {
  const source = sources.find((item) => item.key === "integracao.tasks");
  const department = source?.fields.find((field) => field.key === "department");
  if (
    !department ||
    !isReportFieldSelectable(department) ||
    !(department.groupable === true || department.capabilities?.groupable === true) ||
    !(department.aggregationFunctions ?? department.capabilities?.aggregationFunctions)?.includes("count")
  ) return null;

  return {
    id: "integracao-tarefas-por-departamento",
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
