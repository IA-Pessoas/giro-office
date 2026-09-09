import { ServiceError } from "@workspace/shared";

import type { ReportAuditService } from "./reportAuditService.js";
import type { ReportAuthorizationService } from "./reportAuthorizationService.js";
import { ReportCsvService, type ReportTable } from "./reportCsvService.js";
import type { ReportJobService } from "./reportJobService.js";
import { ReportLetterheadService } from "./reportLetterheadService.js";
import { type ReportPdfRenderer, ReportPdfService } from "./reportPdfService.js";
import type { ReportSnapshotService } from "./reportSnapshotService.js";
import { ReportXlsxService } from "./reportXlsxService.js";
import { createReportZip } from "./reportZipService.js";

export type ReportExportFormat = "csv" | "xlsx" | "pdf";

export interface ReportExportResult {
  contentType: string;
  fileName: string;
  body: Buffer;
}

type ReportExportBlock = {
  source: string;
  label: string;
  columns: readonly { key: string; label: string }[];
  rows: readonly Record<string, unknown>[];
};

interface ReportExportRenderers {
  csv?: ReportTableRenderer;
  xlsx?: ReportTableRenderer;
  pdf?: ReportPdfRenderer;
}

interface ReportTableRenderer {
  render(table: ReportTable): Buffer | Promise<Buffer>;
}

interface SnapshotExportContext {
  scope: "personal" | "shared";
  departmentId?: string;
}

function createDefaultRenderers(): ReportExportRenderers {
  return {
    csv: new ReportCsvService(),
    xlsx: new ReportXlsxService(),
    pdf: new ReportPdfService(new ReportLetterheadService()),
  };
}

export class ReportExportService {
  constructor(
    private readonly snapshots: ReportSnapshotService,
    private readonly renderers: ReportExportRenderers = createDefaultRenderers(),
    private readonly audit?: Pick<ReportAuditService, "record">,
    private readonly jobs?: Pick<ReportJobService, "getVersion">,
    private readonly authorization?: Pick<ReportAuthorizationService, "validateSharedDefinition">,
  ) {}

  async export(input: {
    snapshotId: string;
    userId: string;
    organizationId: string;
    requestId: string;
    format: ReportExportFormat;
  }): Promise<ReportExportResult> {
    let source: Awaited<ReturnType<ReportSnapshotService["getForExport"]>> | undefined;
    try {
      source = await this.snapshots.getForExport({
        snapshotId: input.snapshotId,
        userId: input.userId,
        organizationId: input.organizationId,
        allowSharedLookup: Boolean(this.jobs && this.authorization),
      });
      const exportContext = await this.reauthorizeSnapshot(input, source);
      const renderer = this.renderers[input.format];
      if (!renderer) throw new ServiceError(500, "Formato de exportação indisponível.");
      const blocks: ReportExportBlock[] = source.blocks?.length
        ? source.blocks
        : [
            {
              source: "legacy",
              label: "Relatório",
              columns: [],
              rows: source.rows,
            },
          ];
      const tables = blocks.map((block) => createTable(block.rows, block.columns));
      const stems = uniqueStems(blocks.map((block) => block.label));
      const totalRows = tables.reduce((total, table) => total + table.rows.length, 0);

      const body =
        input.format === "pdf"
          ? await (renderer as ReportPdfRenderer).render({
              author: input.userId,
              generatedAt: source.snapshot.created_at,
              organizationId: input.organizationId,
              ...exportContext,
              presentation_json: toPresentation(tables[0]),
              rows: tables[0]?.rows ?? [],
              ...(source.blocks?.length
                ? {
                    blocks: tables.map((table, index) => ({
                      title: blocks[index]?.label ?? "Relatório",
                      presentation_json: toPresentation(table),
                      rows: table.rows,
                    })),
                  }
                : {}),
            })
          : tables.length > 1
            ? createReportZip(
                await Promise.all(
                  tables.map(async (table, index) => ({
                    fileName: `${stems[index]}.${input.format}`,
                    body: await (renderer as ReportTableRenderer).render(table),
                  })),
                ),
              )
            : await (renderer as ReportTableRenderer).render(tables[0] ?? createTable([]));
      const finalExportContext = await this.reauthorizeSnapshot(input, source);
      await this.snapshots.assertExportable({
        snapshotId: input.snapshotId,
        userId: input.userId,
        organizationId: input.organizationId,
        allowShared: finalExportContext.scope === "shared",
      });
      await this.audit?.record({
        actor_id: input.userId,
        organization_id: input.organizationId,
        job_id: source.job.id,
        report_model_version_id: source.job.report_model_version_id,
        event_type: "report.export",
        occurred_at: new Date(),
        format: input.format,
        result: "success",
        counts: { rows: totalRows, bytes: body.byteLength },
      });
      return {
        contentType:
          input.format !== "pdf" && tables.length > 1
            ? "application/zip"
            : input.format === "csv"
              ? "text/csv; charset=utf-8"
              : input.format === "xlsx"
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : "application/pdf",
        fileName:
          input.format !== "pdf" && tables.length > 1
            ? `report-${source.job.id}.zip`
            : tables.length === 1 && source.blocks?.length
              ? `${stems[0]}.${input.format}`
              : `report-${source.job.id}.${input.format}`,
        body: Buffer.from(body),
      };
    } catch (error) {
      await this.audit?.record({
        actor_id: input.userId,
        organization_id: input.organizationId,
        ...(source?.job
          ? {
              job_id: source.job.id,
              report_model_version_id: source.job.report_model_version_id,
            }
          : {}),
        event_type: "report.export",
        occurred_at: new Date(),
        format: input.format,
        result: "failure",
      });
      throw error;
    }
  }

  private async reauthorizeSnapshot(
    input: { userId: string; organizationId: string; requestId: string },
    source: Awaited<ReturnType<ReportSnapshotService["getForExport"]>>,
  ): Promise<SnapshotExportContext> {
    if (!this.jobs || !this.authorization) return { scope: "personal" };

    const version = await this.jobs.getVersion({
      organizationId: input.organizationId,
      modelVersionId: source.job.report_model_version_id,
      includeEphemeral: true,
    });
    if (version.model.created_by_user_id !== null) {
      if (source.job.requester_id !== input.userId) {
        throw new ServiceError(404, "Snapshot de relatório não encontrado.");
      }
      return { scope: "personal" };
    }

    const authorized = await this.authorization.validateSharedDefinition({
      userId: input.userId,
      organizationId: input.organizationId,
      requestId: input.requestId,
      definition: version.version.definition_json as never,
    });
    if (version.model.department_id !== authorized.department_id) {
      throw new ServiceError(403, "O modelo compartilhado não pertence ao departamento atual.");
    }
    return { scope: "shared", departmentId: authorized.department_id };
  }
}

function inferValueType(value: unknown): ReportTable["columns"][number]["valueType"] {
  if (value instanceof Date) return "date";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ) {
    return "date";
  }
  return "string";
}

function createTable(
  rows: readonly Record<string, unknown>[],
  columns: readonly { key: string; label: string }[] = [],
): ReportTable {
  const keys =
    columns.length > 0
      ? columns.map((column) => column.key)
      : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return {
    columns: keys.map((key) => ({
      key,
      label: columns.find((column) => column.key === key)?.label ?? key,
      valueType: inferValueType(
        rows.find((row) => row[key] !== null && row[key] !== undefined)?.[key],
      ),
    })),
    rows,
  };
}

function toPresentation(table: ReportTable | undefined): {
  columns: Array<{ key: string; label: string; format: string }>;
} {
  return {
    columns: (table?.columns ?? []).map((column) => ({
      key: column.key,
      label: column.label,
      format: column.valueType ?? "string",
    })),
  };
}

function uniqueStem(label: string, index: number): string {
  const sanitized = label
    .replace(/[<>:"/\\|?*]/gu, "_")
    .replace(/\p{Cc}/gu, "_")
    .trim()
    .replace(/[. ]+$/u, "")
    .slice(0, 120);
  return sanitized || `area-${index + 1}`;
}

function uniqueStems(labels: readonly string[]): string[] {
  const counts = new Map<string, number>();
  return labels.map((label, index) => {
    const base = uniqueStem(label, index);
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}_${occurrence + 1}`;
  });
}
