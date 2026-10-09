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
        unreadable_pages: [],
      });
    }
  });

  it("lê fonte Type0 com ToUnicode e recusa sem o mapa", () => {
    expect(extractPdfText(type0Pdf("Valor total\nR$ 99,90"))).toEqual({
      kind: "text",
      pages: ["Valor total\nR$ 99,90"],
      unreadable_pages: [],
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

  it("lê texto em Form XObject e aponta página escaneada (só imagem)", () => {
    const pdf = (objects: string[]) => {
      let body = "%PDF-1.4\n";
      objects.forEach((object, index) => {
        body += `${index + 1} 0 obj\n${object}\nendobj\n`;
      });
      return Buffer.from(`${body}trailer << /Root 1 0 R >>\n`, "latin1");
    };
    const form = "BT /F1 12 Tf 50 700 Td (Total a pagar R$ 5,00) Tj ET";
    const image = "q 100 0 0 100 0 0 cm /Im1 Do Q";
    const result = extractPdfText(
      pdf([
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R 8 0 R] /Count 2 >>",
        "<< /Type /Page /Parent 2 0 R /Resources << /XObject << /X1 5 0 R >> >> /Contents 4 0 R >>",
        "<< /Length 7 >>\nstream\n/X1 Do\nendstream",
        `<< /Type /XObject /Subtype /Form /Resources << /Font << /F1 6 0 R >> >> /Length ${form.length} >>\nstream\n${form}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /Length 1 >>\nstream\nx\nendstream",
        "<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 7 0 R >> >> /Contents 9 0 R >>",
        `<< /Length ${image.length} >>\nstream\n${image}\nendstream`,
      ]),
    );
    expect(result).toEqual({
      kind: "text",
      pages: ["Total a pagar R$ 5,00", ""],
      unreadable_pages: [2],
    });
  });

  it("resiste a PDF hostil sem travar nem estourar memória", async () => {
    const { deflateSync } = await import("node:zlib");
    const started = Date.now();
    // Sequência longa de dígitos (regex de objetos) e /N gigante em object stream.
    expect(
      extractPdfText(Buffer.from(`%PDF-1.4\n${"9".repeat(300_000)} obj`, "latin1")),
    ).toMatchObject({
      kind: "unsupported",
    });
    const objStm = deflateSync(Buffer.from("1 0 << /Type /Catalog >>"));
    const hugeN = Buffer.concat([
      Buffer.from(
        `%PDF-1.5\n1 0 obj\n<< /Type /ObjStm /N 99999999999 /First 4 /Filter /FlateDecode /Length ${objStm.length} >>\nstream\n`,
        "latin1",
      ),
      objStm,
      Buffer.from("\nendstream\nendobj\n", "latin1"),
    ]);
    expect(extractPdfText(hugeN)).toMatchObject({ kind: "unsupported" });
    // Mesmo stream comprimido referenciado mil vezes e várias bombas pequenas: orçamento total.
    const bomb = deflateSync(Buffer.alloc(4 * 1024 * 1024, 0x20));
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${Array.from({ length: 8 }, (_, i) => `${i + 3} 0 R`).join(" ")}] /Count 8 >>`,
      ...Array.from(
        { length: 8 },
        (_, i) =>
          `<< /Type /Page /Parent 2 0 R /Contents [${Array(1000)
            .fill(`${i + 11} 0 R`)
            .join(" ")}] >>`,
      ),
    ];
    let head = "%PDF-1.4\n";
    objects.forEach((object, index) => {
      head += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const streams = Array.from({ length: 8 }, (_, i) =>
      Buffer.concat([
        Buffer.from(
          `${i + 11} 0 obj\n<< /Filter /FlateDecode /Length ${bomb.length} >>\nstream\n`,
          "latin1",
        ),
        bomb,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]),
    );
    expect(extractPdfText(Buffer.concat([Buffer.from(head, "latin1"), ...streams]))).toEqual({
      kind: "unsupported",
      message: "PDF excede o limite de processamento (conteúdo descompactado grande demais).",
    });
    // CMap com muitas faixas grandes e marcadores sem fechamento.
    const ranges = Array.from({ length: 2000 }, () => "<0000> <FFFF> <0041>").join("\n");
    const cmap = `begincmap\n2000 beginbfrange\n${ranges}\nendbfrange\n${"beginbfchar <00".repeat(20_000)}`;
    const hostileFont = type0Pdf("Total")
      .toString("latin1")
      .replace(/stream\n\/CIDInit[\s\S]*?endstream/u, `stream\n${cmap}\nendstream`)
      .replace(
        /<< \/Length \d+ >>\nstream\nbegincmap/u,
        `<< /Length ${cmap.length} >>\nstream\nbegincmap`,
      );
    expect(extractPdfText(Buffer.from(hostileFont, "latin1")).kind).toBeTypeOf("string");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
