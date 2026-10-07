import PDFDocument from "pdfkit";

import type { CoringaClient } from "./clientCoringaService.js";

const columns = [
  { label: "Código Domínio", width: 48, value: (row: CoringaClient) => row.dominio_code },
  {
    label: "Empresa",
    width: 90,
    value: (row: CoringaClient) => row.company_name?.trim() || row.name,
  },
  { label: "CNPJ", width: 65, value: (row: CoringaClient) => row.cpf_cnpj },
  { label: "Regime", width: 65, value: (row: CoringaClient) => row.regime },
  {
    label: "Data Entrada",
    width: 48,
    value: (row: CoringaClient) =>
      row.created_at
        ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(row.created_at)
        : null,
  },
  { label: "Porte", width: 38, value: (row: CoringaClient) => row.size },
  { label: "Segmento", width: 60, value: (row: CoringaClient) => row.segment },
  { label: "Status", width: 55, value: (row: CoringaClient) => row.coringa_status },
  { label: "Contábil", width: 40, value: (row: CoringaClient) => booleanLabel(row.contabil) },
  { label: "Fiscal", width: 37, value: (row: CoringaClient) => booleanLabel(row.fiscal) },
  { label: "Pessoal", width: 38, value: (row: CoringaClient) => booleanLabel(row.pessoal) },
  { label: "Tecnologia", width: 48, value: (row: CoringaClient) => booleanLabel(row.tecnologia) },
  { label: "Infoproduto", width: 50, value: (row: CoringaClient) => booleanLabel(row.infoproduto) },
  { label: "Consultoria", width: 48, value: (row: CoringaClient) => booleanLabel(row.consultoria) },
  { label: "Licitação", width: 45, value: (row: CoringaClient) => booleanLabel(row.licitacao) },
] as const;

function booleanLabel(value: boolean | null): string | null {
  return value === null ? null : value ? "Sim" : "Não";
}

function drawHeader(document: PDFKit.PDFDocument, count: number): void {
  document.font("Helvetica-Bold").fontSize(15).fillColor("#18243d").text("REGULARIZE", 28, 25);
  document.font("Helvetica").fontSize(10).text(`Clientes (${count})`, 28, 48);
  document.moveTo(28, 66).lineTo(814, 66).strokeColor("#b8c2d1").stroke();
  let x = 28;
  document.font("Helvetica-Bold").fontSize(6.5).fillColor("#17253c");
  for (const column of columns) {
    document.text(column.label, x + 2, 76, { width: column.width - 4, height: 28 });
    x += column.width;
  }
  document.moveTo(28, 107).lineTo(814, 107).strokeColor("#b8c2d1").stroke();
}

export function createCoringaPdf(count: number): {
  document: PDFKit.PDFDocument;
  append(row: CoringaClient): void;
  end(): void;
} {
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 28, compress: true });
  drawHeader(document, count);
  let y = 110;
  let index = 0;
  let needsTablePage = false;
  return {
    document,
    append(row: CoringaClient): void {
      document.font("Helvetica").fontSize(6.5);
      const values = columns.map((column) => column.value(row) ?? "");
      const heights = columns.map(
        (column, columnIndex) =>
          Math.ceil(document.heightOfString(values[columnIndex], { width: column.width - 4 })) + 6,
      );
      const measuredHeight = Math.max(26, ...heights);
      const needsDetailPage = measuredHeight > 446;
      const rowHeight = needsDetailPage ? 26 : measuredHeight;
      if (needsTablePage) {
        document.addPage();
        drawHeader(document, count);
        y = 110;
        needsTablePage = false;
      }
      if (y + rowHeight > 556) {
        document.addPage();
        drawHeader(document, count);
        y = 110;
      }
      if (index % 2 === 0) document.rect(28, y, 786, rowHeight).fill("#f3f6fa");
      let x = 28;
      document.font("Helvetica").fontSize(6.5).fillColor("#23314a");
      for (const [columnIndex, column] of columns.entries()) {
        document.text(
          needsDetailPage && heights[columnIndex] > 20 ? "Ver detalhes" : values[columnIndex],
          x + 2,
          y + 3,
          {
            width: column.width - 4,
            height: rowHeight - 6,
          },
        );
        x += column.width;
      }
      y += rowHeight;
      index += 1;
      if (needsDetailPage) {
        document.addPage();
        document
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#18243d")
          .text(`Dados completos — cliente ${index}`, 28, 28, { width: 786 });
        for (const [columnIndex, column] of columns.entries()) {
          document.moveDown(0.4);
          document.font("Helvetica-Bold").fontSize(8).text(column.label, { width: 786 });
          document.font("Helvetica").fontSize(8).text(values[columnIndex], { width: 786 });
        }
        needsTablePage = true;
      }
    },
    end(): void {
      if (index === 0) {
        document
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#596579")
          .text("Nenhum cliente encontrado para os filtros selecionados.", 28, 125);
      }
      document.end();
    },
  };
}
