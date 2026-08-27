import { ServiceError } from "@workspace/shared";

import type { ReportAuditService } from "./reportAuditService.js";
import { ReportCsvService, type ReportTable } from "./reportCsvService.js";
import { ReportLetterheadService } from "./reportLetterheadService.js";
import { type ReportPdfRenderer, ReportPdfService } from "./reportPdfService.js";
import type { ReportSnapshotService } from "./reportSnapshotService.js";
import { ReportXlsxService } from "./reportXlsxService.js";

export type ReportExportFormat = "csv" | "xlsx" | "pdf";

export interface ReportExportResult {
  contentType: string;
  fileName: string;
  body: Buffer;
}

interface ReportExportRenderers {
  csv?: ReportTableRenderer;
  xlsx?: ReportTableRenderer;
  pdf?: ReportPdfRenderer;
}

interface ReportTableRenderer {
  render(table: ReportTable): Buffer | Promise<Buffer>;
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
      });
      const table = createTable(source.rows);
      const renderer = this.renderers[input.format];
      if (!renderer) throw new ServiceError(500, "Formato de exportação indisponível.");

      const body =
        input.format === "pdf"
          ? await (renderer as ReportPdfRenderer).render({
              author: input.userId,
              generatedAt: source.snapshot.created_at,
              organizationId: input.organizationId,
              scope: "personal",
              presentation_json: {
                columns: table.columns.map((column) => ({
                  key: column.key,
                  label: column.label,
                  format: column.valueType,
                })),
              },
              rows: table.rows,
            })
          : await (renderer as ReportTableRenderer).render(table);
      await this.audit?.record({
        actor_id: input.userId,
        organization_id: input.organizationId,
        job_id: source.job.id,
        report_model_version_id: source.job.report_model_version_id,
        event_type: "report.export",
        occurred_at: new Date(),
        format: input.format,
        result: "success",
        counts: { rows: source.rows.length, bytes: body.byteLength },
      });
      await this.snapshots.assertExportable({
        snapshotId: input.snapshotId,
        userId: input.userId,
        organizationId: input.organizationId,
      });
      return {
        contentType:
          input.format === "csv"
            ? "text/csv; charset=utf-8"
            : input.format === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/pdf",
        fileName: `report-${source.job.id}.${input.format}`,
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

function createTable(rows: readonly Record<string, unknown>[]): ReportTable {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return {
    columns: keys.map((key) => ({
      key,
      label: key,
      valueType: inferValueType(
        rows.find((row) => row[key] !== null && row[key] !== undefined)?.[key],
      ),
    })),
    rows,
  };
}
