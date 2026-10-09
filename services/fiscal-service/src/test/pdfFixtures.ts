/// <reference path="../pdfkitStandalone.d.ts" />
import PdfDocument from "pdfkit/js/pdfkit.standalone.js";

type PdfDoc = {
  on(event: string, listener: (value: unknown) => void): PdfDoc;
  text(value: string): PdfDoc;
  addPage(): PdfDoc;
  end(): void;
};

/** PDF sintético (pdfkit, Helvetica) com uma lista de linhas por página. */
export function renderPdf(pages: string[][], compress = true): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new (
      PdfDocument as new (options: {
        size: string;
        margin: number;
        compress: boolean;
      }) => PdfDoc
    )({
      size: "A4",
      margin: 56,
      compress,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    pages.forEach((lines, index) => {
      if (index > 0) doc.addPage();
      for (const line of lines) doc.text(line);
    });
    doc.end();
  });
}

/** PDF montado à mão com fonte Type0 (Identity-H) e mapa ToUnicode, como em PDFs de navegador. */
export function type0Pdf(text: string, withToUnicode = true): Buffer {
  const glyphs = [...new Set(text)];
  const code = (char: string) =>
    (glyphs.indexOf(char) + 1).toString(16).padStart(4, "0").toUpperCase();
  const cmap = [
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
    "1 begincodespacerange <0000> <FFFF> endcodespacerange",
    `${glyphs.length} beginbfchar`,
    ...glyphs.map(
      (char) => `<${code(char)}> <${char.charCodeAt(0).toString(16).padStart(4, "0")}>`,
    ),
    "endbfchar endcmap CMapName currentdict /CMap defineresource pop end end",
  ].join("\n");
  const content = text
    .split("\n")
    .map(
      (line, index) =>
        `BT /F1 12 Tf 1 0 0 1 50 ${750 - index * 20} Tm <${[...line].map(code).join("")}> Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type0 /BaseFont /Fake /Encoding /Identity-H${withToUnicode ? " /ToUnicode 6 0 R" : ""} >>`,
    `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
  ];
  let body = "%PDF-1.7\n";
  for (const [index, object] of objects.entries())
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  return Buffer.from(`${body}trailer\n<< /Root 1 0 R >>\n%%EOF\n`, "latin1");
}
