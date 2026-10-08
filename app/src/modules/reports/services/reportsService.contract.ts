import type {
  ReportPreviewPayload,
  ReportPreviewResult,
  ReportCompositionPreview,
  ReportDownloadResult,
  ReportJob,
  ReportHistoryPage,
  ReportsCatalog,
  ReportsCatalogField,
  ReportsCatalogSource,
  ReportsServiceError,
} from "../types/report.types";

export const REPORTS_ENDPOINTS = {
  catalog: "/reports/catalog",
  preview: "/reports/preview",
  models: "/reports/models/list",
  sharedModels: "/reports/models/shared/list",
  createModel: "/reports/models",
  createSharedModel: "/reports/models/shared",
  jobs: "/reports/jobs/list",
  createJob: "/reports/jobs",
  job: (id: string) => `/reports/jobs/${id}`,
  cancelJob: (id: string) => `/reports/jobs/${id}/cancel`,
  snapshot: (id: string) => `/reports/jobs/${id}/snapshot`,
  download: (id: string) => `/reports/snapshots/${id}/export`,
  model: (id: string) => `/reports/models/${id}`,
  sharedModel: (id: string) => `/reports/models/shared/${id}`,
  copySharedModel: (id: string) => `/reports/models/shared/${id}/copy`,
  previewSharedModel: (id: string) => `/reports/models/shared/${id}/preview`,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportsError(): ReportsServiceError {
  return { message: "Não foi possível carregar relatórios agora." };
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function normalizeCatalogField(value: unknown): ReportsCatalogField | undefined {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.label !== "string") {
    return undefined;
  }

  const type = value.type ?? value.value_type;
  const operators = asStringArray(value.operators ?? value.filter_operators);
  const aggregationFunctions = asStringArray(value.aggregationFunctions ?? value.aggregations);
  if (
    !["string", "number", "boolean", "date"].includes(String(type)) ||
    !operators ||
    !aggregationFunctions
  ) {
    return undefined;
  }

  const publishedByCatalog =
    value.selectable === true ||
    (value.value_type !== undefined &&
      value.filter_operators !== undefined &&
      value.aggregations !== undefined);

  return {
    key: value.key,
    label: value.label,
    type: type as ReportsCatalogField["type"],
    selectable: publishedByCatalog && value.selectable !== false,
    sensitive: value.sensitive === true,
    filterable: value.filterable === true || operators.length > 0,
    sortable: value.sortable === true,
    groupable: value.groupable === true,
    aggregatable: value.aggregatable === true || aggregationFunctions.length > 0,
    operators,
    aggregationFunctions,
  };
}

function isCatalogSource(value: unknown): value is ReportsCatalogSource {
  if (
    !isRecord(value) ||
    typeof value.key !== "string" ||
    typeof value.label !== "string" ||
    typeof value.module !== "string" ||
    !Array.isArray(value.fields)
  ) {
    return false;
  }

  return value.fields.every((field) => normalizeCatalogField(field) !== undefined);
}

function normalizeCatalogSource(value: Record<string, unknown>): ReportsCatalogSource {
  const rawFields = Array.isArray(value.fields) ? value.fields : [];
  const fields = rawFields
    .map(normalizeCatalogField)
    .filter((field): field is ReportsCatalogField => Boolean(field));

  return {
    key: value.key as string,
    label: value.label as string,
    module: value.module as string,
    ...(typeof value.department_label === "string"
      ? { department_label: value.department_label }
      : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    fields,
    ...(Array.isArray(value.relations)
      ? { relations: value.relations as ReportsCatalogSource["relations"] }
      : {}),
    ...(Array.isArray(value.parameters)
      ? { parameters: value.parameters as ReportsCatalogSource["parameters"] }
      : {}),
  };
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

  if (
    !isRecord(catalog) ||
    !Array.isArray(catalog.items) ||
    !catalog.items.every(isCatalogSource)
  ) {
    throw reportsError();
  }

  return {
    items: catalog.items.map((source) => normalizeCatalogSource(source as Record<string, unknown>)),
    ...(isRecord(catalog.letterheads) ? { letterheads: {
      personal: normalizeLetterheadOptions(catalog.letterheads.personal),
      shared: normalizeLetterheadOptions(catalog.letterheads.shared),
    } } : {}),
  };
}

function normalizeLetterheadOptions(value: unknown): NonNullable<ReportsCatalog["letterheads"]>["personal"] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => isRecord(item) && typeof item.id === "string" && typeof item.label === "string" &&
    (item.kind === "organization" || item.kind === "department") && typeof item.sha256 === "string")
    .map((item) => ({ id: item.id as string, label: item.label as string,
      kind: item.kind as "organization" | "department", sha256: item.sha256 as string }));
}

export function normalizeReportsError(error: unknown): ReportsServiceError {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
  const status = typeof response?.status === "number" ? response.status : undefined;

  return {
    message: "Não foi possível carregar relatórios agora.",
    ...(status === undefined ? {} : { status }),
  };
}

export function normalizeReportsPreviewError(error: unknown): ReportsServiceError {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
  const status = typeof response?.status === "number" ? response.status : undefined;

  return {
    message: "Não foi possível gerar a prévia agora.",
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

function isPreviewResult(value: unknown): value is {
  rows: Record<string, unknown>[];
  presentation: { columns: { key: string; label: string }[] };
  limit: number;
  hasMore: boolean;
} {
  return (
    isRecord(value) &&
    isRecord(value.presentation) &&
    Array.isArray(value.presentation.columns) &&
    value.presentation.columns.every(
      (column) =>
        isRecord(column) && typeof column.key === "string" && typeof column.label === "string",
    ) &&
    Array.isArray(value.rows) &&
    value.rows.every(isRecord) &&
    typeof value.limit === "number" &&
    typeof value.hasMore === "boolean"
  );
}

export function unwrapReportsPreviewEnvelope(body: unknown): ReportPreviewResult {
  const result = unwrapReportsEnvelope<unknown>(body);
  if (!isPreviewResult(result)) {
    throw normalizeReportsPreviewError(undefined);
  }
  return {
    columns: result.presentation.columns,
    rows: result.rows,
    limit: result.limit,
    hasMore: result.hasMore,
  };
}

export function unwrapReportCompositionPreview(body: unknown): ReportCompositionPreview {
  const result = unwrapReportsEnvelope<unknown>(body);
  if (
    !isRecord(result) ||
    !Array.isArray(result.blocks) ||
    !result.blocks.every(
      (block) =>
        isRecord(block) &&
        typeof block.source === "string" &&
        typeof block.label === "string" &&
        isPreviewResult(block),
    )
  )
    throw reportsError();
  return {
    blocks: result.blocks.map((block) => ({
      ...unwrapReportsPreviewEnvelope(block),
      source: block.source,
      label: block.label,
      ...(block.layout === "grouped_list" || block.layout === "summary" ? { layout: block.layout } : {}),
      ...(asStringArray(block.dimensions) ? { dimensions: asStringArray(block.dimensions) } : {}),
    })),
  };
}

export function buildReportJobListParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      return typeof value !== "string" || value.trim().length > 0;
    }),
  );
}

export function unwrapReportJobListEnvelope(body: unknown): ReportHistoryPage {
  const payload = unwrapReportsEnvelope<unknown>(body);
  if (!isRecord(payload) || !Array.isArray(payload.items)) throw reportsError();
  return {
    items: payload.items as ReportHistoryPage["items"],
    nextCursor: typeof payload.nextCursor === "number" ? payload.nextCursor : null,
  };
}

export function unwrapReportJobEnvelope(body: unknown): ReportJob {
  const payload = unwrapReportsEnvelope<unknown>(body);
  if (
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    typeof payload.status !== "string"
  ) {
    throw reportsError();
  }
  const job: ReportJob = {
    id: payload.id,
    status: payload.status as ReportJob["status"],
  };
  const errorMessage = payload.error_message;
  if (errorMessage === null || typeof errorMessage === "string") {
    job.error_message = errorMessage as string | null;
  }
  return job;
}

export function parseReportFilename(header: string | undefined, fallback: string): string {
  const encoded = header?.match(/filename\*=(?:UTF-8''|utf-8'')([^;]+)/i)?.[1];
  const quoted = header?.match(/filename="([^"]+)"/i)?.[1];
  const raw = encoded ?? quoted ?? header?.match(/filename=([^;]+)/i)?.[1];
  if (!raw) return fallback;
  let filename = raw.trim().replace(/^"|"$/g, "");
  if (encoded) {
    try {
      filename = decodeURIComponent(filename);
    } catch {
      filename = raw.trim().replace(/^"|"$/g, "");
    }
  }
  return (
    filename
      .split(/[\\/]/u)
      .pop()
      ?.replace(/[\u0000-\u001f<>:"|?*]/gu, "_") || fallback
  );
}

export function unwrapReportDownload(
  blob: Blob,
  headers: Record<string, string | undefined>,
  fallbackFilename: string,
  fallbackMimeType = "application/octet-stream",
): ReportDownloadResult {
  return {
    blob,
    filename: parseReportFilename(headers["content-disposition"], fallbackFilename),
    mimeType: headers["content-type"] ?? blob.type ?? fallbackMimeType,
  };
}

export async function fetchReportsPreview(
  request: (path: string, payload: ReportPreviewPayload) => Promise<{ data: unknown }>,
  payload: ReportPreviewPayload,
): Promise<ReportPreviewResult> {
  try {
    const response = await request(REPORTS_ENDPOINTS.preview, payload);
    return unwrapReportsPreviewEnvelope(response.data);
  } catch (error) {
    throw normalizeReportsPreviewError(error);
  }
}
