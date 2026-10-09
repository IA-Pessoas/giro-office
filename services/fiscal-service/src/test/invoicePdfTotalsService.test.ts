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
    expect(
      result.invoices.map((invoice) => [
        invoice.file_name,
        invoice.value,
        invoice.origin,
        invoice.occurrences,
      ]),
    ).toEqual([
      [
        "a.pdf",
        "1234.56",
        { page: 2, label: "Total a pagar", line: "Total a pagar: R$ 1.234,56" },
        1,
      ],
      ["b.pdf", "0.10", { page: 1, label: "Valor total", line: "R$ 0,10" }, 1],
      // O mesmo valor repetido na fatura não é ambiguidade: somado uma vez.
      ["c.pdf", "0.20", { page: 1, label: "Valor a pagar", line: "Valor a pagar R$ 0,20" }, 2],
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

  it("trata cabeçalho de tabela como ambíguo em vez de somar a primeira coluna", async () => {
    const header = await renderPdf([["Valor total Desconto Total a pagar", "100,00 10,00 90,00"]]);
    const outcome = sumInvoicePdfs({ files: [file("tabela.pdf", header)] });
    expect(outcome.invoices).toEqual([]);
    expect(outcome.ambiguous[0]?.reason).toBe(
      "Rótulos de total em cabeçalho de tabela; não é possível saber qual valor é o total.",
    );
  });

  it("separa cada rótulo da mesma linha e ignora subtotais de DANFE", async () => {
    const sameLine = await renderPdf([
      [
        "Valor total dos produtos R$ 80,00 Valor total da nota R$ 90,00",
        "Valor total dos tributos R$ 9,00",
      ],
    ]);
    const outcome = sumInvoicePdfs({ files: [file("danfe.pdf", sameLine)] });
    expect(outcome.invoices.map((invoice) => [invoice.value, invoice.origin.label])).toEqual([
      ["90.00", "Valor total"],
    ]);
  });

  it("lê crédito negativo e não corta milhares", async () => {
    const credit = await renderPdf([["Nota de crédito", "Total a pagar (1.000,50)"]]);
    const spaced = await renderPdf([["Fatura", "Total a pagar R$ 1 234,56"]]);
    const outcome = sumInvoicePdfs({
      files: [file("credito.pdf", credit), file("espaco.pdf", spaced)],
    });
    expect(outcome.invoices.map((invoice) => invoice.value)).toEqual(["-1000.50", "1234.56"]);
    expect(outcome.totals.value).toBe("234.06");
    const csv = invoicePdfTotalsCsvExport(outcome).csv;
    expect(csv).toContain("Somada;credito.pdf;1;Total a pagar;(1000,50);");
  });

  it("não soma de novo a mesma fatura reexportada com outros bytes", async () => {
    const original = await renderPdf([["Fatura 9", "Total a pagar R$ 9,00"]], true);
    const reexported = await renderPdf([["Fatura 9", "Total a pagar R$ 9,00"]], false);
    const outcome = sumInvoicePdfs({ files: [file("1.pdf", original), file("2.pdf", reexported)] });
    expect(outcome.totals).toEqual({ value: "9.00", invoices: 1 });
    expect(outcome.not_processed).toEqual([
      { file_name: "2.pdf", reason: "Mesmo conteúdo de 1.pdf; não somada de novo." },
    ]);
  });

  it("exporta faturas, origem e totais coerentes com o detalhamento", () => {
    const { csv, file_name } = invoicePdfTotalsCsvExport(result);
    expect(file_name).toBe("totais-faturas-pdf.csv");
    const lines = csv.replace(/^﻿/u, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Situação;Arquivo;Página;Rótulo;Valor;Linha do PDF;Observação");
    expect(lines).toContain("Totais;;;;1234,86;;3 fatura(s) somada(s)");
    expect(lines).toContain("Somada;a.pdf;2;Total a pagar;1234,56;Total a pagar: R$ 1.234,56;");
    expect(lines).toContain(
      "Somada;c.pdf;1;Valor a pagar;0,20;Valor a pagar R$ 0,20;Mesmo valor em 2 pontos, somado uma vez",
    );
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
