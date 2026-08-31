import { rhAttendanceReportingCatalog, rhRequestReportingCatalog } from "@workspace/shared";

export const RH_REPORTING_SOURCES = ["rh.requests", "rh.attendance"] as const;
export type RhReportingSource = (typeof RH_REPORTING_SOURCES)[number];

export const rhReportingCatalog = {
  sources: [...rhRequestReportingCatalog.sources, ...rhAttendanceReportingCatalog.sources],
  relations: [],
} as const;

export function getRhReportingFields(source: RhReportingSource): readonly string[] {
  return (
    rhReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
