import {
  getRhVacationReportingFields as getSharedRhVacationReportingFields,
  RH_VACATION_REPORTING_SOURCES,
  rhVacationReportingCatalog,
} from "@workspace/shared";

export const RH_VACATION_REPORTING_SOURCES_LOCAL = RH_VACATION_REPORTING_SOURCES;
export type RhVacationReportingSource = (typeof RH_VACATION_REPORTING_SOURCES_LOCAL)[number];

export { rhVacationReportingCatalog };

export function getRhVacationReportingFields(source: RhVacationReportingSource): readonly string[] {
  return getSharedRhVacationReportingFields(source);
}
