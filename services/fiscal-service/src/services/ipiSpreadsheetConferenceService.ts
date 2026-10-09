import { csvLine, ServiceError } from "@workspace/shared";

import {
  brl,
  type ConferenceDocumentRow,
  type ConferenceSourceInput,
  formatCents,
  pairByIdentity,
  parseCents,
  parseNoteSpreadsheet,
  publicRow,
  type SpreadsheetInfo,
} from "./documentConferenceService.js";

/**
 * Conferência de IPI entre duas planilhas (FIS-13): pareia as notas pela identidade (chave de
 * acesso ou emitente + modelo + série + número) e compara o valor de IPI de cada fonte, com a
 * diferença em centavos. Duplicatas e linhas sem identidade ficam visíveis; nada é gravado.
 */

type SourceId = "first" | "second";

const LABEL: Record<SourceId, string> = { first: "planilha 1", second: "planilha 2" };

interface Pair {
  identity: string;
  first: ConferenceDocumentRow;
  second: ConferenceDocumentRow;
}

export interface IpiSpreadsheetConferenceResult {
  status: "complete" | "partial";
  identity_rule: string;
  sources: Record<SourceId, SpreadsheetInfo>;
  summary: {
    matched: number;
    divergent: number;
    only_first: number;
    only_second: number;
    duplicates: number;
    discarded: number;
    errors: number;
  };
  /** Somas do IPI das linhas lidas em cada planilha e a diferença (planilha 2 − planilha 1). */
  totals: { first: string; second: string; difference: string };
  matched: Pair[];
  divergent: (Pair & { difference: string; differences: string[] })[];
  only_first: ConferenceDocumentRow[];
  only_second: ConferenceDocumentRow[];
  duplicates: {
    identity: string;
    first: ConferenceDocumentRow[];
    second: ConferenceDocumentRow[];
  }[];
  discarded: { source: SourceId; line: number; reason: string }[];
  errors: { source: SourceId; line: number; message: string }[];
}

const IDENTITY_RULE =
  "Chave de acesso da NF-e quando informada; sem ela, emitente (CPF/CNPJ) + modelo + série + número. IPI pela coluna de IPI de cada planilha.";

const cents = (value: string | null) => (value === null ? 0 : (parseCents(value) ?? 0));
// Negativo em formato contábil: "-0,80" seria neutralizado como fórmula pelo csvLine, e o Excel
// em pt-BR lê "(0,80)" como número negativo.
const signedBrl = (value: string) =>
  value.startsWith("-") ? `(${brl(value.slice(1))})` : brl(value);

function readSource(source: SourceId, input: ConferenceSourceInput) {
  const parsed = parseNoteSpreadsheet(source, LABEL[source], input);
  if (!parsed.info.ipi_column) {
    throw new ServiceError(
      400,
      `Arquivo ${LABEL[source]}: o cabeçalho precisa ter uma coluna de IPI (ex.: Valor IPI).`,
    );
  }
  // IPI vazio não é zero presumido: a linha fica fora e aparece como erro.
  const missing = parsed.rows.filter((row) => row.ipi === null);
  return {
    info: { ...parsed.info, accepted_rows: parsed.rows.length - missing.length },
    rows: parsed.rows.filter((row) => row.ipi !== null),
    discarded: parsed.discarded,
    errors: [
      ...parsed.errors,
      ...missing.map((row) => ({ source, line: row.line, message: "IPI não informado." })),
    ].sort((a, b) => a.line - b.line),
  };
}

export function compareIpiSpreadsheets(input: {
  first: ConferenceSourceInput;
  second: ConferenceSourceInput;
}): IpiSpreadsheetConferenceResult {
  const first = readSource("first", input.first);
  const second = readSource("second", input.second);

  const buckets: Pick<
    IpiSpreadsheetConferenceResult,
    "matched" | "divergent" | "only_first" | "only_second" | "duplicates" | "discarded" | "errors"
  > = {
    matched: [],
    divergent: [],
    only_first: [],
    only_second: [],
    duplicates: [],
    discarded: [...first.discarded, ...second.discarded],
    errors: [...first.errors, ...second.errors],
  };

  for (const item of pairByIdentity(first.rows, second.rows)) {
    if (item.kind === "duplicate") {
      buckets.duplicates.push({
        identity: item.identity,
        first: item.left.map(publicRow),
        second: item.right.map(publicRow),
      });
    } else if (item.kind === "pair") {
      const pair = {
        identity: item.identity,
        first: publicRow(item.left),
        second: publicRow(item.right),
      };
      const difference = cents(pair.second.ipi) - cents(pair.first.ipi);
      const differences: string[] = [];
      if (
        pair.first.access_key &&
        pair.second.access_key &&
        pair.first.access_key !== pair.second.access_key
      ) {
        differences.push("Chave de acesso diferente");
      }
      if (difference !== 0 || differences.length > 0) {
        buckets.divergent.push({ ...pair, difference: formatCents(difference), differences });
      } else {
        buckets.matched.push(pair);
      }
    } else if (item.kind === "left") {
      buckets.only_first.push(publicRow(item.left));
    } else {
      buckets.only_second.push(publicRow(item.right));
    }
  }

  const summary = Object.fromEntries(
    Object.entries(buckets).map(([name, items]) => [name, items.length]),
  ) as IpiSpreadsheetConferenceResult["summary"];
  const total = (rows: { ipi: string | null }[]) =>
    rows.reduce((sum, row) => sum + cents(row.ipi), 0);
  const firstTotal = total(first.rows);
  const secondTotal = total(second.rows);
  return {
    status: summary.discarded + summary.errors + summary.duplicates > 0 ? "partial" : "complete",
    identity_rule: IDENTITY_RULE,
    sources: { first: first.info, second: second.info },
    summary,
    totals: {
      first: formatCents(firstTotal),
      second: formatCents(secondTotal),
      difference: formatCents(secondTotal - firstTotal),
    },
    ...buckets,
  };
}

/** CSV: totais e uma linha por nota com o IPI de cada planilha, a diferença e a situação. */
export function ipiSpreadsheetConferenceCsvExport(result: IpiSpreadsheetConferenceResult) {
  type Line = (string | number)[];
  const lines: Line[] = [
    [
      "Situação",
      "Identidade",
      "Linha planilha 1",
      "IPI planilha 1",
      "Linha planilha 2",
      "IPI planilha 2",
      "Diferença (2 − 1)",
      "Observação",
    ],
  ];
  if (result.status === "partial") {
    lines.push([
      "Resultado",
      "Conferência parcial: há linhas descartadas, com erro ou duplicadas",
      "",
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
    brl(result.totals.first),
    "",
    brl(result.totals.second),
    signedBrl(result.totals.difference),
    "",
  ]);
  const rows = (list: ConferenceDocumentRow[]) => [
    list.map((row) => row.line).join(" | "),
    list.map((row) => brl(row.ipi)).join(" | "),
  ];
  for (const pair of result.matched) {
    lines.push([
      "Coincidente",
      pair.identity,
      ...rows([pair.first]),
      ...rows([pair.second]),
      "0,00",
      "",
    ]);
  }
  for (const pair of result.divergent) {
    lines.push([
      "Divergente",
      pair.identity,
      ...rows([pair.first]),
      ...rows([pair.second]),
      signedBrl(pair.difference),
      pair.differences.join(" | "),
    ]);
  }
  for (const row of result.only_first)
    lines.push(["Só planilha 1", row.identity, ...rows([row]), "", "", "", ""]);
  for (const row of result.only_second)
    lines.push(["Só planilha 2", row.identity, "", "", ...rows([row]), "", ""]);
  for (const item of result.duplicates) {
    lines.push([
      "Duplicada",
      item.identity,
      ...rows(item.first),
      ...rows(item.second),
      "",
      "Identidade repetida; sem correspondência automática",
    ]);
  }
  const side = (issue: { source: SourceId; line: number }) =>
    issue.source === "first" ? [issue.line, "", "", ""] : ["", "", issue.line, ""];
  for (const issue of result.errors) lines.push(["Erro", "", ...side(issue), "", issue.message]);
  for (const issue of result.discarded)
    lines.push(["Descartada", "", ...side(issue), "", issue.reason]);
  return {
    file_name: "conferencia-ipi-planilhas.csv",
    csv: `﻿${lines.map((line) => csvLine(line, ";")).join("\r\n")}\r\n`,
  };
}
