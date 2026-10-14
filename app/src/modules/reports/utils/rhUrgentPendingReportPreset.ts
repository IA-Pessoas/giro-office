import type { ReportArea, ReportsCatalogSource } from "../types/report.types";
import { getReportFieldOperators, getSelectableReportFields } from "./reportBuilder.ts";

const reportFields = ["title", "category", "urgency", "status", "created_at"];

export function getRhUrgentPendingReportPreset(
  sources: readonly ReportsCatalogSource[],
): { id: string; label: string; description: string; areas: ReportArea[] } | null {
  const source = sources.find((item) => item.key === "rh.requests");
  if (!source) return null;

  const fields = new Map(getSelectableReportFields(source).map((field) => [field.key, field]));
  if (
    !reportFields.every((key) => fields.has(key)) ||
    !(fields.get("urgency")?.filterable || fields.get("urgency")?.capabilities?.filterable) ||
    !(fields.get("status")?.filterable || fields.get("status")?.capabilities?.filterable) ||
    !getReportFieldOperators(fields.get("urgency")!).includes("eq") ||
    !getReportFieldOperators(fields.get("status")!).includes("in")
  ) {
    return null;
  }

  return {
    id: "rh-urgent-pending",
    label: "Solicitações urgentes pendentes",
    description: "Solicitações de alta urgência ainda novas ou em andamento.",
    areas: [
      {
        source: source.key,
        fields: reportFields,
        filters: [
          { field: "urgency", operator: "eq", value: "High" },
          { field: "status", operator: "in", value: ["New", "In_Progress"] },
        ],
      },
    ],
  };
}
