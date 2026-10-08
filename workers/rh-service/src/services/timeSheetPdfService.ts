// Build standalone do pdfkit: roda no workerd (fontes AFM embutidas, sem fs nem WASM).
import PdfDocument from "pdfkit/js/pdfkit.standalone.js";

import type { TimeSheetDaySnapshot, TimeSheetTotals } from "./timeSheetService.js";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 18;

export interface TimeSheetPdfRenderInput {
  employeeName: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  days: TimeSheetDaySnapshot[];
  totals: TimeSheetTotals;
  signature: string | null;
}

type PdfDocumentLike = InstanceType<typeof PdfDocument>;

function createDocument(): PdfDocumentLike {
  return new PdfDocument({
    size: "A4",
    margin: 0,
    info: { Title: "Folha de ponto", Author: "RH" },
  });
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { timeZone: "UTC" });
}

function formatMinutes(value: number): string {
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 60)}h ${absolute % 60}min`;
}

function signatureBuffer(signature: string | null): Buffer | null {
  if (!signature?.startsWith("data:image/")) return null;
  const separator = signature.indexOf(",");
  if (separator < 0) return null;
  try {
    const buffer = Buffer.from(signature.slice(separator + 1), "base64");
    const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    return isPng || isJpeg ? buffer : null;
  } catch {
    return null;
  }
}

function drawText(
  document: PdfDocumentLike,
  value: string,
  x: number,
  y: number,
  width = CONTENT_WIDTH,
  size = 8,
): void {
  document.fillColor("#111827").fontSize(size).text(value, x, y, { width });
}

export async function renderTimeSheetPdf(input: TimeSheetPdfRenderInput): Promise<Uint8Array> {
  const document = createDocument();
  const chunks: Uint8Array[] = [];

  return await new Promise<Uint8Array>((resolve, reject) => {
    // Os chunks vêm do shim de Buffer do bundle; concatena como Uint8Array.
    document.on("data", (chunk) => chunks.push(new Uint8Array(chunk as Uint8Array)));
    document.on("end", () => {
      const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(output);
    });
    document.on("error", (error) => reject(error));

    try {
      drawText(document, "FOLHA DE PONTO", MARGIN, 38, CONTENT_WIDTH, 18);
      drawText(document, `Colaborador: ${input.employeeName}`, MARGIN, 70, CONTENT_WIDTH, 10);
      drawText(
        document,
        `Período: ${formatDate(input.periodStart)} até ${formatDate(input.periodEnd)} | Status: ${input.status}`,
        MARGIN,
        88,
        CONTENT_WIDTH,
        9,
      );

      let y = 125;
      drawText(
        document,
        `Totais — trabalhado: ${formatMinutes(input.totals.worked_minutes)} | esperado: ${formatMinutes(input.totals.expected_minutes)} | saldo: ${formatMinutes(input.totals.balance_minutes)} | banco: ${formatMinutes(input.totals.bank_balance_minutes)}`,
        MARGIN,
        y,
        CONTENT_WIDTH,
        9,
      );
      drawText(
        document,
        `Ausências: ${input.totals.absence_count}`,
        MARGIN,
        y + 16,
        CONTENT_WIDTH,
        9,
      );
      y += 42;

      const columns = [
        { label: "Data", width: 50 },
        { label: "Entrada", width: 88 },
        { label: "Almoço", width: 88 },
        { label: "Volta", width: 88 },
        { label: "Saída", width: 88 },
        { label: "Saldo", width: 70 },
        { label: "Status", width: 81 },
      ];
      let x = MARGIN;
      for (const column of columns) {
        drawText(document, column.label, x, y, column.width, 8);
        x += column.width;
      }
      document
        .fillColor("#94a3b8")
        .moveTo(MARGIN, y + ROW_HEIGHT - 3)
        .lineTo(PAGE_WIDTH - MARGIN, y + ROW_HEIGHT - 3)
        .stroke();
      y += ROW_HEIGHT;

      for (const day of input.days) {
        if (y > PAGE_HEIGHT - 95) {
          document.addPage({ size: "A4", margin: 0 });
          y = 48;
        }
        const values = [
          day.date,
          formatDateTime(day.clock_in),
          formatDateTime(day.lunch_out),
          formatDateTime(day.lunch_in),
          formatDateTime(day.clock_out),
          formatMinutes(day.balance_minutes),
          day.status,
        ];
        x = MARGIN;
        values.forEach((value, index) => {
          drawText(document, value, x, y, columns[index].width, 7);
          x += columns[index].width;
        });
        document
          .fillColor("#cbd5e1")
          .moveTo(MARGIN, y + ROW_HEIGHT - 3)
          .lineTo(PAGE_WIDTH - MARGIN, y + ROW_HEIGHT - 3)
          .stroke();
        y += ROW_HEIGHT;
      }

      if (y > PAGE_HEIGHT - 125) {
        document.addPage({ size: "A4", margin: 0 });
        y = 48;
      }
      y += 25;
      drawText(document, "Assinatura do colaborador", MARGIN, y, CONTENT_WIDTH, 9);
      const image = signatureBuffer(input.signature);
      if (image) {
        // O shim de Buffer do bundle não reconhece o Buffer do runtime: passa ArrayBuffer exato.
        const bytes = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength);
        document.image(bytes as ArrayBuffer, MARGIN, y + 16, { fit: [180, 55] });
      } else {
        drawText(document, input.signature || "Não assinada", MARGIN, y + 18, 250, 10);
      }
      drawText(
        document,
        "Documento gerado a partir da versão registrada da folha.",
        MARGIN,
        PAGE_HEIGHT - 48,
        CONTENT_WIDTH,
        7,
      );
      document.end();
    } catch (error) {
      reject(error);
    }
  });
}
