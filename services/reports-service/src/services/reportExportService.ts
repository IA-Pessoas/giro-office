import { ServiceError } from "@workspace/shared";
import { reportLetterheadReferenceSchema } from "../schemas/reportLetterhead.schemas.js";
import type { ReportAuditService } from "./reportAuditService.js";
import type { ReportAuthorizationService } from "./reportAuthorizationService.js";
import { ReportCsvService, type ReportTable } from "./reportCsvService.js";
import type { ReportJobService } from "./reportJobService.js";
import { ReportLetterheadService } from "./reportLetterheadService.js";
import {
  normalizeReportAuthor,
  type ReportPdfRenderer,
  ReportPdfService,
  UNKNOWN_REPORT_AUTHOR,
} from "./reportPdfService.js";
import type { ReportSnapshotService } from "./reportSnapshotService.js";
import { ReportXlsxService } from "./reportXlsxService.js";
import { createReportZip } from "./reportZipService.js";

const REPORT_TIME_ZONE = "UTC";
const reportFileTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORT_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type ReportExportFormat = "csv" | "xlsx" | "pdf";

export interface ReportExportResult {
  contentType: string;
  fileName: string;
  body: Buffer;
}

type ReportExportBlock = {
  source: string;
  label: string;
  columns: readonly { key: string; label: string; hidden?: boolean; exportable?: boolean }[];
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
  letterhead?: { id: string; sha256: string };
}

interface ReportAuthorContextClient {
  getAccessContext(input: {
    userId: string;
    organizationId: string;
    requestId: string;
  }): Promise<unknown>;
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
    private readonly authorContext?: ReportAuthorContextClient,
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

      await this.snapshots.assertExportable({
        snapshotId: input.snapshotId,
        userId: input.userId,
        organizationId: input.organizationId,
        allowShared: exportContext.scope === "shared",
      });

      const body =
        input.format === "pdf"
          ? await (renderer as ReportPdfRenderer).render({
              author: await this.resolveAuthorName(input, source.job.requester_id),
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
                await renderZipEntries(
                  tables,
                  stems,
                  input.format,
                  renderer as ReportTableRenderer,
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
        fileName: buildReportFileName(
          input.format !== "pdf" && tables.length > 1
            ? `report-${source.job.id}`
            : tables.length === 1 && source.blocks?.length
              ? (stems[0] ?? `report-${source.job.id}`)
              : `report-${source.job.id}`,
          source.snapshot.created_at,
          input.format !== "pdf" && tables.length > 1 ? "zip" : input.format,
        ),
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
    const definition = version.version.definition_json;
    const reference =
      definition && typeof definition === "object" && !Array.isArray(definition)
        ? (definition as { letterhead?: unknown }).letterhead
        : undefined;
    const selected =
      reference === undefined ? undefined : reportLetterheadReferenceSchema.safeParse(reference);
    if (selected && !selected.success)
      throw new ServiceError(400, "A seleção do timbrado do relatório é inválida.");
    const letterhead = selected?.success ? { letterhead: selected.data } : {};
    if (version.model.created_by_user_id !== null) {
      if (source.job.requester_id !== input.userId) {
        throw new ServiceError(404, "Resultado do relatório não encontrado.");
      }
      return { scope: "personal", ...letterhead };
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
    return { scope: "shared", departmentId: authorized.department_id, ...letterhead };
  }

  private async resolveAuthorName(
    input: { organizationId: string; requestId: string },
    authorId: string,
  ): Promise<string> {
    if (!this.authorContext) return UNKNOWN_REPORT_AUTHOR;

    try {
      const context = await this.authorContext.getAccessContext({
        userId: authorId,
        organizationId: input.organizationId,
        requestId: input.requestId,
      });
      if (typeof context !== "object" || context === null) return UNKNOWN_REPORT_AUTHOR;

      const user = (context as { user?: { name?: unknown; login?: unknown } }).user;
      for (const value of [user?.name, user?.login]) {
        if (typeof value === "string" && value.trim()) return normalizeReportAuthor(value);
      }
    } catch {
      return UNKNOWN_REPORT_AUTHOR;
    }
    return UNKNOWN_REPORT_AUTHOR;
  }
}

async function renderZipEntries(
  tables: readonly ReportTable[],
  stems: readonly string[],
  format: ReportExportFormat,
  renderer: ReportTableRenderer,
): Promise<Array<{ fileName: string; body: Buffer }>> {
  const entries: Array<{ fileName: string; body: Buffer }> = [];
  for (const [index, table] of tables.entries()) {
    entries.push({
      fileName: `${stems[index]}.${format}`,
      body: await renderer.render(table),
    });
  }
  return entries;
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
  columns: readonly { key: string; label: string; hidden?: boolean; exportable?: boolean }[] = [],
): ReportTable {
  const keys =
    columns.length > 0
      ? columns.filter((column) => !column.hidden || column.exportable).map((column) => column.key)
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

function buildReportFileName(stem: string, createdAt: Date, extension: string): string {
  const parts = reportFileTimestampFormatter.formatToParts(createdAt);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const timestamp = `${getPart("year")}-${getPart("month")}-${getPart("day")}_${getPart(
    "hour",
  )}-${getPart("minute")}-${getPart("second")}`;
  return `${stem}-${timestamp}.${extension}`;
}
