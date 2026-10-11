import {
  CONTABIL_CONTROL_REPORTING_SOURCES,
  contabilControlReportingCatalog,
} from "./contabilControlReportingCatalog.js";
import {
  CONTABIL_RELATIONSHIP_REPORTING_SOURCES,
  contabilRelationshipReportingCatalog,
} from "./contabilRelationshipReportingCatalog.js";
import {
  CONTABIL_RESPONSIBLES_REPORTING_SOURCES,
  contabilResponsiblesReportingCatalog,
} from "./contabilResponsiblesReportingCatalog.js";
import {
  CONTABIL_TRIAGE_REPORTING_SOURCES,
  contabilTriageReportingCatalog,
} from "./contabilTriageReportingCatalog.js";

export const CONTABIL_REPORTING_SOURCES = [
  ...CONTABIL_CONTROL_REPORTING_SOURCES,
  ...CONTABIL_RESPONSIBLES_REPORTING_SOURCES,
  ...CONTABIL_RELATIONSHIP_REPORTING_SOURCES,
  ...CONTABIL_TRIAGE_REPORTING_SOURCES,
] as const;
export type ContabilReportingSource = (typeof CONTABIL_REPORTING_SOURCES)[number];

export const contabilReportingCatalog = {
  sources: [
    ...contabilControlReportingCatalog.sources,
    ...contabilResponsiblesReportingCatalog.sources,
    ...contabilRelationshipReportingCatalog.sources,
    ...contabilTriageReportingCatalog.sources,
  ],
  relations: [],
} as const;

export function getContabilReportingFields(source: ContabilReportingSource): readonly string[] {
  return (
    contabilReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
