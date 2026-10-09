import { describe, expect, it } from "vitest";

import { extractPdfText } from "../services/pdfText.js";
import { renderPdf, type0Pdf } from "./pdfFixtures.js";

describe("extractPdfText", () => {
  it("lê texto de PDF com fonte padrão, comprimido ou não, página por página", async () => {
    for (const compress of [true, false]) {
      const pdf = await renderPdf(
        [["Fatura 001", "Total a pagar: R$ 1.234,56"], ["Página dois"]],
        compress,
      );
      const result = extractPdfText(pdf);
      expect(result).toEqual({
        kind: "text",
        pages: ["Fatura 001\nTotal a pagar: R$ 1.234,56", "Página dois"],
      });
    }
  });

  it("lê fonte Type0 com ToUnicode e recusa sem o mapa", () => {
    expect(extractPdfText(type0Pdf("Valor total\nR$ 99,90"))).toEqual({
      kind: "text",
      pages: ["Valor total\nR$ 99,90"],
    });
    expect(extractPdfText(type0Pdf("Valor total", false))).toEqual({
      kind: "unsupported",
      message: "PDF sem camada de texto legível (escaneado ou fonte sem mapa de caracteres).",
    });
  });

  it("recusa arquivo que não é PDF, criptografado ou com filtro não suportado", () => {
    expect(extractPdfText(Buffer.from("texto"))).toMatchObject({
      kind: "unsupported",
      message: "Arquivo não é PDF.",
    });
    const encrypted = Buffer.from(
      `${type0Pdf("x").toString("latin1")}\ntrailer << /Encrypt 9 0 R >>`,
      "latin1",
    );
    expect(extractPdfText(encrypted)).toMatchObject({
      message: "PDF criptografado não é suportado.",
    });
    const lzw = type0Pdf("Total")
      .toString("latin1")
      .replace("<< /Length", "<< /Filter /LZWDecode /Length");
    expect(extractPdfText(Buffer.from(lzw, "latin1"))).toMatchObject({
      message: "PDF com compressão de conteúdo não suportada.",
    });
  });

  it("não trava com stream corrompido nem com objeto sem endobj", () => {
    const broken = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Filter /FlateDecode /Length 4 >>\nstream\nxxxx\nendstream\nendobj\n5 0 obj << sem fim`;
    expect(extractPdfText(Buffer.from(broken, "latin1"))).toMatchObject({ kind: "unsupported" });
  });
});
