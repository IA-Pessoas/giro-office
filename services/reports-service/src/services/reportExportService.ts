import { ServiceError } from "@workspace/shared";

import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import type { ReportAuditService } from "./reportAuditService.js";
import type { ReportAuthorizationService } from "./reportAuthorizationService.js";
import { ReportCsvService, type ReportTable } from "./reportCsvService.js";
import type { ValidatedReportDefinition } from "./reportDefinitionService.js";
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

interface ReportTableRenderer {
  render(table: ReportTable): Buffer | Promise<Buffer>;
}

interface ReportExportRenderers {
  csv?: ReportTableRenderer;
  xlsx?: ReportTableRenderer;
  pdf?: ReportPdfRenderer;
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
    private readonly jobs: ReportJobService,
    private readonly authorization: ReportAuthorizationService,
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
      const version = await this.jobs.getVersion({
        organizationId: input.organizationId,
        modelVersionId: source.job.report_model_version_id,
        includeEphemeral: true,
      });
      const validated = await this.authorizeDefinition(input, version);
      const table: ReportTable = {
        columns: validated.definition.columns.map((column) => ({
          key: column.alias,
          label: column.alias,
          valueType: validated.catalog?.sources
            .find((source) => source.key === column.source)
            ?.fields.find((field) => field.key === column.field)?.value_type,
        })),
        rows: source.rows.map((row) =>
          Object.fromEntries(
            validated.definition.columns.map((column) => [
              column.alias,
              // biome-ignore lint/suspicious/noPrototypeBuiltins: reports-service targets ES2020.
              Object.prototype.hasOwnProperty.call(row, column.alias)
                ? row[column.alias]
                : row[column.field],
            ]),
          ),
        ),
      };
      const renderer = this.renderers[input.format];
      if (!renderer) throw new ServiceError(500, "Formato de exportação indisponível.");

      const body =
        input.format === "pdf"
          ? await (renderer as ReportPdfRenderer).render({
              author: input.userId,
              generatedAt: source.snapshot.created_at,
              organizationId: input.organizationId,
              ...(validated.department_id ? { departmentId: validated.department_id } : {}),
              scope: validated.department_id ? "shared" : "personal",
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

  private async authorizeDefinition(
    input: { userId: string; organizationId: string; requestId: string },
    version: {
      model: { created_by_user_id: string | null; department_id?: string | null };
      version: { definition_json: unknown };
    },
  ): Promise<ValidatedReportDefinition & { department_id?: string }> {
    if (version.model.created_by_user_id === input.userId) {
      return this.authorization.validateDefinition({
        ...input,
        definition: version.version.definition_json as ReportDefinition,
      });
    }

    const shared = await this.authorization.validateSharedDefinition({
      ...input,
      definition: version.version.definition_json as ReportDefinition,
    });
    if (version.model.department_id !== shared.department_id) {
      throw new ServiceError(403, "O modelo compartilhado não pertence ao departamento atual.");
    }
    return shared;
  }
}
