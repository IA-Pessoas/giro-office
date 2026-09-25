export type ReportValueType = "string" | "number" | "boolean" | "date";

export type ReportsCatalogField = {
  key: string;
  label: string;
  type: ReportValueType;
  selectable?: boolean;
  sensitive?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  groupable?: boolean;
  aggregatable?: boolean;
  operators?: string[];
  aggregationFunctions?: string[];
  capabilities?: {
    selectable?: boolean;
    filterable?: boolean;
    sortable?: boolean;
    groupable?: boolean;
    aggregatable?: boolean;
    operators?: string[];
    aggregationFunctions?: string[];
  };
};

export type ReportJoinType = "inner" | "left";

export type ReportsCatalogRelation = {
  key: string;
  label: string;
  targetSourceKey?: string;
  joinTypes?: ReportJoinType[];
  capabilities?: { joinTypes?: ReportJoinType[] };
};

export type ReportsCatalogParameter = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
};

export type ReportsCatalogSource = {
  key: string;
  label: string;
  module: string;
  department_label?: string;
  description?: string;
  fields: ReportsCatalogField[];
  relations?: ReportsCatalogRelation[];
  parameters?: ReportsCatalogParameter[];
};

export type ReportsCatalog = {
  items: ReportsCatalogSource[];
  letterheads?: {
    personal: ReportLetterheadOption[];
    shared: ReportLetterheadOption[];
  };
};

export type ReportLetterheadOption = {
  id: string;
  label: string;
  kind: "organization" | "department";
  sha256: string;
};

export type ReportLetterheadSelection = { id: string; sha256: string };

export type ReportComposition = {
  version: 2;
  areas: ReportArea[];
  letterhead?: ReportLetterheadSelection;
};

export type ReportRelationship = {
  layout: "grouped_list" | "summary";
  dimensions: string[];
  measures: { key: string; function: "count_rows" | "count" | "sum" | "avg" | "min" | "max"; field?: string }[];
  visibleColumns: string[];
  order?: { key: string; direction: "asc" | "desc" };
};

export type ReportCompositionV3 = {
  version: 3;
  areas: {
    source: string;
    layout: ReportRelationship["layout"];
    dimensions: string[];
    details: string[];
    measures: ReportRelationship["measures"];
    display: { columns: string[]; groupHeadings?: boolean };
    filters?: ReportArea["filters"];
    filterLogic?: ReportArea["filterLogic"];
    parameterValues?: ReportArea["parameterValues"];
    orderBy?: ({ field: string; direction: "asc" | "desc" } | { measure: string; direction: "asc" | "desc" })[];
  }[];
  letterhead?: ReportLetterheadSelection;
};

export type ReportModelDefinition = ReportDefinition | ReportComposition | ReportCompositionV3;

export type ReportArea = {
  source: string;
  fields: string[];
  filters?: { field: string; operator: string; value: unknown }[];
  filterLogic?: "and" | "or";
  parameterValues?: Record<string, unknown>;
  groupBy?: string[];
  aggregations?: { field: string; function: string }[];
  orderBy?: { field: string; direction: "asc" | "desc" }[];
  relationship?: ReportRelationship;
};
export type ReportCompositionPreview = {
  blocks: (ReportPreviewResult & { source: string; label: string; layout?: "grouped_list" | "summary"; dimensions?: string[] })[];
};

export type ReportsServiceError = {
  message: string;
  status?: number;
};

export type ReportFilterLogic = "and" | "or";
export type ReportFilter = { id?: string; fieldKey: string; operator: string; value: unknown };
export type ReportAggregation = { fieldKey: string; function: string };
export type ReportSort = { fieldKey: string; direction: "asc" | "desc" };

export type ReportDefinition = {
  letterhead?: ReportLetterheadSelection;
  sources: string[];
  columns: { source: string; field: string; alias: string }[];
  joins: { relation: string; type: ReportJoinType }[];
  filters: { source: string; field: string; operator: string; parameter: string }[];
  filter_groups: { operator: ReportFilterLogic; filters: string[] }[];
  parameters: { name: string; type: ReportValueType }[];
  aggregations: { source: string; field: string; function: string; alias?: string }[];
  group_by?: { source: string; field: string }[];
  order_by: { source: string; field: string; direction: "asc" | "desc" }[];
};

export type ReportBuilderState = {
  sourceKey: string;
  relation?: { key: string; joinType: ReportJoinType; targetSourceKey?: string };
  fieldKeys: string[];
  filterLogic: ReportFilterLogic;
  filters: ReportFilter[];
  parameters: Record<string, unknown>;
  groupBy: string[];
  aggregations: ReportAggregation[];
  orderBy: ReportSort[];
  limit: number;
};

export type ReportPreviewPayload = {
  definition: ReportDefinition;
  parameterValues?: Record<string, unknown>;
};

export type ReportPreviewColumn = { key: string; label: string; hidden?: boolean };
export type ReportPreviewResult = {
  columns: ReportPreviewColumn[];
  rows: Record<string, unknown>[];
  limit: number;
  hasMore: boolean;
};
export type ReportResultBlock = {
  source: string;
  label: string;
  columns: ReportPreviewColumn[];
  rows: Record<string, unknown>[];
  layout?: "grouped_list" | "summary";
  dimensions?: string[];
  hasMore?: boolean;
};
export type ReportSnapshotBlock = {
  source: string;
  label: string;
  columns: ReportPreviewColumn[];
  rowCount: number;
  rows: Array<{ row_number: number; values: Record<string, unknown> }>;
  nextCursor: number | null;
  layout?: "grouped_list" | "summary";
  dimensions?: string[];
};
export type ReportJob = {
  id: string;
  status: ReportJobStatus;
  error_message?: string | null;
};

export type ReportModel = {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  version: number;
  version_id?: string;
  definition: ReportModelDefinition;
  created_by_user_id?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
};

export type SharedReportModel = ReportModel & {
  department_id: string;
  grant?: { sources: Record<string, string[]>; relations: string[] };
};

export const REPORT_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "cancelled",
  "failed",
  "expired",
  "deleted",
] as const;

export type ReportJobStatus = (typeof REPORT_JOB_STATUSES)[number];

export type ReportHistoryItem = {
  id: string;
  report_model_version_id: string;
  requester_id: string;
  status: ReportJobStatus;
  requested_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  expires_at?: string | null;
  model_name?: string | null;
  model_version?: number | null;
  author_name?: string | null;
  error_message?: string | null;
};

export type ReportHistoryPage = { items: ReportHistoryItem[]; nextCursor: number | null };
export type ReportSnapshotPage = {
  snapshot: { id: string; created_at: string };
  rows: Array<{ row_number: number; values: Record<string, unknown> }>;
  nextCursor: number | null;
  blocks?: ReportSnapshotBlock[];
};
export type ReportDownloadResult = { blob: Blob; filename: string; mimeType: string };
export type ReportHistoryScope = "personal" | "library";
export type ReportExportFormat = "pdf" | "csv" | "xlsx";
