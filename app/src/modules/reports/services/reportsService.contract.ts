import type { ReportsCatalog, ReportsCatalogField, ReportsCatalogSource, ReportsServiceError } from "../types/report.types";

export const REPORTS_ENDPOINTS = {
  catalog: "/reports/catalog",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportsError(): ReportsServiceError {
  return { message: "Não foi possível carregar relatórios agora." };
}

function isCatalogField(value: unknown): value is ReportsCatalogField {
  return isRecord(value) && typeof value.key === "string" && typeof value.label === "string";
}

function isCatalogSource(value: unknown): value is ReportsCatalogSource {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    typeof value.module === "string" &&
    Array.isArray(value.fields) &&
    value.fields.every(isCatalogField)
  );
}

export function unwrapReportsEnvelope<T>(body: unknown): T {
  if (isRecord(body) && body.success === true && "data" in body) {
    return body.data as T;
  }

  if (isRecord(body) && body.success === false) {
    throw reportsError();
  }

  return body as T;
}

export function unwrapReportsCatalogEnvelope(body: unknown): ReportsCatalog {
  const catalog = unwrapReportsEnvelope<unknown>(body);

  if (!isRecord(catalog) || !Array.isArray(catalog.items) || !catalog.items.every(isCatalogSource)) {
    throw reportsError();
  }

  return { items: catalog.items };
}

export function normalizeReportsError(error: unknown): ReportsServiceError {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
  const status = typeof response?.status === "number" ? response.status : undefined;

  return {
    message: "Não foi possível carregar relatórios agora.",
    ...(status === undefined ? {} : { status }),
  };
}

export async function fetchReportsCatalog(
  request: (path: string) => Promise<{ data: unknown }>,
): Promise<ReportsCatalog> {
  try {
    const response = await request(REPORTS_ENDPOINTS.catalog);
    return unwrapReportsCatalogEnvelope(response.data);
  } catch (error) {
    throw normalizeReportsError(error);
  }
}
