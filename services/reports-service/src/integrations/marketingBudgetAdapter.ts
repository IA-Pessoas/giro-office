import {
  executeReportingQuery,
  getMarketingBudgetReportingFields,
  error as logError,
  MARKETING_BUDGET_REPORTING_SOURCES,
  MAX_REPORTING_QUERY_ROWS,
  marketingBudgetReportingCatalog,
  ServiceError,
} from "@workspace/shared";
import type {
  ReportCatalogRelation,
  ReportCatalogSource,
  ReportPreviewAdapterInput,
  ReportPreviewAdapterResult,
  ReportSourceAdapter,
} from "../catalog/types.js";
import type { ReportsPrismaClient } from "../prisma/index.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import { reportCriteria, reportResultFields } from "./reportCriteria.js";

const source = MARKETING_BUDGET_REPORTING_SOURCES[0];
const sources = marketingBudgetReportingCatalog.sources.map(
  ({ keys: _keys, ...item }) => item,
) as readonly ReportCatalogSource[];
const relations: readonly ReportCatalogRelation[] = [];

type BudgetItem = {
  description?: unknown;
  quantity?: unknown;
  total_amount?: unknown;
};

type BudgetRecord = {
  title: string;
  status: string;
  department_id: string;
  department: { name: string; organization_id: string } | null;
  createdAt: Date;
  organization_id: string;
  items: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function budgetItems(value: unknown): BudgetItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as BudgetItem[];
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function toRow(record: BudgetRecord): Record<string, unknown> {
  const items = budgetItems(record.items);
  const totalAmount = items.reduce(
    (total, item) => total + (asFiniteNumber(item.total_amount) ?? 0),
    0,
  );
  const itemsSummary = items
    .map((item) => {
      const description = typeof item.description === "string" ? item.description.trim() : "";
      if (!description) return undefined;
      const quantity = asFiniteNumber(item.quantity);
      return quantity === undefined ? description : `${description} × ${quantity}`;
    })
    .filter((item): item is string => item !== undefined)
    .join(" · ");

  return {
    title: record.title,
    status: record.status,
    department_id: record.department_id,
    department_name:
      record.department?.organization_id === record.organization_id ? record.department.name : null,
    created_at: record.createdAt,
    items_count: items.length,
    total_amount: totalAmount,
    items_summary: itemsSummary,
  };
}

export class MarketingBudgetAdapter implements ReportSourceAdapter {
  readonly sources = sources;
  readonly relations = relations;

  constructor(private readonly prisma: Pick<ReportsPrismaClient, "budget">) {}

  isEnabled(scope: { modules: Readonly<Record<string, number>> }): boolean {
    return (scope.modules.marketing ?? 0) >= 1;
  }

  async preview(input: ReportPreviewAdapterInput): Promise<ReportPreviewAdapterResult> {
    const definition = input.definition as ReportDefinition;
    if (
      definition.sources.length !== 1 ||
      definition.sources[0] !== source ||
      definition.joins.length
    ) {
      throw new ServiceError(400, "A prévia de Orçamentos aceita somente uma fonte de dados.");
    }

    const fields = definition.columns.map((column) => column.field);
    if (new Set(fields).size !== fields.length) {
      throw new ServiceError(400, "As colunas de Orçamentos devem usar campos únicos.");
    }
    const allowedFields = getMarketingBudgetReportingFields(source);
    if (fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    let budgets: readonly BudgetRecord[];
    try {
      budgets = await this.prisma.budget.findMany({
        where: { organization_id: input.organization_id },
        orderBy: { id: "asc" },
        take: MAX_REPORTING_QUERY_ROWS + 1,
        select: {
          title: true,
          status: true,
          department_id: true,
          department: { select: { name: true, organization_id: true } },
          createdAt: true,
          organization_id: true,
          items: true,
        },
      });
    } catch (err: unknown) {
      logError("Falha ao consultar Orçamentos para relatório", {
        errorType: err instanceof Error ? err.name : typeof err,
      });
      throw new ServiceError(503, "Não foi possível obter Orçamentos para o relatório.");
    }

    const rows = budgets.slice(0, MAX_REPORTING_QUERY_ROWS).map(toRow);
    const reachedLimit = budgets.length > MAX_REPORTING_QUERY_ROWS;
    const criteria = reportCriteria(definition, input.parameter_values);
    const resultFields = reportResultFields(fields, criteria.query);
    if (criteria.query) {
      return executeReportingQuery(
        { source, fields: resultFields, limit: input.limit, query: criteria.query },
        async (queryFields, limit, offset) => ({
          rows: rows
            .slice(offset, offset + limit)
            .map((row) => Object.fromEntries(queryFields.map((field) => [field, row[field]]))),
          reachedLimit: offset + limit < rows.length || reachedLimit,
        }),
      );
    }

    return {
      rows: rows
        .slice(0, input.limit)
        .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))),
      reachedLimit: reachedLimit || rows.length > input.limit,
    };
  }
}
