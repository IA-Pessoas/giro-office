import { describe, expect, it } from "vitest";

import { invoicePdfTotalsCsvExport, sumInvoicePdfs } from "../services/invoicePdfTotalsService.js";
import { renderPdf, type0Pdf } from "./pdfFixtures.js";

const file = (file_name: string, pdf: Buffer) => ({
  file_name,
  content_base64: pdf.toString("base64"),
});

describe("sumInvoicePdfs", async () => {
  const a = await renderPdf([
    ["Fatura 001", "Vencimento 10/09/2026"],
    ["Resumo", "Total a pagar: R$ 1.234,56"],
  ]);
  const b = type0Pdf("Fatura 002\nValor total\nR$ 0,10");
  const repeated = await renderPdf([
    ["Fatura 003", "Valor a pagar R$ 0,20", "Total a pagar R$ 0,20"],
  ]);
  const ambiguous = await renderPdf([
    ["Fatura 004", "Total da fatura R$ 50,00", "Valor total R$ 55,00"],
  ]);
  const none = await renderPdf([["Boleto sem total legível"]]);
  const result = sumInvoicePdfs({
    files: [
      file("a.pdf", a),
      file("b.pdf", b),
      file("c.pdf", repeated),
      file("a-copia.pdf", a),
      file("d.pdf", ambiguous),
      file("e.pdf", none),
      file("f.pdf", type0Pdf("Total", false)),
      { file_name: "g.pdf", content_base64: Buffer.from("não sou pdf").toString("base64") },
    ],
  });

  it("soma o total de cada fatura aceita em centavos e mostra a página de origem", () => {
    expect(result.invoices).toEqual([
      {
        file_name: "a.pdf",
        pages: 2,
        value: "1234.56",
        origin: { page: 2, label: "Total a pagar", line: "Total a pagar: R$ 1.234,56" },
      },
      {
        file_name: "b.pdf",
        pages: 1,
        value: "0.10",
        origin: { page: 1, label: "Valor total", line: "R$ 0,10" },
      },
      // O mesmo valor repetido na fatura não é ambiguidade.
      {
        file_name: "c.pdf",
        pages: 1,
        value: "0.20",
        origin: { page: 1, label: "Valor a pagar", line: "Valor a pagar R$ 0,20" },
      },
    ]);
    expect(result.totals).toEqual({ value: "1234.86", invoices: 3 });
  });

  it("não soma extração ambígua, PDF ilegível, arquivo repetido ou sem total", () => {
    expect(result.ambiguous).toEqual([
      {
        file_name: "d.pdf",
        reason: "Mais de um total diferente na fatura, nenhum foi somado.",
        candidates: [
          { page: 1, label: "Total da fatura", value: "50.00", line: "Total da fatura R$ 50,00" },
          { page: 1, label: "Valor total", value: "55.00", line: "Valor total R$ 55,00" },
        ],
      },
    ]);
    expect(result.not_processed).toEqual([
      { file_name: "a-copia.pdf", reason: "Arquivo repetido de a.pdf." },
      {
        file_name: "e.pdf",
        reason: "Nenhum total de fatura encontrado (ex.: Total a pagar, Valor total).",
      },
      {
        file_name: "f.pdf",
        reason: "PDF sem camada de texto legível (escaneado ou fonte sem mapa de caracteres).",
      },
      { file_name: "g.pdf", reason: "Arquivo não é PDF." },
    ]);
    expect(result.status).toBe("partial");
  });

  it("exporta faturas, origem e totais coerentes com o detalhamento", () => {
    const { csv, file_name } = invoicePdfTotalsCsvExport(result);
    expect(file_name).toBe("totais-faturas-pdf.csv");
    const lines = csv.replace(/^﻿/u, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Situação;Arquivo;Página;Rótulo;Valor;Linha do PDF;Observação");
    expect(lines).toContain("Totais;;;;1234,86;;3 fatura(s) somada(s)");
    expect(lines).toContain("Somada;a.pdf;2;Total a pagar;1234,56;Total a pagar: R$ 1.234,56;");
    expect(lines).toContain(
      "Ambígua;d.pdf;1;Valor total;55,00;Valor total R$ 55,00;Mais de um total diferente na fatura, nenhum foi somado.",
    );
    expect(lines).toContain("Não processada;g.pdf;;;;;Arquivo não é PDF.");
    const summed = lines
      .filter((line) => line.startsWith("Somada;"))
      .reduce(
        (total, line) => total + Math.round(Number(line.split(";")[4]?.replace(",", ".")) * 100),
        0,
      );
    expect(summed).toBe(123486);
  });

  it("fica completo quando todas as faturas foram somadas", () => {
    const clean = sumInvoicePdfs({ files: [file("b.pdf", b)] });
    expect(clean.status).toBe("complete");
    expect(clean.supported_format).toMatch(/camada de texto/u);
  });
});
