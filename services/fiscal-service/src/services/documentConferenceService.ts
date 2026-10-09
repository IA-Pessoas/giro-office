import { csvLine, ServiceError } from "@workspace/shared";

/**
 * Conferência Domínio × SEFAZ (FIS-08): compara duas planilhas CSV de notas por documento, sem
 * gravar nada. A identidade da NF-e vem da chave de acesso quando há; sem ela, de emitente,
 * modelo, série e número. Número isolado não identifica a nota, e identidade repetida não ganha
 * correspondência escolhida pelo sistema: vira duplicata (ambígua) e o resultado fica parcial.
 */

export type ConferenceSourceId = "dominio" | "sefaz";

export interface ConferenceSourceInput {
  file_name: string;
  content: string;
}

export interface ConferenceDocumentRow {
  line: number;
  identity: string;
  access_key: string | null;
  issuer: string;
  model: string;
  series: string;
  number: string;
  value: string | null;
}

export interface ConferenceLineIssue {
  source: ConferenceSourceId;
  line: number;
}

export interface ConferencePair {
  identity: string;
  dominio: ConferenceDocumentRow;
  sefaz: ConferenceDocumentRow;
}

export interface DocumentConferenceResult {
  status: "complete" | "partial";
  identity_rule: string;
  sources: Record<
    ConferenceSourceId,
    {
      file_name: string;
      data_rows: number;
      accepted_rows: number;
      identity_columns: string[];
      value_column: boolean;
    }
  >;
  summary: {
    matched: number;
    divergent: number;
    only_dominio: number;
    only_sefaz: number;
    duplicates: number;
    discarded: number;
    errors: number;
  };
  totals: Record<ConferenceSourceId, string | null>;
  matched: ConferencePair[];
  divergent: (ConferencePair & { differences: string[] })[];
  only_dominio: ConferenceDocumentRow[];
  only_sefaz: ConferenceDocumentRow[];
  duplicates: {
    identity: string;
    dominio: ConferenceDocumentRow[];
    sefaz: ConferenceDocumentRow[];
  }[];
  discarded: (ConferenceLineIssue & { reason: string })[];
  errors: (ConferenceLineIssue & { message: string })[];
}

const SOURCE_LABEL: Record<ConferenceSourceId, string> = { dominio: "Domínio", sefaz: "SEFAZ" };

const IDENTITY_RULE =
  "Chave de acesso da NF-e quando informada; sem ela, emitente (CPF/CNPJ) + modelo + série + número.";

type Column = "access_key" | "issuer" | "model" | "series" | "number" | "value";

// Cabeçalhos comparados sem acento, caixa ou pontuação. ponytail: aliases deduzidos dos nomes
// usuais das exportações; sem amostras reais anonimizadas a compatibilidade não está validada.
// "CNPJ" ou "Nota" sozinhos ficam de fora: podem ser do destinatário ou de outro campo.
const COLUMN_ALIASES: Record<Column, string[]> = {
  access_key: ["chave", "chaveacesso", "chavedeacesso", "chavenfe", "chavedanfe", "chavenota"],
  issuer: ["emitente", "cnpjemitente", "cpfcnpjemitente", "cnpjcpfemitente", "documentoemitente"],
  model: ["modelo", "mod", "modelodocumento"],
  series: ["serie"],
  number: ["numero", "numeronota", "numerodocumento", "numeronf", "nnf"],
  value: [
    "valor",
    "valortotal",
    "valornota",
    "valordocumento",
    "valorcontabil",
    "vnf",
    "totalnota",
  ],
};

const IDENTITY_COLUMNS: Column[] = ["access_key", "issuer", "model", "series", "number"];

const DISCARD_REASON =
  "Sem chave de acesso e sem emitente, modelo, série e número; o número isolado não identifica a nota.";

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * CSV com aspas (RFC 4180); separador detectado no cabeçalho entre `;`, `,` e tab. Aspas abertas
 * até o fim do arquivo engoliriam as linhas seguintes, então recusam o arquivo inteiro.
 */
export function parseConferenceCsv(
  content: string,
  label = "CSV",
): { line: number; cells: string[] }[] {
  const text = content.replace(/^﻿/u, "");
  const firstLine = text.split(/\r?\n/u).find((line) => line.trim() !== "") ?? "";
  const unquoted = firstLine.replace(/"[^"]*"/g, "");
  const delimiter = [";", "\t", ","].reduce((best, candidate) =>
    unquoted.split(candidate).length > unquoted.split(best).length ? candidate : best,
  );

  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim() !== "")) rows.push({ line: rowLine, cells });
    cells = [];
    cell = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      cell += char;
    }
  }
  if (quoted) {
    throw new ServiceError(
      400,
      `Arquivo ${label}: aspas abertas na linha ${rowLine} não foram fechadas.`,
    );
  }
  endRow();
  return rows;
}

/** Chave NF-e: 44 dígitos com dígito verificador módulo 11. */
export function isValidAccessKey(key: string): boolean {
  if (!/^\d{44}$/u.test(key)) return false;
  let weight = 2;
  let sum = 0;
  for (let i = 42; i >= 0; i -= 1) {
    sum += Number(key[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return Number(key[43]) === (rest < 2 ? 0 : 11 - rest);
}

/**
 * Valor monetário em centavos: aceita `1.234,56`, `1234,56`, `1234.56`, `R$` e negativo com
 * sinal ou entre parênteses.
 */
function parseCents(raw: string): number | null {
  let value = raw.replace(/R\$/gu, "").replace(/\s/g, "");
  const parenthesized = /^\(.*\)$/u.test(value);
  if (parenthesized) value = value.slice(1, -1);
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u.exec(value);
  if (!match || (parenthesized && match[1])) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] || parenthesized ? -cents : cents;
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const digits = (value: string) => value.replace(/\D/g, "");
const stripZeros = (value: string) => value.replace(/^0+(?=\d)/u, "");

interface ParsedSource {
  rows: (ConferenceDocumentRow & { cents: number | null })[];
  discarded: DocumentConferenceResult["discarded"];
  errors: DocumentConferenceResult["errors"];
  info: DocumentConferenceResult["sources"][ConferenceSourceId];
  hasValue: boolean;
}

function parseSource(source: ConferenceSourceId, input: ConferenceSourceInput): ParsedSource {
  const label = SOURCE_LABEL[source];
  const [header, ...data] = parseConferenceCsv(input.content, label);
  const columns = new Map<Column, number>();
  header?.cells.forEach((name, index) => {
    const normalized = normalizeHeader(name);
    for (const [column, aliases] of Object.entries(COLUMN_ALIASES) as [Column, string[]][]) {
      if (!columns.has(column) && aliases.includes(normalized)) columns.set(column, index);
    }
  });
  const hasComposite = (["issuer", "model", "series", "number"] as Column[]).every((column) =>
    columns.has(column),
  );
  if (!columns.has("access_key") && !hasComposite) {
    throw new ServiceError(
      400,
      `Arquivo ${label}: o cabeçalho precisa ter a chave de acesso ou as colunas emitente, modelo, série e número.`,
    );
  }
  if (data.length === 0) {
    throw new ServiceError(400, `Arquivo ${label}: nenhuma linha de nota abaixo do cabeçalho.`);
  }

  const width = header?.cells.length ?? 0;
  const parsed: ParsedSource = {
    rows: [],
    discarded: [],
    errors: [],
    hasValue: columns.has("value"),
    info: {
      file_name: input.file_name,
      data_rows: data.length,
      accepted_rows: 0,
      // Cabeçalhos originais, para a equipe ver qual coluna virou identidade.
      identity_columns: IDENTITY_COLUMNS.flatMap((column) => {
        const index = columns.get(column);
        return index === undefined ? [] : [header?.cells[index]?.trim() ?? ""];
      }),
      value_column: columns.has("value"),
    },
  };

  for (const { line, cells } of data) {
    const fail = (message: string) => parsed.errors.push({ source, line, message });
    if (cells.length < width || cells.slice(width).some((cell) => cell.trim() !== "")) {
      fail(`Linha com ${cells.length} coluna(s); o cabeçalho tem ${width}.`);
      continue;
    }
    const cell = (column: Column) => {
      const index = columns.get(column);
      return index === undefined ? "" : (cells[index] ?? "").trim();
    };

    const rawKey = cell("access_key").replace(/\s/g, "");
    let row: Omit<ConferenceDocumentRow, "line" | "identity" | "value">;
    if (rawKey) {
      if (!isValidAccessKey(rawKey)) {
        fail("Chave de acesso inválida.");
        continue;
      }
      // Na chave o emitente tem sempre 14 posições: CPF vem com zeros à esquerda.
      row = {
        access_key: rawKey,
        issuer: rawKey.slice(6, 20),
        model: rawKey.slice(20, 22),
        series: stripZeros(rawKey.slice(22, 25)),
        number: stripZeros(rawKey.slice(25, 34)),
      };
    } else {
      const [issuer, model, series, number] = (
        ["issuer", "model", "series", "number"] as Column[]
      ).map(cell);
      if (!issuer || !model || !series || !number) {
        parsed.discarded.push({ source, line, reason: DISCARD_REASON });
        continue;
      }
      const issuerDigits = digits(issuer);
      if (issuerDigits.length !== 11 && issuerDigits.length !== 14) {
        fail(`Emitente inválido: ${issuer}.`);
        continue;
      }
      if (![model, series, number].every((value) => /^\d+$/u.test(value))) {
        fail("Modelo, série e número precisam ser numéricos.");
        continue;
      }
      row = {
        access_key: null,
        issuer: issuerDigits.padStart(14, "0"),
        model: stripZeros(model).padStart(2, "0"),
        series: stripZeros(series),
        number: stripZeros(number),
      };
    }

    const rawValue = cell("value");
    const cents = rawValue ? parseCents(rawValue) : null;
    if (rawValue && cents === null) {
      fail(`Valor inválido: ${rawValue}.`);
      continue;
    }
    parsed.rows.push({
      line,
      identity: `${row.issuer}|${row.model}|${row.series}|${row.number}`,
      ...row,
      value: cents === null ? null : formatCents(cents),
      cents,
    });
  }
  parsed.info.accepted_rows = parsed.rows.length;
  return parsed;
}

const publicRow = ({ cents: _cents, ...row }: ParsedSource["rows"][number]) => row;

export function compareDocumentSpreadsheets(input: {
  dominio: ConferenceSourceInput;
  sefaz: ConferenceSourceInput;
}): DocumentConferenceResult {
  const dominio = parseSource("dominio", input.dominio);
  const sefaz = parseSource("sefaz", input.sefaz);

  const group = (rows: ParsedSource["rows"]) => {
    const map = new Map<string, ParsedSource["rows"]>();
    for (const row of rows) map.set(row.identity, [...(map.get(row.identity) ?? []), row]);
    return map;
  };
  const dominioById = group(dominio.rows);
  const sefazById = group(sefaz.rows);
  const total = (parsed: ParsedSource) =>
    parsed.hasValue
      ? formatCents(parsed.rows.reduce((sum, row) => sum + (row.cents ?? 0), 0))
      : null;

  const buckets: Pick<
    DocumentConferenceResult,
    "matched" | "divergent" | "only_dominio" | "only_sefaz" | "duplicates" | "discarded" | "errors"
  > = {
    matched: [],
    divergent: [],
    only_dominio: [],
    only_sefaz: [],
    duplicates: [],
    discarded: [...dominio.discarded, ...sefaz.discarded],
    errors: [...dominio.errors, ...sefaz.errors],
  };

  const identities = [...new Set([...dominioById.keys(), ...sefazById.keys()])];
  for (const identity of identities) {
    const fromDominio = dominioById.get(identity) ?? [];
    const fromSefaz = sefazById.get(identity) ?? [];
    const [d, s] = [fromDominio[0], fromSefaz[0]];
    if (fromDominio.length > 1 || fromSefaz.length > 1) {
      buckets.duplicates.push({
        identity,
        dominio: fromDominio.map(publicRow),
        sefaz: fromSefaz.map(publicRow),
      });
    } else if (d && s) {
      const differences: string[] = [];
      if (d.access_key && s.access_key && d.access_key !== s.access_key) {
        differences.push("Chave de acesso diferente");
      }
      if (dominio.hasValue && sefaz.hasValue && d.value !== s.value) {
        differences.push(`Valor: Domínio ${d.value ?? "ausente"} × SEFAZ ${s.value ?? "ausente"}`);
      }
      const pair = { identity, dominio: publicRow(d), sefaz: publicRow(s) };
      if (differences.length > 0) buckets.divergent.push({ ...pair, differences });
      else buckets.matched.push(pair);
    } else if (d) {
      buckets.only_dominio.push(publicRow(d));
    } else if (s) {
      buckets.only_sefaz.push(publicRow(s));
    }
  }

  const summary = Object.fromEntries(
    Object.entries(buckets).map(([name, items]) => [name, items.length]),
  ) as DocumentConferenceResult["summary"];
  // Duplicata não foi pareada: tanto quanto descarte e erro, deixa a conferência incompleta.
  const incomplete = summary.discarded + summary.errors + summary.duplicates > 0;
  return {
    status: incomplete ? "partial" : "complete",
    identity_rule: IDENTITY_RULE,
    sources: { dominio: dominio.info, sefaz: sefaz.info },
    summary,
    totals: { dominio: total(dominio), sefaz: total(sefaz) },
    ...buckets,
  };
}

const DELIMITER = ";";
const brl = (value: string | null | undefined) => (value ? value.replace(".", ",") : "");

/** CSV do resultado: uma linha por item conferido, descarte ou erro, com a situação. */
export function documentConferenceCsvExport(result: DocumentConferenceResult) {
  type Line = (string | number)[];
  const pairLine = (situation: string, item: ConferencePair, note = ""): Line => [
    situation,
    item.identity,
    item.dominio.line,
    brl(item.dominio.value),
    item.sefaz.line,
    brl(item.sefaz.value),
    note,
  ];
  const sideLine = (
    situation: string,
    source: ConferenceSourceId,
    line: number,
    identity = "",
    value: string | null = null,
    note = "",
  ): Line =>
    source === "dominio"
      ? [situation, identity, line, brl(value), "", "", note]
      : [situation, identity, "", "", line, brl(value), note];

  const lines: Line[] = [
    [
      "Situação",
      "Identidade",
      "Linha Domínio",
      "Valor Domínio",
      "Linha SEFAZ",
      "Valor SEFAZ",
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
    ]);
  }
  for (const item of result.matched) lines.push(pairLine("Coincidente", item));
  for (const item of result.divergent) {
    lines.push(pairLine("Divergente", item, item.differences.join(" | ")));
  }
  for (const row of result.only_dominio) {
    lines.push(sideLine("Só Domínio", "dominio", row.line, row.identity, row.value));
  }
  for (const row of result.only_sefaz) {
    lines.push(sideLine("Só SEFAZ", "sefaz", row.line, row.identity, row.value));
  }
  for (const item of result.duplicates) {
    for (const source of ["dominio", "sefaz"] as const) {
      for (const row of item[source]) {
        lines.push(
          sideLine(
            "Duplicada",
            source,
            row.line,
            item.identity,
            row.value,
            "Identidade repetida; sem correspondência automática",
          ),
        );
      }
    }
  }
  for (const issue of result.errors) {
    lines.push(sideLine("Erro", issue.source, issue.line, "", null, issue.message));
  }
  for (const issue of result.discarded) {
    lines.push(sideLine("Descartada", issue.source, issue.line, "", null, issue.reason));
  }

  return {
    file_name: "conferencia-dominio-sefaz.csv",
    csv: `﻿${lines.map((line) => csvLine(line, DELIMITER)).join("\r\n")}\r\n`,
  };
}
