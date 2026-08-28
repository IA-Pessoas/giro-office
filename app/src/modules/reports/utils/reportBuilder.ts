import type {
  ReportAggregation,
  ReportBuilderState,
  ReportFilter,
  ReportPreviewResult,
  ReportSort,
  ReportsCatalogField,
  ReportsCatalogRelation,
  ReportsCatalogSource,
  ReportDefinition,
  ReportJoinType,
  ReportValueType,
} from "../types/report.types";

const DEFAULT_PREVIEW_LIMIT = 100;

function hasCapability(
  field: ReportsCatalogField,
  capability: keyof NonNullable<ReportsCatalogField["capabilities"]>,
) {
  return field.capabilities?.[capability] === true;
}

export function isReportFieldSelectable(field: ReportsCatalogField): boolean {
  return field.selectable === true && field.sensitive !== true;
}

export function getSelectableReportFields(source: ReportsCatalogSource): ReportsCatalogField[] {
  return source.fields.filter(isReportFieldSelectable);
}

export function getReportFieldOperators(field: ReportsCatalogField): string[] {
  if (!isReportFieldSelectable(field)) return [];
  return field.operators ?? field.capabilities?.operators ?? [];
}

function canFilter(field: ReportsCatalogField): boolean {
  return field.filterable === true || hasCapability(field, "filterable");
}

function canSort(field: ReportsCatalogField): boolean {
  return field.sortable === true || hasCapability(field, "sortable");
}

function canGroup(field: ReportsCatalogField): boolean {
  return field.groupable === true || hasCapability(field, "groupable");
}

function getRelationJoinTypes(relation: ReportsCatalogRelation): ReportJoinType[] {
  return relation.joinTypes ?? relation.capabilities?.joinTypes ?? [];
}

function getAggregationFunctions(field: ReportsCatalogField): string[] {
  return field.aggregationFunctions ?? field.capabilities?.aggregationFunctions ?? [];
}

function getField(source: ReportsCatalogSource, fieldKey: string): ReportsCatalogField | undefined {
  const field = source.fields.find((candidate) => candidate.key === fieldKey);
  return field && isReportFieldSelectable(field) ? field : undefined;
}

function normalizeFilterValue(field: ReportsCatalogField, value: unknown): unknown {
  if (value === "") return value;
  if (field.type === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : value;
  }
  if (field.type === "boolean") return value === true || value === "true";
  return value;
}

function normalizeFilters(source: ReportsCatalogSource, filters: ReportFilter[]): ReportFilter[] {
  return filters.flatMap((filter) => {
    const field = getField(source, filter.fieldKey);
    if (!field || !canFilter(field) || !getReportFieldOperators(field).includes(filter.operator)) {
      return [];
    }
    return [{ ...filter, value: normalizeFilterValue(field, filter.value) }];
  });
}

function normalizeAggregations(
  source: ReportsCatalogSource,
  aggregations: ReportAggregation[],
): ReportAggregation[] {
  return aggregations.filter((aggregation) => {
    const field = getField(source, aggregation.fieldKey);
    return Boolean(
      field &&
        (field.aggregatable === true || hasCapability(field, "aggregatable")) &&
        getAggregationFunctions(field).includes(aggregation.function),
    );
  });
}

function normalizeSorts(source: ReportsCatalogSource, orderBy: ReportSort[]): ReportSort[] {
  return orderBy.filter((sort) => {
    const field = getField(source, sort.fieldKey);
    return Boolean(field && canSort(field));
  });
}

function normalizeRelation(
  source: ReportsCatalogSource,
  relation: ReportBuilderState["relation"],
): ReportBuilderState["relation"] {
  if (!relation) return undefined;

  const descriptor = source.relations?.find((candidate) => candidate.key === relation.key);
  if (!descriptor) return undefined;

  const allowedJoinTypes = getRelationJoinTypes(descriptor);
  if (allowedJoinTypes.length === 0) return undefined;

  return {
    key: descriptor.key,
    joinType: allowedJoinTypes.includes(relation.joinType)
      ? relation.joinType
      : allowedJoinTypes[0],
    ...(descriptor.targetSourceKey ? { targetSourceKey: descriptor.targetSourceKey } : {}),
  };
}

export function normalizeReportBuilderState(
  state: ReportBuilderState,
  source: ReportsCatalogSource,
): ReportBuilderState {
  const selectableFields = new Set(getSelectableReportFields(source).map((field) => field.key));
  const parameterKeys = new Set((source.parameters ?? []).map((parameter) => parameter.key));

  return {
    ...state,
    sourceKey: source.key,
    relation: normalizeRelation(source, state.relation),
    fieldKeys: [...new Set(state.fieldKeys)].filter((fieldKey) => selectableFields.has(fieldKey)),
    filterLogic: state.filterLogic === "or" ? "or" : "and",
    filters: normalizeFilters(source, state.filters),
    parameters: Object.fromEntries(
      Object.entries(state.parameters).filter(([key]) => parameterKeys.has(key)),
    ),
    groupBy: [...new Set(state.groupBy)].filter((fieldKey) => {
      const field = getField(source, fieldKey);
      return Boolean(field && canGroup(field));
    }),
    aggregations: normalizeAggregations(source, state.aggregations),
    orderBy: normalizeSorts(source, state.orderBy),
    limit: Math.min(DEFAULT_PREVIEW_LIMIT, Math.max(1, Math.trunc(state.limit || 1))),
  };
}

type ReportsCatalogParameterType = "text" | "number" | "date" | "boolean" | "select";

function toDefinitionParameterType(type: ReportsCatalogParameterType): ReportValueType {
  return type === "text" || type === "select" ? "string" : type;
}

function createFilterParameterName(index: number, usedNames: Set<string>): string {
  let suffix = index + 1;
  let name = `filter_value_${suffix}`;
  while (usedNames.has(name)) {
    suffix += 1;
    name = `filter_value_${suffix}`;
  }
  usedNames.add(name);
  return name;
}

export function buildReportPreviewPayload(
  state: ReportBuilderState,
  source: ReportsCatalogSource,
): { definition: ReportDefinition; parameterValues?: Record<string, unknown> } | undefined {
  const normalized = normalizeReportBuilderState(state, source);
  const fields = normalized.fieldKeys
    .map((fieldKey) => getField(source, fieldKey))
    .filter((field): field is ReportsCatalogField => Boolean(field));

  if (fields.length === 0) return undefined;

  const definitionParameters = (source.parameters ?? []).map((parameter) => ({
    name: parameter.key,
    type: toDefinitionParameterType(parameter.type),
  }));
  const usedParameterNames = new Set(definitionParameters.map((parameter) => parameter.name));
  const filterParameterNames = normalized.filters.map((filter, index) => ({
    filter,
    name: createFilterParameterName(index, usedParameterNames),
  }));
  const filterDefinitions = filterParameterNames.map(({ filter, name }) => {
    const field = getField(source, filter.fieldKey);
    return {
      source: source.key,
      field: filter.fieldKey,
      operator: filter.operator,
      parameter: name,
      type: field?.type ?? "string",
      value: filter.value,
    };
  });
  const parameterValues = {
    ...normalized.parameters,
    ...Object.fromEntries(filterDefinitions.map((filter) => [filter.parameter, filter.value])),
  };
  const relation = normalized.relation;
  const sources = [source.key, relation?.targetSourceKey].filter(
    (sourceKey): sourceKey is string => Boolean(sourceKey),
  );

  return {
    definition: {
      sources,
      columns: fields.map((field) => ({ source: source.key, field: field.key, alias: field.key })),
      joins: relation ? [{ relation: relation.key, type: relation.joinType }] : [],
      filters: filterDefinitions.map(({ source: filterSource, field, operator, parameter }) => ({
        source: filterSource,
        field,
        operator,
        parameter,
      })),
      filter_groups: filterParameterNames.length
        ? [{ operator: normalized.filterLogic, filters: filterParameterNames.map(({ name }) => name) }]
        : [],
      parameters: [
        ...definitionParameters,
        ...filterDefinitions.map(({ parameter, type }) => ({ name: parameter, type })),
      ],
      aggregations: normalized.aggregations.map((aggregation) => ({
        source: source.key,
        field: aggregation.fieldKey,
        function: aggregation.function,
      })),
      order_by: normalized.orderBy.map((sort) => ({
        source: source.key,
        field: sort.fieldKey,
        direction: sort.direction,
      })),
    },
    ...(Object.keys(parameterValues).length > 0 ? { parameterValues } : {}),
  };
}

export function sanitizeReportPreviewResult(
  result: ReportPreviewResult,
  source: ReportsCatalogSource,
): ReportPreviewResult {
  const allowedKeys = new Set(getSelectableReportFields(source).map((field) => field.key));
  const columns = result.columns.filter((column) => allowedKeys.has(column.key));

  return {
    ...result,
    columns,
    rows: result.rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column.key, row[column.key]])),
    ),
  };
}

export function createInitialReportBuilderState(sourceKey = ""): ReportBuilderState {
  return {
    sourceKey,
    relation: undefined,
    fieldKeys: [],
    filterLogic: "and",
    filters: [],
    parameters: {},
    groupBy: [],
    aggregations: [],
    orderBy: [],
    limit: DEFAULT_PREVIEW_LIMIT,
  };
}
