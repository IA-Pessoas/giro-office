import { csvLine } from "@workspace/shared";

import {
  type ConferenceDocumentRow,
  type ConferenceSourceInput,
  formatCents,
  pairByIdentity,
  parseCents,
  parseNoteSpreadsheet,
  publicRow,
  type SpreadsheetInfo,
  totalOf,
} from "./documentConferenceService.js";
import { type NfeFile, readNfeArchive } from "./nfeXml.js";

/**
 * Conferência CSV SEFAZ × XML NF-e (FIS-10): confronta a planilha da SEFAZ com os XML de um ZIP,
 * sem gravar nada. Separa ausência real (só de um lado) de divergência, duplicata, situação não
 * comparável (cancelada, denegada…) e arquivo inválido, mostrando a chave usada em cada par.
 */

export interface XmlNoteRow {
  entry: string;
  identity: string;
  access_key: string | null;
  issuer: string;
  model: string;
  series: string;
  number: string;
  value: string | null;
  protocol_status: string | null;
}

type MatchKey = "chave de acesso" | "emitente, modelo, série e número";

interface Pair {
  identity: string;
  match_key: MatchKey;
  sefaz: ConferenceDocumentRow;
  xml: XmlNoteRow;
}

type Issue<T> = ({ source: "sefaz"; line: number } & T) | ({ source: "xml"; entry: string } & T);

export interface SefazXmlConferenceResult {
  status: "complete" | "partial";
  identity_rule: string;
  sources: {
    sefaz: SpreadsheetInfo;
    xml: { file_name: string; entries: number; nfe_entries: number };
  };
  summary: {
    matched: number;
    divergent: number;
    only_sefaz: number;
    only_xml: number;
    duplicates: number;
    not_comparable: number;
    discarded: number;
    errors: number;
  };
  totals: { sefaz: string | null; xml: string | null };
  matched: Pair[];
  divergent: (Pair & { differences: string[] })[];
  only_sefaz: ConferenceDocumentRow[];
  only_xml: XmlNoteRow[];
  duplicates: { identity: string; sefaz: ConferenceDocumentRow[]; xml: XmlNoteRow[] }[];
  not_comparable: {
    identity: string;
    reason: string;
    sefaz: ConferenceDocumentRow[];
    xml: XmlNoteRow[];
  }[];
  discarded: Issue<{ reason: string }>[];
  errors: Issue<{ message: string }>[];
}

const IDENTITY_RULE =
  "Chave de acesso da NF-e quando os dois lados têm; senão emitente (CPF/CNPJ) + modelo + série + número. Só notas autorizadas são comparadas.";

// cStat 100 (autorizada) e 150 (autorizada fora de prazo); sem protocolo, o XML é comparado.
const AUTHORIZED_PROTOCOL = new Set(["100", "150"]);

function xmlRow(note: NfeFile): XmlNoteRow {
  return {
    entry: note.entry,
    identity: note.identity,
    access_key: note.access_key,
    issuer: note.issuer,
    model: note.model,
    series: note.series,
    number: note.number,
    value: note.value,
    protocol_status: note.protocol_status,
  };
}

function sefazStatusProblem(row: ConferenceDocumentRow): string | null {
  if (!row.status) return null;
  const normalized = row.status
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return normalized.includes("autoriza") ? null : `SEFAZ: situação "${row.status}"`;
}

function xmlStatusProblem(row: XmlNoteRow): string | null {
  return row.protocol_status && !AUTHORIZED_PROTOCOL.has(row.protocol_status)
    ? `XML: protocolo com cStat ${row.protocol_status}`
    : null;
}

export function compareSefazWithXml(input: {
  sefaz: ConferenceSourceInput;
  xml: { file_name: string; zip_base64: string };
}): SefazXmlConferenceResult {
  const sefaz = parseNoteSpreadsheet("sefaz", "SEFAZ", input.sefaz);
  const archive = readNfeArchive(input.xml.zip_base64);
  const xmlRows = archive.notes.map(xmlRow);
  const xmlCents = archive.notes.map((note) => (note.value ? parseCents(note.value) : null));

  // Identidade com situação não comparável em qualquer lado sai inteira do pareamento: não é
  // ausência nem divergência.
  const problems = new Map<string, string[]>();
  const flag = (identity: string, problem: string | null) => {
    if (!problem) return;
    const list = problems.get(identity) ?? [];
    if (!list.includes(problem)) problems.set(identity, [...list, problem]);
  };
  for (const row of sefaz.rows) flag(row.identity, sefazStatusProblem(row));
  for (const row of xmlRows) flag(row.identity, xmlStatusProblem(row));

  const buckets: Pick<
    SefazXmlConferenceResult,
    | "matched"
    | "divergent"
    | "only_sefaz"
    | "only_xml"
    | "duplicates"
    | "not_comparable"
    | "discarded"
    | "errors"
  > = {
    matched: [],
    divergent: [],
    only_sefaz: [],
    only_xml: [],
    duplicates: [],
    not_comparable: [],
    discarded: [
      ...sefaz.discarded,
      ...archive.discarded.map((item) => ({ source: "xml" as const, ...item })),
    ],
    errors: [
      ...sefaz.errors,
      ...archive.errors.map((item) => ({ source: "xml" as const, ...item })),
    ],
  };

  for (const item of pairByIdentity(sefaz.rows, xmlRows)) {
    const sefazSide = item.kind === "duplicate" ? item.left : "left" in item ? [item.left] : [];
    const xmlSide = item.kind === "duplicate" ? item.right : "right" in item ? [item.right] : [];
    const problem = problems.get(item.identity);
    if (problem) {
      buckets.not_comparable.push({
        identity: item.identity,
        reason: problem.join("; "),
        sefaz: sefazSide.map(publicRow),
        xml: xmlSide,
      });
    } else if (item.kind === "duplicate") {
      buckets.duplicates.push({
        identity: item.identity,
        sefaz: sefazSide.map(publicRow),
        xml: xmlSide,
      });
    } else if (item.kind === "pair") {
      const { left: s, right: x } = item;
      const differences: string[] = [];
      if (s.access_key && x.access_key && s.access_key !== x.access_key) {
        differences.push("Chave de acesso diferente");
      }
      if (sefaz.hasValue && s.value !== x.value) {
        differences.push(`Valor: SEFAZ ${s.value ?? "ausente"} × XML ${x.value ?? "ausente"}`);
      }
      const pair: Pair = {
        identity: item.identity,
        match_key:
          s.access_key && x.access_key ? "chave de acesso" : "emitente, modelo, série e número",
        sefaz: publicRow(s),
        xml: x,
      };
      if (differences.length > 0) buckets.divergent.push({ ...pair, differences });
      else buckets.matched.push(pair);
    } else if (item.kind === "left") {
      buckets.only_sefaz.push(publicRow(item.left));
    } else {
      buckets.only_xml.push(item.right);
    }
  }

  const summary = Object.fromEntries(
    Object.entries(buckets).map(([name, items]) => [name, items.length]),
  ) as SefazXmlConferenceResult["summary"];
  // Descarte de XML (não é XML/NF-e) não esconde nota pedida; descarte de linha da planilha sim.
  const incomplete = sefaz.discarded.length + summary.errors + summary.duplicates > 0;
  return {
    status: incomplete ? "partial" : "complete",
    identity_rule: IDENTITY_RULE,
    sources: {
      sefaz: sefaz.info,
      xml: {
        file_name: input.xml.file_name,
        entries: archive.entries,
        nfe_entries: archive.notes.length,
      },
    },
    summary,
    totals: {
      sefaz: totalOf(sefaz),
      xml: xmlCents.some((cents) => cents !== null)
        ? formatCents(xmlCents.reduce<number>((sum, cents) => sum + (cents ?? 0), 0))
        : null,
    },
    ...buckets,
  };
}

const brl = (value: string | null | undefined) => (value ? value.replace(".", ",") : "");
const joined = (values: (string | number)[]) => values.join(" | ");

/** CSV do resultado: uma linha por identidade conferida, descarte ou erro, com a situação. */
export function sefazXmlConferenceCsvExport(result: SefazXmlConferenceResult) {
  type Line = (string | number)[];
  const sides = (sefaz: ConferenceDocumentRow[], xml: XmlNoteRow[]) => [
    joined(sefaz.map((row) => row.line)),
    joined(sefaz.map((row) => brl(row.value))),
    joined(xml.map((row) => row.entry)),
    joined(xml.map((row) => brl(row.value))),
  ];
  const lines: Line[] = [
    [
      "Situação",
      "Identidade",
      "Chave usada",
      "Linha SEFAZ",
      "Valor SEFAZ",
      "Arquivo XML",
      "Valor XML",
      "Observação",
    ],
  ];
  if (result.status === "partial") {
    lines.push([
      "Resultado",
      "Conferência parcial: há linhas descartadas, arquivos com erro ou duplicatas",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  for (const item of result.matched) {
    lines.push([
      "Coincidente",
      item.identity,
      item.match_key,
      ...sides([item.sefaz], [item.xml]),
      "",
    ]);
  }
  for (const item of result.divergent) {
    lines.push([
      "Divergente",
      item.identity,
      item.match_key,
      ...sides([item.sefaz], [item.xml]),
      item.differences.join(" | "),
    ]);
  }
  for (const row of result.only_sefaz) {
    lines.push(["Só SEFAZ", row.identity, "", ...sides([row], []), ""]);
  }
  for (const row of result.only_xml)
    lines.push(["Só XML", row.identity, "", ...sides([], [row]), ""]);
  for (const item of result.not_comparable) {
    lines.push(["Não comparável", item.identity, "", ...sides(item.sefaz, item.xml), item.reason]);
  }
  for (const item of result.duplicates) {
    lines.push([
      "Duplicada",
      item.identity,
      "",
      ...sides(item.sefaz, item.xml),
      "Identidade repetida; sem correspondência automática",
    ]);
  }
  const issueSides = (issue: Issue<unknown>) =>
    issue.source === "sefaz" ? [issue.line, "", "", ""] : ["", "", issue.entry, ""];
  for (const issue of result.errors) {
    lines.push(["Erro", "", "", ...issueSides(issue), issue.message]);
  }
  for (const issue of result.discarded) {
    lines.push(["Descartada", "", "", ...issueSides(issue), issue.reason]);
  }
  return {
    file_name: "conferencia-sefaz-xml.csv",
    csv: `﻿${lines.map((line) => csvLine(line, ";")).join("\r\n")}\r\n`,
  };
}
