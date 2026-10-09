import { isValidAccessKey } from "./documentConferenceService.js";

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

export type NfeParseResult =
  | ({ kind: "nfe" } & NfeIdentity)
  | { kind: "invalid"; message: string }
  | { kind: "other"; message: string };

const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const BAD_ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/iu;

function stripMarkup(xml: string): string {
  return xml
    .replace(/^﻿/u, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .trim();
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

const stripZeros = (value: string) => value.replace(/^0+(?=\d)/u, "");

function block(text: string, tag: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "u").exec(
    text,
  )?.[1];
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
  if (!isWellFormed(text)) return { kind: "invalid", message: "XML inválido." };

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
  return { kind: "nfe", ...note };
}

/** Identidade composta embutida na chave: CNPJ/CPF (14), modelo, série e número. */
export function identityFromAccessKey(key: string): string {
  return [
    key.slice(6, 20),
    key.slice(20, 22),
    stripZeros(key.slice(22, 25)),
    stripZeros(key.slice(25, 34)),
  ].join("|");
}
