import { ServiceError } from "@workspace/shared";

import type { ReportAuditService } from "./reportAuditService.js";
import { ReportCsvService, type ReportTable } from "./reportCsvService.js";
import type { ReportSnapshotService } from "./reportSnapshotService.js";
import { ReportXlsxService } from "./reportXlsxService.js";

export type ReportExportFormat = "csv" | "xlsx";

export interface ReportExportResult {
  contentType: string;
  fileName: string;
  body: Buffer;
}

interface ReportExportRenderers {
  csv?: ReportCsvService;
  xlsx?: ReportXlsxService;
}

export class ReportExportService {
  constructor(
    private readonly snapshots: ReportSnapshotService,
    private readonly renderers: ReportExportRenderers = {
      csv: new ReportCsvService(),
      xlsx: new ReportXlsxService(),
    },
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

      const body = await renderer.render(table);
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
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
