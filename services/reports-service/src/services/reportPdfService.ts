import { createRequire } from "node:module";

import { ServiceError } from "@workspace/shared";

import type { ReportLetterheadService } from "./reportLetterheadService.js";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_TOP = 110;
const FOOTER_BOTTOM = 40;
const ROW_HEIGHT = 18;
const FALLBACK_COLOR = "#f2f4f7";
const BORDER_COLOR = "#cbd5e1";

export const REPORT_PDF_FORMAT = "pdf" as const;
export const REPORT_PDF_CONTENT_TYPE = "application/pdf";

export interface PdfDocumentOptions {
  size: "A4";
  margin: number;
  info: { Author: string; CreationDate: Date };
}

export interface PdfDocumentLike {
  on(event: string, listener: (value?: unknown) => void): this;
  image(source: Buffer, x: number, y: number, options: { width: number; height: number }): this;
  fillColor(color: string): this;
  rect(x: number, y: number, width: number, height: number): this;
  fill(): this;
  fontSize(size: number): this;
  text(value: string, x: number, y: number, options?: Record<string, unknown>): this;
  moveTo(x: number, y: number): this;
  lineTo(x: number, y: number): this;
  stroke(): this;
  addPage(options?: PdfDocumentOptions): this;
  end(): void;
}

export type PdfDocumentFactory = (options: PdfDocumentOptions) => PdfDocumentLike;

interface PresentationColumn {
  key: string;
  label: string;
  format?: string;
}

export interface ReportPdfRenderInput {
  author: string;
  generatedAt: Date;
  organizationId: string;
  departmentId?: string;
  scope: "personal" | "shared";
  presentation_json: unknown;
  rows: readonly Record<string, unknown>[];
  blocks?: readonly ReportPdfBlock[];
}

export interface ReportPdfBlock {
  title: string;
  presentation_json: unknown;
  rows: readonly Record<string, unknown>[];
}

/**
 * Renderer consumido pelo coordenador de exportação do snapshot: o chamador
 * entrega a projeção autorizada, a apresentação persistida e o contexto de
 * timbrado. O renderer não consulta adapters, definição ou dados vivos.
 */
export interface ReportPdfRenderer {
  readonly format: typeof REPORT_PDF_FORMAT;
  readonly contentType: typeof REPORT_PDF_CONTENT_TYPE;
  render(input: ReportPdfRenderInput): Promise<Buffer>;
}

function defaultDocumentFactory(options: PdfDocumentOptions): PdfDocumentLike {
  const require = createRequire(import.meta.url);
  const PdfDocument = require("pdfkit") as new (options: PdfDocumentOptions) => PdfDocumentLike;
  return new PdfDocument(options);
}

function presentationColumns(value: unknown): { title?: string; columns: PresentationColumn[] } {
  if (typeof value !== "object" || value === null) {
    throw new ServiceError(400, "A apresentação do relatório é inválida.");
  }
  const presentation = value as { columns?: unknown[]; title?: unknown };
  if (!Array.isArray(presentation.columns)) {
    throw new ServiceError(400, "A apresentação do relatório é inválida.");
  }

  const columns = presentation.columns.map((column: unknown) => {
    if (typeof column !== "object" || column === null) {
      throw new ServiceError(400, "A apresentação do relatório é inválida.");
    }
    const candidate = column as Record<string, unknown>;
    const key = candidate.key ?? candidate.alias ?? candidate.field;
    if (typeof key !== "string" || key.length === 0) {
      throw new ServiceError(400, "A apresentação do relatório é inválida.");
    }
    return {
      key,
      label: typeof candidate.label === "string" ? candidate.label : key,
      format:
        typeof candidate.format === "string"
          ? candidate.format
          : typeof candidate.value_type === "string"
            ? candidate.value_type
            : typeof candidate.valueType === "string"
              ? candidate.valueType
              : undefined,
    };
  });

  return {
    title: typeof presentation.title === "string" ? presentation.title : undefined,
    columns,
  };
}

function formatValue(value: unknown, format?: string): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();

  if (format === "number" || format === "currency" || format === "percent") {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isNaN(number)) {
      return new Intl.NumberFormat("pt-BR", {
        style: format === "currency" ? "currency" : format === "percent" ? "percent" : "decimal",
        currency: format === "currency" ? "BRL" : undefined,
        maximumFractionDigits: 2,
      }).format(format === "percent" ? number / 100 : number);
    }
  }

  if (format === "date" || format === "datetime") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.valueOf())) {
      return format === "date"
        ? date.toLocaleDateString("pt-BR", { timeZone: "UTC" })
        : date.toLocaleString("pt-BR", { timeZone: "UTC" });
    }
  }

  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function dateParts(value: Date): { date: string; time: string } {
  return {
    date: value.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
    time: value.toLocaleTimeString("pt-BR", { timeZone: "UTC" }),
  };
}

export class ReportPdfService implements ReportPdfRenderer {
  readonly format = REPORT_PDF_FORMAT;
  readonly contentType = REPORT_PDF_CONTENT_TYPE;

  constructor(
    private readonly letterheads: Pick<ReportLetterheadService, "select">,
    private readonly createDocument: PdfDocumentFactory = defaultDocumentFactory,
  ) {}

  async render(input: ReportPdfRenderInput): Promise<Buffer> {
    const blocks = input.blocks?.length
      ? input.blocks
      : [{ title: "", presentation_json: input.presentation_json, rows: input.rows }];
    const preparedBlocks = blocks.map((block) => {
      const presentation = presentationColumns(block.presentation_json);
      if (presentation.columns.length === 0) {
        throw new ServiceError(400, "A apresentação do relatório não possui colunas.");
      }
      return { ...block, presentation };
    });

    const letterhead = await this.letterheads.select({
      organizationId: input.organizationId,
      departmentId: input.departmentId,
      scope: input.scope,
    });
    const document = this.createDocument({
      size: "A4",
      margin: 0,
      info: { Author: input.author, CreationDate: input.generatedAt },
    });

    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      document.on("data", (chunk) => chunks.push(Buffer.from(chunk as Uint8Array)));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", (error) => reject(error));

      try {
        this.drawPageStart(document, letterhead.bytes, input.author, input.generatedAt);
        let y = CONTENT_TOP;
        for (const block of preparedBlocks) {
          const title = block.title || block.presentation.title;
          if (y + ROW_HEIGHT * (title ? 2 : 1) > A4_HEIGHT - FOOTER_BOTTOM) {
            this.drawFooter(document, input.generatedAt);
            document.addPage({
              size: "A4",
              margin: 0,
              info: { Author: input.author, CreationDate: input.generatedAt },
            });
            this.drawPageStart(document, letterhead.bytes, input.author, input.generatedAt);
            y = CONTENT_TOP;
          }
          y = this.drawTableHeader(document, block.presentation, title || undefined);
          if (block.rows.length === 0) {
            document
              .fillColor("#4b5563")
              .fontSize(8)
              .text("Nenhum registro encontrado nesta área.", MARGIN, y);
            y += ROW_HEIGHT;
            continue;
          }
          for (const row of block.rows) {
            if (y + ROW_HEIGHT > A4_HEIGHT - FOOTER_BOTTOM) {
              this.drawFooter(document, input.generatedAt);
              document.addPage({
                size: "A4",
                margin: 0,
                info: { Author: input.author, CreationDate: input.generatedAt },
              });
              this.drawPageStart(document, letterhead.bytes, input.author, input.generatedAt);
              y = this.drawTableHeader(document, block.presentation, title || undefined);
            }
            this.drawRow(document, block.presentation.columns, row, y);
            y += ROW_HEIGHT;
          }
        }
        this.drawFooter(document, input.generatedAt);
        document.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private drawPageStart(
    document: PdfDocumentLike,
    background: Buffer | undefined,
    author: string,
    generatedAt: Date,
  ): void {
    if (background) {
      document.image(background, 0, 0, { width: A4_WIDTH, height: A4_HEIGHT });
    } else {
      document.fillColor(FALLBACK_COLOR).rect(0, 0, A4_WIDTH, A4_HEIGHT).fill();
      document
        .fillColor(BORDER_COLOR)
        .rect(MARGIN, 36, A4_WIDTH - MARGIN * 2, 36)
        .fill();
    }

    const parts = dateParts(generatedAt);
    document.fillColor("#111827").fontSize(9).text(`Autor: ${author}`, MARGIN, 48);
    document.fontSize(8).text(`Data: ${parts.date} | Hora: ${parts.time}`, MARGIN, 62);
  }

  private drawTableHeader(
    document: PdfDocumentLike,
    presentation: { columns: PresentationColumn[] },
    title?: string,
  ): number {
    let y = CONTENT_TOP;
    if (title) {
      document.fillColor("#111827").fontSize(14).text(title, MARGIN, y);
      y += 24;
    }
    document.fontSize(9);
    this.drawCells(
      document,
      presentation.columns.map((column) => column.label),
      y,
      true,
    );
    return y + ROW_HEIGHT;
  }

  private drawRow(
    document: PdfDocumentLike,
    columns: readonly PresentationColumn[],
    row: Record<string, unknown>,
    y: number,
  ): void {
    this.drawCells(
      document,
      columns.map((column) => formatValue(row[column.key], column.format)),
      y,
      false,
    );
  }

  private drawCells(
    document: PdfDocumentLike,
    values: readonly string[],
    y: number,
    header: boolean,
  ): void {
    const width = (A4_WIDTH - MARGIN * 2) / values.length;
    values.forEach((value, index) => {
      document
        .fillColor(header ? "#1f2937" : "#111827")
        .fontSize(header ? 9 : 8)
        .text(value, MARGIN + width * index, y, { width: width - 8, height: ROW_HEIGHT });
    });
    document
      .fillColor(BORDER_COLOR)
      .moveTo(MARGIN, y + ROW_HEIGHT - 2)
      .lineTo(A4_WIDTH - MARGIN, y + ROW_HEIGHT - 2)
      .stroke();
  }

  private drawFooter(document: PdfDocumentLike, generatedAt: Date): void {
    const parts = dateParts(generatedAt);
    document
      .fontSize(8)
      .fillColor("#4b5563")
      .text(`Data: ${parts.date} | Hora: ${parts.time}`, MARGIN, A4_HEIGHT - FOOTER_BOTTOM);
  }
}
