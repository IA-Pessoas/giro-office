import {
  RH_ATTENDANCE_REPORTING_SOURCES,
  RH_HOLIDAY_REPORTING_SOURCES,
  RH_REQUEST_REPORTING_SOURCES,
  rhAttendanceReportingCatalog,
  rhHolidayReportingCatalog,
  rhRequestReportingCatalog,
} from "@workspace/shared";

export const RH_REPORTING_SOURCES = [
  ...RH_REQUEST_REPORTING_SOURCES,
  ...RH_ATTENDANCE_REPORTING_SOURCES,
  ...RH_HOLIDAY_REPORTING_SOURCES,
] as const;
export type RhReportingSource = (typeof RH_REPORTING_SOURCES)[number];

export const rhReportingCatalog = {
  sources: [
    ...rhRequestReportingCatalog.sources,
    ...rhAttendanceReportingCatalog.sources,
    ...rhHolidayReportingCatalog.sources,
  ],
  relations: [],
} as const;

export function getRhReportingFields(source: RhReportingSource): readonly string[] {
  return (
    rhReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
