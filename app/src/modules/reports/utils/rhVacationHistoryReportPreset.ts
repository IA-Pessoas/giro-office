import type { ReportArea, ReportsCatalogSource } from "../types/report.types";
import { getSelectableReportFields } from "./reportBuilder.ts";

const reportFields = [
  "employee_name",
  "acquisition_start",
  "acquisition_end",
  "period_start",
  "period_end",
  "uses",
];

export function getRhVacationHistoryReportPreset(
  sources: readonly ReportsCatalogSource[],
): { id: string; label: string; description: string; areas: ReportArea[] } | null {
  const source = sources.find((item) => item.key === "rh.vacationHistory");
  if (!source) return null;

  const fields = new Set(getSelectableReportFields(source).map((field) => field.key));
  if (!reportFields.every((key) => fields.has(key))) return null;

  return {
    id: "rh-vacation-history",
    label: "Histórico de férias por colaborador",
    description: "Consulte os períodos aquisitivos e os usos registrados por colaborador.",
    areas: [{ source: source.key, fields: reportFields }],
  };
}
