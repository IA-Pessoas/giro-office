import {
  executeReportingQuery,
  PESSOAL_LDD_REPORTING_SOURCES,
  PESSOAL_PAYROLL_REPORTING_SOURCES,
  PESSOAL_SITUATIONS_REPORTING_SOURCES,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { NO_OBLIGATIONS_GROUP_POLICY } from "../services/pessoalGroupPolicy.js";
import {
  getPessoalReportingFields,
  PESSOAL_REPORTING_SOURCES,
  type PessoalReportingSource,
} from "./pessoalReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

const PAYROLL_SCALAR_FIELDS = new Set([
  "advance",
  "advance_type",
  "advance_amount",
  "onvio",
  "vt",
  "vt_value",
  "vt_type",
  "va",
  "assistance_fee",
  "bem_mais",
  "bsf",
  "reinf",
  "employees",
]);

const OBLIGATION_SCALAR_FIELDS = new Set([
  "competence",
  "group_snapshot_name",
  "group_snapshot_policy",
  "advance",
  "payroll",
  "charges",
  "assistance_fee",
  "bem_mais",
  "bsf",
  "va",
  "vt",
]);

function selectScalars(
  fields: readonly string[],
  available: ReadonlySet<string>,
): Record<string, true> {
  return Object.fromEntries(
    fields.filter((field) => available.has(field)).map((field) => [field, true]),
  );
}

function relationName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function reportName(row: Record<string, unknown>, relation: string, field: string): string | null {
  return relationName(row[relation]) ?? textValue(row[field]);
}

function payrollGroupState(row: Record<string, unknown>): string {
  const group = row.group as { archived_at?: unknown; system_key?: unknown } | null | undefined;
  if (group?.system_key === "NO_MOVEMENT") return "SEM_MOVIMENTO";
  if (group?.archived_at != null) return "ARQUIVADO";
  if (group) return "ATIVO";
  return "SEM_GRUPO";
}

function obligationSnapshotState(row: Record<string, unknown>): string {
  if (row.group_snapshot_policy === NO_OBLIGATIONS_GROUP_POLICY) return "SEM_MOVIMENTO";
  return row.group_snapshot_name ? "ATIVO" : "SEM_SNAPSHOT";
}

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
  limit: number,
): { rows: readonly Record<string, unknown>[]; reachedLimit: boolean } {
  return {
    rows: rows
      .slice(0, limit)
      .map((row) =>
        Object.fromEntries(
          fields
            .filter((field) => Object.getOwnPropertyDescriptor(row, field) !== undefined)
            .map((field) => [field, row[field]]),
        ),
      ),
    reachedLimit: rows.length > limit,
  };
}

export class InternalReportingService {
  constructor(
    private readonly prisma: Pick<
      PrismaClient,
      "lddPessoal" | "payroll" | "situationsPessoal" | "obrigationsPessoal" | "unionPessoal"
    >,
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: PessoalReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new InternalReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
        this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }
    if (!PESSOAL_REPORTING_SOURCES.includes(input.source)) {
      throw new ServiceError(403, "Fonte não publicada para relatórios.");
    }

    const allowedFields = getPessoalReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    if (input.source === PESSOAL_PAYROLL_REPORTING_SOURCES[0]) {
      const rows = await this.prisma.payroll.findMany({
        where: { organization_id: input.organizationId },
        select: {
          ...selectScalars(input.fields, PAYROLL_SCALAR_FIELDS),
          ...(input.fields.includes("client_name") ? { client: { select: { name: true } } } : {}),
          ...(input.fields.includes("responsible_name")
            ? { responsible: { select: { name: true } } }
            : {}),
          ...(input.fields.includes("union_name") ? { union: { select: { name: true } } } : {}),
          ...(input.fields.some((field) => field === "group_name" || field === "group_state")
            ? {
                group: { select: { name: true, archived_at: true, system_key: true } },
              }
            : {}),
        },
        ...(input.offset !== undefined
          ? { skip: input.offset, orderBy: { id: "asc" as const } }
          : {}),
        take: input.limit + 1,
      });
      return projectRows(
        rows.map((row) => ({
          ...row,
          client_name: reportName(row, "client", "client_name"),
          responsible_name: reportName(row, "responsible", "responsible_name"),
          union_name: reportName(row, "union", "union_name"),
          group_name: reportName(row, "group", "group_name"),
          group_state:
            textValue((row as Record<string, unknown>).group_state) ?? payrollGroupState(row),
        })),
        input.fields,
        input.limit,
      );
    }

    if (input.source === "pessoal.obligations") {
      const rows = await this.prisma.obrigationsPessoal.findMany({
        where: { organization_id: input.organizationId },
        select: {
          ...selectScalars(input.fields, OBLIGATION_SCALAR_FIELDS),
          ...(input.fields.includes("client_name") ? { client: { select: { name: true } } } : {}),
          ...(input.fields.includes("responsible_name")
            ? { responsible: { select: { name: true } } }
            : {}),
        },
        ...(input.offset !== undefined
          ? { skip: input.offset, orderBy: { id: "asc" as const } }
          : {}),
        take: input.limit + 1,
      });
      return projectRows(
        rows.map((row) => ({
          ...row,
          client_name: reportName(row, "client", "client_name"),
          responsible_name: reportName(row, "responsible", "responsible_name"),
          group_snapshot_state:
            textValue((row as Record<string, unknown>).group_snapshot_state) ??
            obligationSnapshotState(row),
        })),
        input.fields,
        input.limit,
      );
    }

    const delegate =
      input.source === PESSOAL_LDD_REPORTING_SOURCES[0]
        ? this.prisma.lddPessoal
        : input.source === PESSOAL_SITUATIONS_REPORTING_SOURCES[0]
          ? this.prisma.situationsPessoal
          : this.prisma.unionPessoal;
    const rows = await (delegate as unknown as ReportingDelegate).findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });

    return projectRows(rows, input.fields, input.limit);
  }
}
