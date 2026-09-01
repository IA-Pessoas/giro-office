import {
  PESSOAL_LDD_REPORTING_SOURCES,
  PESSOAL_OBLIGATIONS_REPORTING_SOURCES,
  PESSOAL_PAYROLL_REPORTING_SOURCES,
  PESSOAL_SITUATIONS_REPORTING_SOURCES,
  PESSOAL_UNIONS_REPORTING_SOURCES,
  type PessoalLddReportingSource,
  type PessoalObligationsReportingSource,
  type PessoalPayrollReportingSource,
  type PessoalSituationsReportingSource,
  type PessoalUnionsReportingSource,
  pessoalLddReportingCatalog,
  pessoalObligationsReportingCatalog,
  pessoalPayrollReportingCatalog,
  pessoalSituationsReportingCatalog,
  pessoalUnionsReportingCatalog,
} from "@workspace/shared";

export const PESSOAL_REPORTING_SOURCES = [
  ...PESSOAL_LDD_REPORTING_SOURCES,
  ...PESSOAL_PAYROLL_REPORTING_SOURCES,
  ...PESSOAL_SITUATIONS_REPORTING_SOURCES,
  ...PESSOAL_OBLIGATIONS_REPORTING_SOURCES,
  ...PESSOAL_UNIONS_REPORTING_SOURCES,
] as const;
export type PessoalReportingSource =
  | PessoalLddReportingSource
  | PessoalPayrollReportingSource
  | PessoalSituationsReportingSource
  | PessoalUnionsReportingSource
  | PessoalObligationsReportingSource;

export const pessoalReportingCatalog = {
  sources: [
    ...pessoalLddReportingCatalog.sources,
    ...pessoalPayrollReportingCatalog.sources,
    ...pessoalSituationsReportingCatalog.sources,
    ...pessoalObligationsReportingCatalog.sources,
    ...pessoalUnionsReportingCatalog.sources,
  ],
  relations: [],
} as const;

export function getPessoalReportingFields(source: PessoalReportingSource): readonly string[] {
  return (
    pessoalReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
