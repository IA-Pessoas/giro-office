import { csvLine } from "@workspace/shared";
import { extractPdfText } from "@workspace/shared/pdf";
import { brl, formatCents, parseCents } from "./documentConferenceService.js";

/**
 * Totais de faturas em PDF (FIS-14): lê o texto de cada PDF, procura o total da fatura por
 * rótulo ("Total a pagar", "Valor total"…) e soma em centavos as faturas com um único valor
 * (um total por PDF). Cada valor mostra arquivo, página e linha de origem; PDF ilegível (no todo
 * ou em alguma página), sem total, com totais diferentes, com rótulos em cabeçalho de tabela ou
 * repetido fica fora da soma e aparece no resultado. Nada é gravado.
 */

export const SUPPORTED_INVOICE_PDF =
  "Um total por PDF, em PDF com camada de texto (gerado por sistema, não escaneado), sem senha, com fontes padrão ou com mapa ToUnicode (inclusive texto em Form XObject). O total é procurado pelos rótulos Total a pagar, Total da fatura, Total da nota, Total geral, Total do documento, Valor total (exceto dos produtos, tributos, impostos, IPI, ICMS, frete, seguro, desconto ou aproximado), Valor a pagar, Valor da fatura, Valor cobrado e Valor do documento, com o valor em reais na mesma linha ou na seguinte. Valor negativo (sinal ou parênteses) entra como crédito. PDF com várias faturas deve ser separado por fatura.";

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
    /** Mesmo valor achado em mais de um ponto (ex.: resumo e canhoto): somado uma vez. */
    occurrences: number;
  }[];
  ambiguous: { file_name: string; reason: string; candidates: InvoiceCandidate[] }[];
  not_processed: { file_name: string; reason: string }[];
}

// ponytail: rótulos deduzidos dos modelos usuais de fatura; sem amostras reais anonimizadas, a
// compatibilidade não está validada (RF-10).
const LABEL =
  /\b(total\s+(?:a\s+pagar|da\s+fatura|da\s+nota|geral|do\s+documento)|valor\s+total(?!\s+(?:d[oa]s?\s+)?(?:produtos?|tributos?|impostos?|ipi|icms|frete|seguro|descontos?|aproximado))|valor\s+(?:a\s+pagar|da\s+fatura|cobrado|do\s+documento))\b/giu;
const IS_LABEL = new RegExp(LABEL.source, "iu");
// Fronteira à esquerda (não pega o fim de "1234.567,89"), milhar com ponto ou espaço único e
// sinal por "-" ou parênteses.
const MONEY =
  /(?<![\w.,])(-\s?)?(?:R\$\s?)?(-\s?)?(\()?(\d{1,3}(?:[. ]\d{3})+,\d{2}|\d+,\d{2})(\))?(?![\d,])/gu;

interface Money {
  cents: number;
  index: number;
}

function moneyIn(text: string): Money[] {
  return [...text.matchAll(MONEY)].flatMap((match) => {
    const cents = parseCents((match[4] ?? "").replace(/ /g, ""));
    if (cents === null) return [];
    const negative = Boolean(match[1] || match[2] || (match[3] && match[5]));
    return [{ cents: negative ? -cents : cents, index: match.index ?? 0 }];
  });
}

/** Candidatos de total por página; `table` sinaliza rótulos em cabeçalho com valores abaixo. */
function candidates(pages: string[]): { found: InvoiceCandidate[]; table: boolean } {
  const found: InvoiceCandidate[] = [];
  let table = false;
  pages.forEach((text, index) => {
    const lines = text.split("\n");
    lines.forEach((line, lineIndex) => {
      const labels = [...line.matchAll(LABEL)];
      labels.forEach((label, labelIndex) => {
        const start = (label.index ?? 0) + label[0].length;
        const segment = line.slice(start, labels[labelIndex + 1]?.index ?? line.length);
        const sameLine = moneyIn(segment)[0];
        let money = sameLine;
        let origin = line;
        if (!money) {
          const nextLine = lines[lineIndex + 1] ?? "";
          const below = IS_LABEL.test(nextLine) ? [] : moneyIn(nextLine);
          // Vários rótulos (ou vários valores abaixo) é cabeçalho de tabela: não dá para saber
          // qual coluna é de qual rótulo sem a posição na página.
          if (below.length > 1 || (labels.length > 1 && below.length > 0)) {
            table = true;
            return;
          }
          money = below[0];
          origin = nextLine;
        }
        if (!money) return;
        found.push({
          page: index + 1,
          label: label[1] ?? label[0],
          value: formatCents(money.cents),
          line: origin,
        });
      });
    });
  });
  return { found, table };
}

const normalizedText = (pages: string[]) => pages.join("\n").replace(/\s+/gu, " ").trim();

export function sumInvoicePdfs(input: {
  files: { file_name: string; content_base64: string }[];
}): InvoicePdfTotalsResult {
  const result: Omit<InvoicePdfTotalsResult, "status" | "totals" | "supported_format"> = {
    invoices: [],
    ambiguous: [],
    not_processed: [],
  };
  const seenBytes: { file_name: string; body: Buffer }[] = [];
  const seenText = new Map<string, string>();
  let totalCents = 0;

  for (const { file_name, content_base64 } of input.files) {
    const body = Buffer.from(content_base64, "base64");
    const sameBytes = seenBytes.find((item) => item.body.equals(body));
    if (sameBytes) {
      result.not_processed.push({
        file_name,
        reason: `Arquivo repetido de ${sameBytes.file_name}.`,
      });
      continue;
    }
    seenBytes.push({ file_name, body });

    const text = extractPdfText(body);
    if (text.kind === "unsupported") {
      result.not_processed.push({ file_name, reason: text.message });
      continue;
    }
    // Fatura reexportada (bytes diferentes, mesmo texto) também é repetição.
    const signature = normalizedText(text.pages);
    const sameText = seenText.get(signature);
    if (sameText) {
      result.not_processed.push({
        file_name,
        reason: `Mesmo conteúdo de ${sameText}; não somada de novo.`,
      });
      continue;
    }
    seenText.set(signature, file_name);
    if (text.unreadable_pages.length > 0) {
      result.not_processed.push({
        file_name,
        reason: `Página(s) ${text.unreadable_pages.join(", ")} sem texto legível (escaneada ou fonte sem mapa); o total poderia estar nela.`,
      });
      continue;
    }

    const { found, table } = candidates(text.pages);
    const values = [...new Set(found.map((candidate) => candidate.value))];
    const [first] = found;
    if (table) {
      result.ambiguous.push({
        file_name,
        reason:
          "Rótulos de total em cabeçalho de tabela; não é possível saber qual valor é o total.",
        candidates: found,
      });
    } else if (!first) {
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
      totalCents += parseCents(first.value) ?? 0;
      result.invoices.push({
        file_name,
        pages: text.pages.length,
        value: first.value,
        origin: { page: first.page, label: first.label, line: first.line },
        occurrences: found.length,
      });
    }
  }

  return {
    status: result.ambiguous.length + result.not_processed.length > 0 ? "partial" : "complete",
    supported_format: SUPPORTED_INVOICE_PDF,
    totals: { value: formatCents(totalCents), invoices: result.invoices.length },
    ...result,
  };
}

/** Negativo em formato contábil: o csvLine neutraliza "-10,00" como possível fórmula. */
const signedBrl = (value: string) =>
  value.startsWith("-") ? `(${brl(value.slice(1))})` : brl(value);

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
    signedBrl(result.totals.value),
    "",
    `${result.totals.invoices} fatura(s) somada(s)`,
  ]);
  for (const invoice of result.invoices) {
    lines.push([
      "Somada",
      invoice.file_name,
      invoice.origin.page,
      invoice.origin.label,
      signedBrl(invoice.value),
      invoice.origin.line,
      invoice.occurrences > 1 ? `Mesmo valor em ${invoice.occurrences} pontos, somado uma vez` : "",
    ]);
  }
  for (const item of result.ambiguous) {
    if (item.candidates.length === 0) {
      lines.push(["Ambígua", item.file_name, "", "", "", "", item.reason]);
    }
    for (const candidate of item.candidates) {
      lines.push([
        "Ambígua",
        item.file_name,
        candidate.page,
        candidate.label,
        signedBrl(candidate.value),
        candidate.line,
        item.reason,
      ]);
    }
  }
  for (const item of result.not_processed) {
    lines.push(["Não processada", item.file_name, "", "", "", "", item.reason]);
  }
  return {
    file_name: "totais-faturas-pdf.csv",
    csv: `﻿${lines.map((line) => csvLine(line, ";")).join("\r\n")}\r\n`,
  };
}
