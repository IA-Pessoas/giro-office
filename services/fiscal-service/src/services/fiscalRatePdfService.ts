/// <reference path="../pdfkitStandalone.d.ts" />
import PdfDocument from "pdfkit/js/pdfkit.standalone.js";

import type { FiscalRateDto } from "./fiscalRateService.js";

export function fiscalRatePdfHeaders(rate: FiscalRateDto) {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="aliquota-${rate.tax_type}-${rate.competence}-${rate.id}.pdf"`,
    "Cache-Control": "no-store",
  };
}

type PdfDoc = {
  on(event: string, listener: (value: unknown) => void): PdfDoc;
  fontSize(size: number): PdfDoc;
  text(value: string): PdfDoc;
  moveDown(size?: number): PdfDoc;
  end(): void;
};

export function renderFiscalRatePdf(rate: FiscalRateDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new (PdfDocument as new (options: { size: string; margin: number }) => PdfDoc)({
      size: "A4",
      margin: 48,
    });
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk as Uint8Array)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error) => reject(error));

    const [year, month] = rate.competence.split("-");
    doc.fontSize(18).text(`Alíquota de ${rate.tax_type}`);
    doc.moveDown();
    doc.fontSize(11).text(`Empresa: ${rate.client_name}`);
    doc.text(`CNPJ: ${rate.client_document}`);
    doc.text(`Competência: ${month}/${year}`);
    doc.text(`Tributo: ${rate.tax_type}`);
    doc.moveDown();
    doc.fontSize(15).text(`Alíquota informada: ${rate.rate.replace(".", ",")}%`);
    doc.moveDown();
    doc.fontSize(10).text("Alíquota informada manualmente pelo setor Fiscal.");
    doc.text(
      `Emitido em: ${new Date(rate.createdAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`,
    );
    doc.end();
  });
}
