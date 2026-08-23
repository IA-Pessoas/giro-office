import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { reportsService } from "../services/reportsService";
import type { ReportsCatalog, ReportsServiceError } from "../types/report.types";
import { reportsCatalogQueryKey } from "./queryKeys";

export function useReportsCatalog(): UseQueryResult<ReportsCatalog, ReportsServiceError> {
  return useFetch(reportsCatalogQueryKey(), () => reportsService.getCatalog());
}
