import { ServiceError } from "@workspace/shared";

import type { ReportAuditService } from "./reportAuditService.js";
import type { ReportAuthorizationService } from "./reportAuthorizationService.js";
import { ReportCsvService, type ReportTable } from "./reportCsvService.js";
import type { ReportJobService } from "./reportJobService.js";
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
    private readonly authorization?: Pick<ReportAuthorizationService, "getSharedDepartment">,
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
      const exportContext = await this.reauthorizeSnapshot(input, source);
      const table = createTable(source.rows);
      const renderer = this.renderers[input.format];
      if (!renderer) throw new ServiceError(500, "Formato de exportação indisponível.");

      const body =
        input.format === "pdf"
          ? await (renderer as ReportPdfRenderer).render({
              author: input.userId,
              generatedAt: source.snapshot.created_at,
              organizationId: input.organizationId,
              ...exportContext,
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
      await this.snapshots.assertExportable({
        snapshotId: input.snapshotId,
        userId: input.userId,
        organizationId: input.organizationId,
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
        counts: { rows: source.rows.length, bytes: body.byteLength },
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
    if (version.model.created_by_user_id === input.userId) return { scope: "personal" };

    const department = await this.authorization.getSharedDepartment({
      userId: input.userId,
      organizationId: input.organizationId,
      requestId: input.requestId,
    });
    if (version.model.department_id !== department.id) {
      throw new ServiceError(403, "O modelo compartilhado não pertence ao departamento atual.");
    }
    return { scope: "shared", departmentId: department.id };
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
