import { certificatePfReportingCatalog } from "./certificatePfReportingCatalog.js";
import { certificatePjReportingCatalog } from "./certificatePjReportingCatalog.js";
import { clientIntegrationReportingCatalog } from "./clientIntegrationReportingCatalog.js";
import { contabilControlReportingCatalog } from "./contabilControlReportingCatalog.js";
import { contabilRelationshipReportingCatalog } from "./contabilRelationshipReportingCatalog.js";
import { contabilResponsiblesReportingCatalog } from "./contabilResponsiblesReportingCatalog.js";
import { fiscalIcmsReportingCatalog } from "./fiscalIcmsReportingCatalog.js";
import { fiscalIpiReportingCatalog } from "./fiscalIpiReportingCatalog.js";
import { fiscalNcmReportingCatalog } from "./fiscalNcmReportingCatalog.js";
import { parcelamentoReportingCatalog } from "./parcelamentoReportingCatalog.js";
import { pessoalLddReportingCatalog } from "./pessoalLddReportingCatalog.js";
import { pessoalObligationsReportingCatalog } from "./pessoalObligationsReportingCatalog.js";
import { pessoalPayrollReportingCatalog } from "./pessoalPayrollReportingCatalog.js";
import { pessoalSituationsReportingCatalog } from "./pessoalSituationsReportingCatalog.js";
import { pessoalUnionsReportingCatalog } from "./pessoalUnionsReportingCatalog.js";
import { projectReportingCatalog } from "./projectReportingCatalog.js";
import { regularizeLicenseReportingCatalog } from "./regularizeLicenseReportingCatalog.js";
import { regularizeMunicipalTaxesReportingCatalog } from "./regularizeMunicipalTaxesReportingCatalog.js";
import { regularizeProcessReportingCatalog } from "./regularizeProcessReportingCatalog.js";
import { rhAttendanceReportingCatalog } from "./rhAttendanceReportingCatalog.js";
import { rhHolidayReportingCatalog } from "./rhHolidayReportingCatalog.js";
import { rhRequestReportingCatalog } from "./rhRequestReportingCatalog.js";
import { taskReportingCatalog } from "./taskReportingCatalog.js";
import { tiExtensionsReportingCatalog } from "./tiExtensionsReportingCatalog.js";
import { tiInventoryReportingCatalog } from "./tiInventoryReportingCatalog.js";
import { tiRequestsReportingCatalog } from "./tiRequestsReportingCatalog.js";
import { tiStockReportingCatalog } from "./tiStockReportingCatalog.js";

export const reportingSources = [
  ...certificatePfReportingCatalog.sources,
  ...certificatePjReportingCatalog.sources,
  ...clientIntegrationReportingCatalog.sources,
  ...contabilControlReportingCatalog.sources,
  ...contabilRelationshipReportingCatalog.sources,
  ...contabilResponsiblesReportingCatalog.sources,
  ...fiscalIcmsReportingCatalog.sources,
  ...fiscalIpiReportingCatalog.sources,
  ...fiscalNcmReportingCatalog.sources,
  ...parcelamentoReportingCatalog.sources,
  ...pessoalLddReportingCatalog.sources,
  ...pessoalObligationsReportingCatalog.sources,
  ...pessoalPayrollReportingCatalog.sources,
  ...pessoalSituationsReportingCatalog.sources,
  ...pessoalUnionsReportingCatalog.sources,
  ...projectReportingCatalog.sources,
  ...regularizeLicenseReportingCatalog.sources,
  ...regularizeMunicipalTaxesReportingCatalog.sources,
  ...regularizeProcessReportingCatalog.sources,
  ...rhAttendanceReportingCatalog.sources,
  ...rhHolidayReportingCatalog.sources,
  ...rhRequestReportingCatalog.sources,
  ...taskReportingCatalog.sources,
  ...tiExtensionsReportingCatalog.sources,
  ...tiInventoryReportingCatalog.sources,
  ...tiRequestsReportingCatalog.sources,
  ...tiStockReportingCatalog.sources,
] as const;
