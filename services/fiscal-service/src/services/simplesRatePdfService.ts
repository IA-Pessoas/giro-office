/// <reference path="../pdfkitStandalone.d.ts" />
import PdfDocument from "pdfkit/js/pdfkit.standalone.js";

import type { SimplesRateEmission } from "./simplesRateService.js";

type TextOptions = { continued?: boolean; align?: "left" | "right" };
type PdfDoc = {
  on(event: string, listener: (value: unknown) => void): PdfDoc;
  font(name: string): PdfDoc;
  fontSize(size: number): PdfDoc;
  text(value: string, options?: TextOptions): PdfDoc;
  moveDown(size?: number): PdfDoc;
  end(): void;
};

function monthLabel(competence: string): string {
  return `${competence.slice(5, 7)}/${competence.slice(0, 4)}`;
}

export function simplesRatePdfFileName(emission: SimplesRateEmission): string {
  return `aliquota-${emission.tax}-anexo-${emission.annex}-${emission.applies_to}-${emission.client_id}.pdf`;
}

export function simplesRatePdfHeaders(emission: SimplesRateEmission): Record<string, string> {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${simplesRatePdfFileName(emission)}"`,
    "Cache-Control": "no-store",
  };
}

/** Carta ao cliente com a alíquota do mês seguinte, no texto do Pdf::iss legado. */
export function renderSimplesRatePdf(emission: SimplesRateEmission): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    // Sem compressão: o texto fica legível no arquivo e os testes conferem o conteúdo.
    const doc = new (
      PdfDocument as new (options: {
        size: string;
        layout: string;
        margin: number;
        compress: boolean;
      }) => PdfDoc
    )({ size: "A4", layout: "landscape", margin: 56, compress: false });
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk as Uint8Array)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error) => reject(error));

    const month = monthLabel(emission.applies_to);
    const rate = `${emission.rate.replace(".", ",")}%`;
    const invoices =
      emission.tax === "ISS"
        ? "notas fiscais de serviços eletrônicas"
        : "notas fiscais eletrônicas";

    doc.font("Helvetica").fontSize(16).text("Prezado cliente,");
    doc.moveDown(0.5);
    doc.text(`${emission.client_name} - ${emission.client_document}`);
    doc.moveDown(1.5);
    doc.text("Gostaríamos de informar que a ", { continued: true });
    doc.font("Helvetica-Bold").text(`Alíquota de ${emission.tax}`, { continued: true });
    doc
      .font("Helvetica")
      .text(` (Simples Nacional, Anexo ${emission.annex}) referente ao mês de ${month} é de `, {
        continued: true,
      });
    doc.font("Helvetica-Bold").text(rate, { continued: true });
    doc.font("Helvetica").text(".");
    doc.moveDown(1.5);
    doc.text(
      "Vale lembrar que essa é uma informação obrigatória e importante, visto que, caso essas informações sejam utilizadas de maneira errônea, pode onerar a empresa futuramente com atuação fiscal.",
    );
    doc.moveDown();
    doc.text(
      `Lembramos também que essa é uma informação mensal disponibilizada ao cliente, a fim de manter seus parâmetros de emissão de ${invoices} atualizados.`,
    );
    doc.moveDown();
    doc.text("Desde já, agradecemos pela atenção.");
    doc.moveDown(1.5);
    doc.text(`01/${month}`, { align: "right" });
    doc.end();
  });
}
