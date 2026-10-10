/** PDF sintético de uma página, sem compressão e com fonte padrão: uma linha de texto por item. */
export function lddPdf(lines: string[]): Buffer {
  const content = lines
    .map(
      (line, index) =>
        `BT /F1 10 Tf 1 0 0 1 40 ${800 - index * 14} Tm (${line.replace(/[\\()]/g, "\\$&")}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  for (const [index, object] of objects.entries()) {
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  return Buffer.from(`${body}trailer\n<< /Root 1 0 R >>\n%%EOF\n`, "latin1");
}

export const lddPdfBase64 = (lines: string[]): string => lddPdf(lines).toString("base64");
