import { inflateSync } from "node:zlib";

/**
 * Extração de texto de PDF para as conferências, sem dependência: lê objetos (inclusive em
 * object streams), descomprime FlateDecode e interpreta os operadores de texto (Tj, TJ, ', ")
 * das páginas na ordem da árvore de páginas.
 *
 * Formato suportado: PDF com camada de texto, sem criptografia, conteúdo sem filtro ou
 * FlateDecode, fontes simples (WinAnsi/padrão) ou Type0 com mapa ToUnicode. PDF escaneado
 * (imagem), criptografado ou com fonte sem mapa de caracteres não tem texto legível e é
 * recusado. ponytail: parser mínimo; para leiautes fora disso, usar unpdf/pdf.js no Worker.
 */

export type PdfTextResult =
  | { kind: "text"; pages: string[] }
  | { kind: "unsupported"; message: string };

const MAX_STREAM_BYTES = 5 * 1024 * 1024;

interface PdfFont {
  bytesPerCode: number;
  map: Map<string, string> | null;
}

class PdfDocument {
  private readonly objects = new Map<number, string>();

  constructor(raw: string) {
    for (const match of raw.matchAll(/(\d+)\s+\d+\s+obj\b/g)) {
      const start = (match.index ?? 0) + match[0].length;
      const end = raw.indexOf("endobj", start);
      if (end === -1) continue;
      // Atualização incremental: a definição mais recente prevalece.
      this.objects.set(Number(match[1]), raw.slice(start, end));
    }
    for (const body of [...this.objects.values()]) {
      if (/\/Type\s*\/ObjStm\b/u.test(body)) this.loadObjectStream(body);
    }
  }

  private loadObjectStream(body: string): void {
    const data = this.streamData(body);
    const first = Number(/\/First\s+(\d+)/u.exec(body)?.[1]);
    const count = Number(/\/N\s+(\d+)/u.exec(body)?.[1]);
    if (data === null || !Number.isFinite(first) || !Number.isFinite(count)) return;
    const header = data.slice(0, first).trim().split(/\s+/u).map(Number);
    for (let i = 0; i < count; i += 1) {
      const number = header[i * 2];
      const offset = header[i * 2 + 1];
      const next = header[i * 2 + 3];
      if (number === undefined || offset === undefined || this.objects.has(number)) continue;
      this.objects.set(
        number,
        data.slice(first + offset, next === undefined ? undefined : first + next),
      );
    }
  }

  get(number: number): string | undefined {
    return this.objects.get(number);
  }

  all(): IterableIterator<[number, string]> {
    return this.objects.entries();
  }

  /** Valor de uma chave do dicionário: subdicionário << >>, objeto referenciado ou token. */
  value(dict: string, key: string): string | undefined {
    const match = new RegExp(`/${key}(?![A-Za-z0-9])\\s*`, "u").exec(dict);
    if (!match) return undefined;
    const rest = dict.slice((match.index ?? 0) + match[0].length);
    if (rest.startsWith("<<")) return balancedDict(rest);
    const ref = /^(\d+)\s+\d+\s+R\b/u.exec(rest);
    if (ref) return this.get(Number(ref[1]));
    return /^[^\s/<>[\]()]+|^\[[^\]]*\]/u.exec(rest)?.[0];
  }

  refs(dict: string, key: string): number[] {
    const match = new RegExp(
      `/${key}(?![A-Za-z0-9])\\s*(\\[[^\\]]*\\]|\\d+\\s+\\d+\\s+R)`,
      "u",
    ).exec(dict);
    if (!match) return [];
    return [...(match[1] ?? "").matchAll(/(\d+)\s+\d+\s+R/g)].map((ref) => Number(ref[1]));
  }

  /** Dados do stream do objeto, já descomprimidos; null quando o filtro não é suportado. */
  streamData(body: string): string | null {
    const marker = /stream\r?\n/u.exec(body);
    if (!marker) return null;
    const dict = body.slice(0, marker.index);
    const start = (marker.index ?? 0) + marker[0].length;
    const lengthRef = /\/Length\s+(\d+)\s+\d+\s+R/u.exec(dict);
    const length = lengthRef
      ? Number(this.get(Number(lengthRef[1]))?.trim())
      : Number(/\/Length\s+(\d+)/u.exec(dict)?.[1]);
    const end = body.lastIndexOf("endstream");
    const data = Number.isFinite(length)
      ? body.slice(start, start + length)
      : body.slice(start, end === -1 ? undefined : end).replace(/\r?\n$/u, "");
    const filters = [
      ...(/\/Filter\s*(\[[^\]]*\]|\/\w+)/u.exec(dict)?.[1] ?? "").matchAll(/\/(\w+)/g),
    ].map((filter) => filter[1]);
    if (filters.length === 0) return data;
    if (filters.length > 1 || filters[0] !== "FlateDecode") return null;
    try {
      return inflateSync(Buffer.from(data, "latin1"), {
        maxOutputLength: MAX_STREAM_BYTES,
      }).toString("latin1");
    } catch {
      return null;
    }
  }
}

function balancedDict(text: string): string {
  let depth = 0;
  for (let i = 0; i < text.length - 1; i += 1) {
    if (text.startsWith("<<", i)) {
      depth += 1;
      i += 1;
    } else if (text.startsWith(">>", i)) {
      depth -= 1;
      i += 1;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return text;
}

function utf16(hex: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4)
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
  return out;
}

/** Mapa ToUnicode (bfchar/bfrange) de código em hexadecimal para texto. */
function parseToUnicode(cmap: string): { map: Map<string, string>; bytesPerCode: number } {
  const map = new Map<string, string>();
  let bytesPerCode = 1;
  for (const [, body = ""] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, src = "", dst = ""] of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      map.set(src.toUpperCase(), utf16(dst));
      bytesPerCode = src.length / 2;
    }
  }
  for (const [, body = ""] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo = "", hi = "", rest = ""] of body.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g,
    )) {
      const from = Number.parseInt(lo, 16);
      const to = Math.min(Number.parseInt(hi, 16), from + 0xffff);
      const list = rest.startsWith("[")
        ? [...rest.matchAll(/<([0-9A-Fa-f]*)>/g)].map((item) => item[1] ?? "")
        : null;
      const base = list ? 0 : Number.parseInt(rest.slice(1, -1) || "0", 16);
      for (let code = from; code <= to; code += 1) {
        const key = code.toString(16).toUpperCase().padStart(lo.length, "0");
        const target = list
          ? list[code - from]
          : (base + code - from).toString(16).padStart(4, "0");
        if (target !== undefined) map.set(key, utf16(target));
      }
      bytesPerCode = lo.length / 2;
    }
  }
  return { map, bytesPerCode };
}

function loadFonts(doc: PdfDocument, resources: string | undefined): Map<string, PdfFont> {
  const fonts = new Map<string, PdfFont>();
  const fontDict = resources ? doc.value(resources, "Font") : undefined;
  if (!fontDict) return fonts;
  for (const [, name = "", ref = ""] of fontDict.matchAll(
    /\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g,
  )) {
    const font = doc.get(Number(ref)) ?? "";
    const type0 = /\/Subtype\s*\/Type0\b/u.test(font);
    const cmapRef = /\/ToUnicode\s+(\d+)\s+\d+\s+R/u.exec(font)?.[1];
    const cmapBody = cmapRef ? doc.get(Number(cmapRef)) : undefined;
    const cmapText = cmapBody ? doc.streamData(cmapBody) : null;
    const parsed = cmapText ? parseToUnicode(cmapText) : null;
    fonts.set(name, {
      bytesPerCode: type0 ? 2 : (parsed?.bytesPerCode ?? 1),
      map: parsed?.map ?? (type0 ? new Map() : null),
    });
  }
  return fonts;
}

function decodeString(bytes: string, font: PdfFont | undefined): string {
  if (!font?.map) return bytes; // fonte simples sem mapa: WinAnsi ≈ latin1
  let out = "";
  for (let i = 0; i < bytes.length; i += font.bytesPerCode) {
    const code = [...bytes.slice(i, i + font.bytesPerCode)]
      .map((char) => char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
      .join("");
    out += font.map.get(code) ?? (font.bytesPerCode === 1 ? bytes[i] : "");
  }
  return out;
}

type Token =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "other"; value: string };

/** Texto de um content stream, com quebra de linha quando a posição vertical muda. */
function contentText(stream: string, fonts: Map<string, PdfFont>): string {
  let out = "";
  let font: PdfFont | undefined;
  let lastY: number | null = null;
  let operands: Token[] = [];
  let arrayDepth = 0;
  const show = (bytes: string) => {
    out += decodeString(bytes, font);
  };
  const newline = () => {
    if (!out.endsWith("\n")) out += "\n";
  };

  let i = 0;
  while (i < stream.length) {
    const char = stream[i] ?? "";
    if (/\s/u.test(char)) {
      i += 1;
    } else if (char === "%") {
      const end = stream.indexOf("\n", i);
      i = end === -1 ? stream.length : end;
    } else if (char === "(") {
      let depth = 1;
      let value = "";
      i += 1;
      while (i < stream.length && depth > 0) {
        const c = stream[i] ?? "";
        if (c === "\\") {
          const next = stream[i + 1] ?? "";
          const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
          if (/[0-7]/u.test(next)) {
            const octal = /^[0-7]{1,3}/u.exec(stream.slice(i + 1))?.[0] ?? "0";
            value += String.fromCharCode(Number.parseInt(octal, 8));
            i += 1 + octal.length;
            continue;
          }
          if (next === "\r" || next === "\n") {
            i += next === "\r" && stream[i + 2] === "\n" ? 3 : 2;
            continue;
          }
          value += escapes[next] ?? next;
          i += 2;
          continue;
        }
        if (c === "(") depth += 1;
        if (c === ")") depth -= 1;
        if (depth > 0) value += c;
        i += 1;
      }
      operands.push({ type: "string", value });
    } else if (char === "<" && stream[i + 1] !== "<") {
      const end = stream.indexOf(">", i);
      const hex = stream.slice(i + 1, end === -1 ? undefined : end).replace(/\s/g, "");
      const padded = hex.length % 2 ? `${hex}0` : hex;
      let value = "";
      for (let j = 0; j < padded.length; j += 2)
        value += String.fromCharCode(Number.parseInt(padded.slice(j, j + 2), 16));
      operands.push({ type: "string", value });
      i = end === -1 ? stream.length : end + 1;
    } else if (char === "[") {
      arrayDepth += 1;
      i += 1;
    } else if (char === "]") {
      arrayDepth = Math.max(0, arrayDepth - 1);
      i += 1;
    } else if (char === "<" || char === ">") {
      i += 2;
    } else {
      const token =
        /^[^\s()<>[\]{}/%]+|^\/[^\s()<>[\]{}/%]*/u.exec(stream.slice(i, i + 256))?.[0] ?? char;
      i += token.length;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/u.test(token)) {
        operands.push({ type: "number", value: Number(token) });
        continue;
      }
      if (token.startsWith("/")) {
        operands.push({ type: "other", value: token.slice(1) });
        continue;
      }
      if (arrayDepth > 0) continue;
      const strings = operands.filter((operand) => operand.type === "string");
      const numbers = operands
        .filter((operand) => operand.type === "number")
        .map((operand) => operand.value as number);
      switch (token) {
        case "BI": {
          const end = stream.indexOf("EI", i);
          i = end === -1 ? stream.length : end + 2;
          break;
        }
        case "Tf": {
          const name = operands.find((operand) => operand.type === "other");
          font = name ? fonts.get(name.value as string) : undefined;
          break;
        }
        case "Td":
        case "TD":
          if (Math.abs(numbers[1] ?? 0) > 0.01) newline();
          else out += " ";
          break;
        case "Tm": {
          const y = numbers[5] ?? 0;
          if (lastY !== null && Math.abs(y - lastY) > 0.01) newline();
          else if (!out.endsWith("\n")) out += " ";
          lastY = y;
          break;
        }
        case "T*":
        case "ET":
          newline();
          break;
        case "Tj":
          for (const operand of strings) show(operand.value as string);
          break;
        case "'":
          newline();
          for (const operand of strings) show(operand.value as string);
          break;
        case '"':
          newline();
          if (strings[0]) show(strings[0].value as string);
          break;
        case "TJ":
          for (const operand of operands) {
            if (operand.type === "string") show(operand.value);
            else if (operand.type === "number" && operand.value < -150) out += " ";
          }
          break;
        default:
          break;
      }
      operands = [];
    }
  }
  return out;
}

function pageOrder(doc: PdfDocument): string[] {
  const catalog = [...doc.all()].find(([, body]) => /\/Type\s*\/Catalog\b/u.test(body))?.[1];
  const pages: string[] = [];
  const visit = (number: number, depth: number, seen: Set<number>) => {
    const node = doc.get(number);
    if (!node || depth > 32 || seen.has(number)) return;
    seen.add(number);
    if (/\/Type\s*\/Pages\b/u.test(node)) {
      for (const kid of doc.refs(node, "Kids")) visit(kid, depth + 1, seen);
    } else if (/\/Type\s*\/Page\b/u.test(node)) {
      pages.push(node);
    }
  };
  const root = catalog ? doc.refs(catalog, "Pages")[0] : undefined;
  if (root !== undefined) visit(root, 0, new Set());
  if (pages.length > 0) return pages;
  return [...doc.all()]
    .sort(([a], [b]) => a - b)
    .map(([, body]) => body)
    .filter((body) => /\/Type\s*\/Page\b/u.test(body));
}

function inheritedResources(doc: PdfDocument, page: string): string | undefined {
  let node: string | undefined = page;
  for (let depth = 0; node && depth < 32; depth += 1) {
    const resources = doc.value(node, "Resources");
    if (resources) return resources;
    const parent: number | undefined = doc.refs(node, "Parent")[0];
    node = parent === undefined ? undefined : doc.get(parent);
  }
  return undefined;
}

export function extractPdfText(pdf: Buffer): PdfTextResult {
  const raw = pdf.toString("latin1");
  if (!raw.startsWith("%PDF-")) return { kind: "unsupported", message: "Arquivo não é PDF." };
  if (/\/Encrypt\b/u.test(raw))
    return { kind: "unsupported", message: "PDF criptografado não é suportado." };
  const doc = new PdfDocument(raw);
  const pages = pageOrder(doc);
  if (pages.length === 0) return { kind: "unsupported", message: "PDF sem páginas legíveis." };

  const texts = pages.map((page) => {
    const fonts = loadFonts(doc, inheritedResources(doc, page));
    const streams = doc.refs(page, "Contents").map((ref) => {
      const body = doc.get(ref);
      return body ? doc.streamData(body) : null;
    });
    if (streams.some((stream) => stream === null)) return null;
    return contentText(streams.join("\n"), fonts)
      .split("\n")
      .map((line) => line.replace(/\s+/gu, " ").trim())
      .filter(Boolean)
      .join("\n");
  });
  if (texts.some((text) => text === null)) {
    return { kind: "unsupported", message: "PDF com compressão de conteúdo não suportada." };
  }
  if (!texts.some((text) => /\p{L}{2,}/u.test(text ?? ""))) {
    return {
      kind: "unsupported",
      message: "PDF sem camada de texto legível (escaneado ou fonte sem mapa de caracteres).",
    };
  }
  return { kind: "text", pages: texts as string[] };
}
