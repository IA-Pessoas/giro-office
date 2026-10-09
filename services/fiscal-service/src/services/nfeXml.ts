import { identityFromAccessKey, isValidAccessKey, stripZeros } from "./accessKey.js";
import { readZipArchive } from "./safeZipReader.js";

/**
 * Leitura mínima de XML de NF-e para as conferências: confere se o XML é bem formado e extrai
 * chave, emitente, modelo, série e número. Sem parser XML nos Workers, a verificação é um
 * balanceamento de tags; DOCTYPE/ENTITY são recusados.
 */

export interface NfeIdentity {
  access_key: string | null;
  issuer: string;
  model: string;
  series: string;
  number: string;
  identity: string;
}

export interface NfeItem {
  number: string;
  code: string;
  description: string;
  cfop: string;
  quantity: string | null;
  value: string | null;
}

export type NfeParseResult =
  // content: corpo da infNFe, para comparar cópias da mesma nota (com ou sem protocolo).
  // value: vNF do ICMSTot; protocol_status: cStat do protocolo (100 = autorizada), se houver.
  | ({
      kind: "nfe";
      content: string;
      value: string | null;
      protocol_status: string | null;
      items: NfeItem[];
    } & NfeIdentity)
  | { kind: "invalid"; message: string }
  | { kind: "other"; message: string };

const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const BAD_ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/iu;

/**
 * Remove comentários, CDATA e instruções de processamento numa varredura linear (regex lazy fica
 * quadrática quando o delimitador nunca fecha). Delimitador aberto até o fim: XML inválido.
 */
function stripMarkup(xml: string): string | null {
  const text = xml.replace(/^\uFEFF/u, "");
  const sections: [string, string][] = [
    ["<!--", "-->"],
    ["<![CDATA[", "]]>"],
    ["<?", "?>"],
  ];
  let out = "";
  let cursor = 0;
  while (cursor < text.length) {
    const next = text.indexOf("<", cursor);
    if (next === -1) {
      out += text.slice(cursor);
      break;
    }
    out += text.slice(cursor, next);
    const section = sections.find(([open]) => text.startsWith(open, next));
    if (!section) {
      out += "<";
      cursor = next + 1;
      continue;
    }
    const close = text.indexOf(section[1], next + section[0].length);
    if (close === -1) return null;
    cursor = close + section[1].length;
  }
  return out.trim();
}

function isWellFormed(text: string): boolean {
  if (!text.startsWith("<") || /<!/u.test(text)) return false;
  const stack: string[] = [];
  let roots = 0;
  let last = 0;
  for (const match of text.matchAll(TAG)) {
    const between = text.slice(last, match.index);
    if (between.includes("<") || BAD_ENTITY.test(between)) return false;
    last = (match.index ?? 0) + match[0].length;
    const [, closing, name = "", , selfClosing] = match;
    if (closing) {
      if (selfClosing || stack.pop() !== name) return false;
    } else {
      if (stack.length === 0) roots += 1;
      if (!selfClosing) stack.push(name);
    }
  }
  return stack.length === 0 && roots === 1 && !text.slice(last).includes("<");
}

function block(text: string, tag: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "u").exec(
    text,
  )?.[1];
}

function tagText(source: string, tag: string): string {
  return (
    new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`, "u").exec(source)?.[1]?.trim() ?? ""
  );
}

/** Decimal do XML (ponto) ou do SPED (vírgula) sem zeros à direita: "10.0000" e "10,0" → "10". */
export function normalizeDecimal(raw: string): string | null {
  const value = raw.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/u.test(value)) return null;
  const [integer = "0", fraction = ""] = value.split(".");
  const sign = integer.startsWith("-") ? "-" : "";
  const digits = integer.replace("-", "").replace(/^0+(?=\d)/u, "");
  const trimmed = fraction.replace(/0+$/u, "");
  return `${sign}${digits}${trimmed ? `.${trimmed}` : ""}`;
}

/** Valor monetário do XML (até 2 decimais, ponto) no formato "1234.50". */
function money(raw: string): string | null {
  const match = /^(-?\d+)(?:\.(\d{1,2}))?$/u.exec(raw.trim());
  return match ? `${stripZeros(match[1] ?? "0")}.${(match[2] ?? "").padEnd(2, "0")}` : null;
}

function items(infNFe: string): NfeItem[] {
  const pattern =
    /<(?:\w+:)?det\b[^>]*\bnItem\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/(?:\w+:)?det>/gu;
  return [...infNFe.matchAll(pattern)].map(([, number = "", body = ""]) => {
    const prod = block(body, "prod") ?? "";
    return {
      number: stripZeros(number),
      code: tagText(prod, "cProd"),
      description: tagText(prod, "xProd"),
      cfop: tagText(prod, "CFOP"),
      quantity: normalizeDecimal(tagText(prod, "qCom")),
      value: money(tagText(prod, "vProd")),
    };
  });
}

function field(text: string | undefined, tag: string): string | undefined {
  if (text === undefined) return undefined;
  return new RegExp(`<(?:\\w+:)?${tag}>\\s*(\\d+)\\s*</(?:\\w+:)?${tag}>`, "u").exec(text)?.[1];
}

export function nfeIdentity(parts: Omit<NfeIdentity, "identity">): NfeIdentity {
  return { ...parts, identity: `${parts.issuer}|${parts.model}|${parts.series}|${parts.number}` };
}

export function parseNfeXml(xml: string): NfeParseResult {
  const text = stripMarkup(xml);
  if (text === null || !isWellFormed(text)) return { kind: "invalid", message: "XML inválido." };

  const infNFe = /<(?:\w+:)?infNFe\b([^>]*)>/u.exec(text);
  if (!infNFe) return { kind: "other", message: "XML não é uma NF-e (sem infNFe)." };

  const ide = block(text, "ide");
  const emit = block(text, "emit");
  const [model, series, number] = [field(ide, "mod"), field(ide, "serie"), field(ide, "nNF")];
  const issuer = field(emit, "CNPJ") ?? field(emit, "CPF");
  if (!model || !series || !number || !issuer) {
    return { kind: "invalid", message: "NF-e sem emitente, modelo, série ou número." };
  }
  const note = nfeIdentity({
    access_key: /\bId\s*=\s*["']NFe(\d{44})["']/u.exec(infNFe[1] ?? "")?.[1] ?? null,
    issuer: issuer.padStart(14, "0"),
    model: stripZeros(model).padStart(2, "0"),
    series: stripZeros(series),
    number: stripZeros(number),
  });
  if (note.access_key) {
    if (!isValidAccessKey(note.access_key)) {
      return { kind: "invalid", message: "Chave de acesso inválida no XML." };
    }
    if (identityFromAccessKey(note.access_key) !== note.identity) {
      return {
        kind: "invalid",
        message: "Chave de acesso não confere com emitente, modelo, série e número do XML.",
      };
    }
  }
  const content = block(text, "infNFe") ?? "";
  return {
    kind: "nfe",
    content,
    items: items(content),
    value: money(tagText(block(text, "ICMSTot") ?? "", "vNF")),
    protocol_status: field(block(text, "infProt"), "cStat") ?? null,
    ...note,
  };
}

export type NfeFile = Extract<NfeParseResult, { kind: "nfe" }> & { entry: string; body: Buffer };

export interface NfeArchive {
  /** Arquivos do ZIP, inclusive os recusados (pastas não contam). */
  entries: number;
  notes: NfeFile[];
  discarded: { entry: string; reason: string }[];
  errors: { entry: string; message: string }[];
}

/** Lê um ZIP (base64) de XML: NF-e válidas, descartes (não XML ou não NF-e) e erros por arquivo. */
export function readNfeArchive(zipBase64: string): NfeArchive {
  const archive = readZipArchive(Buffer.from(zipBase64, "base64"));
  const result: NfeArchive = {
    entries: archive.entries.length + archive.errors.length,
    notes: [],
    discarded: [],
    errors: [...archive.errors],
  };
  for (const { name, body } of archive.entries) {
    if (!name.toLowerCase().endsWith(".xml")) {
      result.discarded.push({ entry: name, reason: "Não é arquivo .xml." });
      continue;
    }
    const parsed = parseNfeXml(body.toString("utf8"));
    if (parsed.kind === "nfe") result.notes.push({ ...parsed, entry: name, body });
    else if (parsed.kind === "other")
      result.discarded.push({ entry: name, reason: parsed.message });
    else result.errors.push({ entry: name, message: parsed.message });
  }
  return result;
}

/**
 * Cópia idêntica da mesma nota (mesma infNFe, com ou sem protocolo) não é duplicata: fica a
 * primeira e as demais voltam como descarte.
 */
export function dropIdenticalCopies(notes: NfeFile[]): {
  notes: NfeFile[];
  copies: { entry: string; reason: string }[];
} {
  const copies: { entry: string; reason: string }[] = [];
  const kept = notes.filter((note, index) => {
    const first = notes.find(
      (other) => other.identity === note.identity && other.content === note.content,
    );
    if (first && notes.indexOf(first) !== index) {
      copies.push({ entry: note.entry, reason: `Cópia idêntica de ${first.entry}.` });
      return false;
    }
    return true;
  });
  return { notes: kept, copies };
}
