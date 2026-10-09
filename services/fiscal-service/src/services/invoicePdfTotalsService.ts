import { csvLine } from "@workspace/shared";

import { brl, formatCents, parseCents } from "./documentConferenceService.js";
import { extractPdfText } from "./pdfText.js";

/**
 * Totais de faturas em PDF (FIS-14): lê o texto de cada PDF, procura o total da fatura por
 * rótulo ("Total a pagar", "Valor total"…) e soma em centavos só as faturas com um único valor.
 * Cada valor mostra arquivo, página e linha de origem; PDF ilegível, sem total, com totais
 * diferentes ou repetido fica fora da soma e aparece no resultado. Nada é gravado.
 */

export const SUPPORTED_INVOICE_PDF =
  "PDF com camada de texto (gerado por sistema, não escaneado), sem senha, com fontes padrão ou com mapa ToUnicode. O total é procurado pelos rótulos Total a pagar, Total da fatura, Total geral, Total do documento, Valor total, Valor a pagar, Valor da fatura, Valor cobrado e Valor do documento, com o valor em reais na mesma linha ou na seguinte.";

export interface InvoiceCandidate {
  page: number;
  label: string;
  value: string;
  line: string;
}

export interface InvoicePdfTotalsResult {
  status: "complete" | "partial";
  supported_format: string;
  totals: { value: string; invoices: number };
  invoices: {
    file_name: string;
    pages: number;
    value: string;
    origin: { page: number; label: string; line: string };
  }[];
  ambiguous: { file_name: string; reason: string; candidates: InvoiceCandidate[] }[];
  not_processed: { file_name: string; reason: string }[];
}

// ponytail: rótulos deduzidos dos modelos usuais de fatura; sem amostras reais anonimizadas, a
// compatibilidade não está validada (RF-10).
const LABEL =
  /\b(total\s+(?:a\s+pagar|da\s+fatura|geral|do\s+documento)|valor\s+(?:total|a\s+pagar|da\s+fatura|cobrado|do\s+documento))\b/iu;
const MONEY = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)/u;

function candidates(pages: string[]): InvoiceCandidate[] {
  const found: InvoiceCandidate[] = [];
  pages.forEach((text, index) => {
    const lines = text.split("\n");
    lines.forEach((line, lineIndex) => {
      const label = LABEL.exec(line);
      if (!label) return;
      const after = line.slice((label.index ?? 0) + label[0].length);
      const sameLine = MONEY.exec(after);
      const nextLine = lines[lineIndex + 1] ?? "";
      const money = sameLine ?? (LABEL.test(nextLine) ? null : MONEY.exec(nextLine));
      const cents = money?.[1] ? parseCents(money[1]) : null;
      if (cents === null) return;
      found.push({
        page: index + 1,
        label: label[1] ?? label[0],
        value: formatCents(cents),
        line: sameLine ? line : nextLine,
      });
    });
  });
  return found;
}

export function sumInvoicePdfs(input: {
  files: { file_name: string; content_base64: string }[];
}): InvoicePdfTotalsResult {
  const result: Omit<InvoicePdfTotalsResult, "status" | "totals" | "supported_format"> = {
    invoices: [],
    ambiguous: [],
    not_processed: [],
  };
  const seen: { file_name: string; body: Buffer }[] = [];

  for (const { file_name, content_base64 } of input.files) {
    const body = Buffer.from(content_base64, "base64");
    const original = seen.find((item) => item.body.equals(body));
    if (original) {
      result.not_processed.push({
        file_name,
        reason: `Arquivo repetido de ${original.file_name}.`,
      });
      continue;
    }
    seen.push({ file_name, body });

    const text = extractPdfText(body);
    if (text.kind === "unsupported") {
      result.not_processed.push({ file_name, reason: text.message });
      continue;
    }
    const found = candidates(text.pages);
    const values = [...new Set(found.map((candidate) => candidate.value))];
    const [first] = found;
    if (!first) {
      result.not_processed.push({
        file_name,
        reason: "Nenhum total de fatura encontrado (ex.: Total a pagar, Valor total).",
      });
    } else if (values.length > 1) {
      result.ambiguous.push({
        file_name,
        reason: "Mais de um total diferente na fatura, nenhum foi somado.",
        candidates: found,
      });
    } else {
      result.invoices.push({
        file_name,
        pages: text.pages.length,
        value: first.value,
        origin: { page: first.page, label: first.label, line: first.line },
      });
    }
  }

  const total = result.invoices.reduce((sum, invoice) => sum + (parseCents(invoice.value) ?? 0), 0);
  return {
    status: result.ambiguous.length + result.not_processed.length > 0 ? "partial" : "complete",
    supported_format: SUPPORTED_INVOICE_PDF,
    totals: { value: formatCents(total), invoices: result.invoices.length },
    ...result,
  };
}

/** CSV: totais, faturas somadas com a origem, candidatos ambíguos e arquivos não processados. */
export function invoicePdfTotalsCsvExport(result: InvoicePdfTotalsResult) {
  type Line = (string | number)[];
  const lines: Line[] = [
    ["Situação", "Arquivo", "Página", "Rótulo", "Valor", "Linha do PDF", "Observação"],
  ];
  if (result.status === "partial") {
    lines.push([
      "Resultado",
      "Total parcial: há faturas ambíguas ou não processadas fora da soma",
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  lines.push([
    "Totais",
    "",
    "",
    "",
    brl(result.totals.value),
    "",
    `${result.totals.invoices} fatura(s) somada(s)`,
  ]);
  for (const invoice of result.invoices) {
    lines.push([
      "Somada",
      invoice.file_name,
      invoice.origin.page,
      invoice.origin.label,
      brl(invoice.value),
      invoice.origin.line,
      "",
    ]);
  }
  for (const item of result.ambiguous) {
    for (const candidate of item.candidates) {
      lines.push([
        "Ambígua",
        item.file_name,
        candidate.page,
        candidate.label,
        brl(candidate.value),
        candidate.line,
        item.reason,
      ]);
    }
  }
  for (const item of result.not_processed)
    lines.push(["Não processada", item.file_name, "", "", "", "", item.reason]);
  return {
    file_name: "totais-faturas-pdf.csv",
    csv: `﻿${lines.map((line) => csvLine(line, ";")).join("\r\n")}\r\n`,
  };
}
