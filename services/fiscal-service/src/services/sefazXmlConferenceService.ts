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
import { dropIdenticalCopies, type NfeFile, readNfeArchive } from "./nfeXml.js";

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
  /** Observações que não são divergência (ex.: XML sem protocolo de autorização). */
  notes: string[];
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

function xmlRow({ kind: _kind, body: _body, content: _content, ...row }: NfeFile): XmlNoteRow {
  return row;
}

function sefazStatusProblem(row: ConferenceDocumentRow): string | null {
  if (!row.status) return null;
  const normalized = row.status
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  // "Autorizada", "Uso autorizado"; negação, denegação, cancelamento e afins ficam de fora.
  const authorized =
    /autorizad/u.test(normalized) && !/\bnao\b|denega|cancel|inutiliz|rejeit/u.test(normalized);
  return authorized ? null : `SEFAZ: situação "${row.status}"`;
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
  const { notes, copies } = dropIdenticalCopies(archive.notes);
  const xmlRows = notes.map(xmlRow);
  const xmlCents = notes.map((note) => (note.value ? parseCents(note.value) : null));

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
      ...[...archive.discarded, ...copies].map((item) => ({ source: "xml" as const, ...item })),
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
    // Duplicata vem antes: sem saber qual linha vale, nem a situação pode ser atribuída.
    if (item.kind === "duplicate") {
      buckets.duplicates.push({
        identity: item.identity,
        sefaz: sefazSide.map(publicRow),
        xml: xmlSide,
      });
    } else if (problem) {
      buckets.not_comparable.push({
        identity: item.identity,
        reason: problem.join("; "),
        sefaz: sefazSide.map(publicRow),
        xml: xmlSide,
      });
    } else if (item.kind === "pair") {
      const { left: s, right: x } = item;
      const differences: string[] = [];
      const sameKey = Boolean(s.access_key && s.access_key === x.access_key);
      if (s.access_key && x.access_key && !sameKey) differences.push("Chave de acesso diferente");
      // Valor só é comparado quando os dois lados têm; ausência não é diferença de valor.
      if (s.value !== null && x.value !== null && s.value !== x.value) {
        differences.push(`Valor: SEFAZ ${s.value} × XML ${x.value}`);
      }
      const pair: Pair = {
        identity: item.identity,
        match_key: sameKey ? "chave de acesso" : "emitente, modelo, série e número",
        sefaz: publicRow(s),
        xml: x,
        notes: [
          ...(x.protocol_status === null ? ["XML sem protocolo de autorização"] : []),
          ...(s.value === null || x.value === null ? ["Valor ausente em um dos lados"] : []),
        ],
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
  // Descarte de XML (não é XML/NF-e) não esconde nota; descarte de linha da planilha sim. ZIP sem
  // nenhuma NF-e também não pode parecer conferência completa.
  const incomplete =
    sefaz.discarded.length + summary.errors + summary.duplicates > 0 || notes.length === 0;
  return {
    status: incomplete ? "partial" : "complete",
    identity_rule: IDENTITY_RULE,
    sources: {
      sefaz: sefaz.info,
      xml: {
        file_name: input.xml.file_name,
        entries: archive.entries,
        nfe_entries: notes.length,
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
      item.notes.join(" | "),
    ]);
  }
  for (const item of result.divergent) {
    lines.push([
      "Divergente",
      item.identity,
      item.match_key,
      ...sides([item.sefaz], [item.xml]),
      [...item.differences, ...item.notes].join(" | "),
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
