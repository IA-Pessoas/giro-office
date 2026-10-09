import { csvLine, ServiceError } from "@workspace/shared";

/**
 * Conferência Domínio × SEFAZ (FIS-08): compara duas planilhas CSV de notas por documento, sem
 * gravar nada. A identidade da NF-e vem da chave de acesso quando há; sem ela, de emitente,
 * modelo, série e número. Número isolado não identifica a nota, e identidade repetida não ganha
 * correspondência escolhida pelo sistema: vira duplicata visível.
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
  matched: { identity: string; dominio: ConferenceDocumentRow; sefaz: ConferenceDocumentRow }[];
  divergent: {
    identity: string;
    dominio: ConferenceDocumentRow;
    sefaz: ConferenceDocumentRow;
    differences: string[];
  }[];
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
const COLUMN_ALIASES: Record<Column, string[]> = {
  access_key: ["chave", "chaveacesso", "chavedeacesso", "chavenfe", "chavedanfe", "chavenota"],
  issuer: [
    "emitente",
    "cnpjemitente",
    "cpfcnpjemitente",
    "cnpjcpfemitente",
    "cnpj",
    "cpfcnpj",
    "documentoemitente",
  ],
  model: ["modelo", "mod", "modelodocumento"],
  series: ["serie"],
  number: ["numero", "numeronota", "numerodocumento", "numeronf", "nnf", "nota"],
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

const IDENTITY_COLUMN_LABEL: [Column, string][] = [
  ["access_key", "chave de acesso"],
  ["issuer", "emitente"],
  ["model", "modelo"],
  ["series", "série"],
  ["number", "número"],
];

const DISCARD_REASON =
  "Sem chave de acesso e sem emitente, modelo, série e número; o número isolado não identifica a nota.";

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** CSV com aspas (RFC 4180); separador detectado no cabeçalho entre `;`, `,` e tab. */
export function parseConferenceCsv(content: string): { line: number; cells: string[] }[] {
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
  endRow();
  return rows;
}

/** Chave NF-e: 44 dígitos com dígito verificador módulo 11. */
function isValidAccessKey(key: string): boolean {
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

/** Valor monetário em centavos: aceita `1.234,56`, `1234,56` e `1234.56`. */
function parseCents(raw: string): number | null {
  let value = raw.replace(/^R\$/u, "").replace(/\s/g, "");
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u.exec(value);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -cents : cents;
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
  const [header, ...data] = parseConferenceCsv(input.content);
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
      identity_columns: IDENTITY_COLUMN_LABEL.filter(([column]) => columns.has(column)).map(
        ([, name]) => name,
      ),
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
        issuer: issuerDigits,
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
  const left = group(dominio.rows);
  const right = group(sefaz.rows);

  const result: DocumentConferenceResult = {
    status: "complete",
    identity_rule: IDENTITY_RULE,
    sources: { dominio: dominio.info, sefaz: sefaz.info },
    summary: {
      matched: 0,
      divergent: 0,
      only_dominio: 0,
      only_sefaz: 0,
      duplicates: 0,
      discarded: 0,
      errors: 0,
    },
    totals: {
      dominio: dominio.hasValue
        ? formatCents(dominio.rows.reduce((sum, row) => sum + (row.cents ?? 0), 0))
        : null,
      sefaz: sefaz.hasValue
        ? formatCents(sefaz.rows.reduce((sum, row) => sum + (row.cents ?? 0), 0))
        : null,
    },
    matched: [],
    divergent: [],
    only_dominio: [],
    only_sefaz: [],
    duplicates: [],
    discarded: [...dominio.discarded, ...sefaz.discarded],
    errors: [...dominio.errors, ...sefaz.errors],
  };

  const identities = [...new Set([...left.keys(), ...right.keys()])];
  for (const identity of identities) {
    const a = left.get(identity) ?? [];
    const b = right.get(identity) ?? [];
    if (a.length > 1 || b.length > 1) {
      result.duplicates.push({ identity, dominio: a.map(publicRow), sefaz: b.map(publicRow) });
    } else if (a[0] && b[0]) {
      const differences: string[] = [];
      if (a[0].access_key && b[0].access_key && a[0].access_key !== b[0].access_key) {
        differences.push("Chave de acesso diferente");
      }
      if (dominio.hasValue && sefaz.hasValue && a[0].value !== b[0].value) {
        differences.push(
          `Valor: Domínio ${a[0].value ?? "ausente"} × SEFAZ ${b[0].value ?? "ausente"}`,
        );
      }
      const pair = { identity, dominio: publicRow(a[0]), sefaz: publicRow(b[0]) };
      if (differences.length > 0) result.divergent.push({ ...pair, differences });
      else result.matched.push(pair);
    } else if (a[0]) {
      result.only_dominio.push(publicRow(a[0]));
    } else if (b[0]) {
      result.only_sefaz.push(publicRow(b[0]));
    }
  }

  result.summary = {
    matched: result.matched.length,
    divergent: result.divergent.length,
    only_dominio: result.only_dominio.length,
    only_sefaz: result.only_sefaz.length,
    duplicates: result.duplicates.length,
    discarded: result.discarded.length,
    errors: result.errors.length,
  };
  if (result.discarded.length > 0 || result.errors.length > 0) result.status = "partial";
  return result;
}

const DELIMITER = ";";
const brl = (value: string | null | undefined) => (value ? value.replace(".", ",") : "");

/** CSV do resultado: uma linha por item conferido, descarte ou erro, com a situação. */
export function documentConferenceCsvExport(result: DocumentConferenceResult) {
  type Line = (string | number)[];
  const pairLine = (
    situation: string,
    item: { identity: string; dominio: ConferenceDocumentRow; sefaz: ConferenceDocumentRow },
    note = "",
  ): Line => [
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
      "Conferência parcial: há linhas descartadas ou com erro",
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
