import {
  RH_ATTENDANCE_REPORTING_SOURCES,
  RH_EMPLOYEE_REPORTING_SOURCES,
  RH_HOLIDAY_REPORTING_SOURCES,
  RH_REQUEST_REPORTING_SOURCES,
  RH_VACATION_REPORTING_SOURCES,
  rhAttendanceReportingCatalog,
  rhEmployeeReportingCatalog,
  rhHolidayReportingCatalog,
  rhRequestReportingCatalog,
  rhVacationReportingCatalog,
} from "@workspace/shared";

export const RH_REPORTING_SOURCES = [
  ...RH_REQUEST_REPORTING_SOURCES,
  ...RH_ATTENDANCE_REPORTING_SOURCES,
  ...RH_EMPLOYEE_REPORTING_SOURCES,
  ...RH_HOLIDAY_REPORTING_SOURCES,
  ...RH_VACATION_REPORTING_SOURCES,
] as const;
export type RhReportingSource = (typeof RH_REPORTING_SOURCES)[number];

export const rhReportingCatalog = {
  sources: [
    ...rhRequestReportingCatalog.sources,
    ...rhAttendanceReportingCatalog.sources,
    ...rhEmployeeReportingCatalog.sources,
    ...rhHolidayReportingCatalog.sources,
    ...rhVacationReportingCatalog.sources,
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
