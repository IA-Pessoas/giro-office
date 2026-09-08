import { inflateRawSync, inflateSync } from "node:zlib";

import { ServiceError } from "@workspace/shared";

export const PDF_MIME_TYPE = "application/pdf";

const CORRUPTED_MESSAGE = "O arquivo PDF está corrompido ou não pôde ser lido.";
const ENCRYPTED_MESSAGE = "O arquivo PDF está protegido por senha e não pode ser lido.";

/** Limite de descompressão por stream e por documento: barra zip bombs sem estourar a memória. */
const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_STREAM_BYTES = 16 * 1024 * 1024;
/** Teto de códigos mapeados por documento: um `/ToUnicode` hostil declara ranges de 65 mil cada. */
const MAX_CMAP_CODES = 65_536;

interface PdfObject {
  dict: string;
  /** Conteúdo já descomprimido, em latin1 (byte a byte); `null` quando não há stream legível. */
  stream: string | null;
}

/** Mapa `código do glifo -> texto`, extraído do `/ToUnicode` da fonte. */
interface FontCMap {
  codes: Map<number, string>;
  codeBytes: 1 | 2;
}

/**
 * Streams de imagem, arquivo de fonte ou metadados nunca têm texto: descartá-los antes de
 * descomprimir evita inflar megabytes que seriam jogados fora na linha seguinte.
 */
const NON_TEXT_STREAM = /\/Subtype\s*\/Image|\/Length1\b|\/Type\s*\/(Metadata|XRef)\b/;

/**
 * Busca `needle` a partir de posições sempre crescentes, sem revarrer o que já passou.
 *
 * `String.indexOf` chamado num laço de milhares de objetos é quadrático quando o terminador
 * não existe — o caso exato de um PDF forjado com milhões de cabeçalhos `N 0 obj`.
 */
function createForwardFinder(text: string, needle: string): (from: number) => number {
  let found = 0;
  let exhausted = false;

  return (from: number): number => {
    if (exhausted) return -1;
    if (found < from) found = text.indexOf(needle, from);
    if (found < 0) exhausted = true;
    return found;
  };
}

/** Percorre cada trecho entre `begin` e `end` em tempo linear, sem regex preguiçosa. */
function forEachSection(
  content: string,
  begin: string,
  end: string,
  visit: (body: string) => void,
): void {
  let cursor = 0;
  while (cursor < content.length) {
    const start = content.indexOf(begin, cursor);
    if (start < 0) return;
    const stop = content.indexOf(end, start + begin.length);
    if (stop < 0) return;
    visit(content.slice(start + begin.length, stop));
    cursor = stop + end.length;
  }
}

/**
 * Varre os objetos indiretos pelo corpo do arquivo, sem depender da tabela xref
 * (que costuma ser a primeira parte a quebrar num PDF truncado).
 *
 * Só FlateDecode é descomprimido: filtros de imagem (DCTDecode, JPXDecode, CCITTFaxDecode,
 * JBIG2Decode) são descartados de propósito, então um PDF digitalizado nunca vira OCR.
 */
function parseObjects(
  file: Buffer,
  text: string,
): { objects: Map<number, PdfObject>; unreadable: boolean } {
  const objects = new Map<number, PdfObject>();
  const headers = [...text.matchAll(/(\d+)\s+\d+\s+obj\b/g)];
  const findEndObj = createForwardFinder(text, "endobj");
  const findEndStream = createForwardFinder(text, "endstream");
  let remainingBytes = MAX_TOTAL_STREAM_BYTES;
  let unreadable = false;

  function inflate(raw: Buffer): string | null {
    const maxOutputLength = Math.min(MAX_STREAM_BYTES, remainingBytes);
    if (maxOutputLength <= 0) return null;

    for (const decompress of [inflateSync, inflateRawSync]) {
      try {
        const decoded = decompress(raw, { maxOutputLength });
        remainingBytes -= decoded.length;
        return decoded.toString("latin1");
      } catch {
        // Pode ser zlib ou raw deflate: só o segundo fracasso é falha de verdade.
      }
    }
    return null;
  }

  for (const [index, header] of headers.entries()) {
    const start = (header.index ?? 0) + header[0].length;
    const endObj = findEndObj(start);
    const nextHeader = headers[index + 1]?.index ?? text.length;
    const body = text.slice(start, Math.min(endObj < 0 ? text.length : endObj, nextHeader));

    const streamKeyword = /\bstream\r?\n?/.exec(body);
    if (!streamKeyword) {
      objects.set(Number(header[1]), { dict: body, stream: null });
      continue;
    }

    // O corpo pode ter sido truncado por bytes do próprio stream: procura o fim no texto inteiro.
    const dataStart = start + (streamKeyword.index ?? 0) + streamKeyword[0].length;
    const dataEnd = findEndStream(dataStart);
    if (dataEnd < 0) {
      unreadable = true;
      continue;
    }

    const dict = body.slice(0, streamKeyword.index);
    const filter = /\/Filter\s*(\/[A-Za-z0-9]+|\[[^\]]*\])/.exec(dict)?.[1];
    const flate = filter !== undefined && /FlateDecode/.test(filter);
    // `text` é latin1 do arquivo, então índice de caractere é offset de byte.
    const raw = file.subarray(dataStart, dataEnd - (text[dataEnd - 1] === "\n" ? 1 : 0));

    let stream: string | null = null;
    if (!NON_TEXT_STREAM.test(dict)) {
      if (flate) stream = inflate(raw);
      else if (filter === undefined) stream = raw.toString("latin1");
    }
    if (stream === null && flate) unreadable = true;
    objects.set(Number(header[1]), { dict, stream });
  }

  return { objects, unreadable };
}

/** Objetos de PDF 1.5+ ficam comprimidos dentro de `/Type /ObjStm`. */
function expandObjectStreams(objects: Map<number, PdfObject>): void {
  for (const object of [...objects.values()]) {
    if (object.stream === null || !/\/Type\s*\/ObjStm/.test(object.dict)) continue;

    const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1]);
    const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1]);
    if (!Number.isFinite(first) || !Number.isFinite(count)) continue;

    const content = object.stream;
    const pairs = [...content.slice(0, first).matchAll(/(\d+)\s+(\d+)/g)].slice(0, count);
    for (const [index, pair] of pairs.entries()) {
      const from = first + Number(pair[2]);
      const to = pairs[index + 1] ? first + Number(pairs[index + 1][2]) : content.length;
      objects.set(Number(pair[1]), { dict: content.slice(from, to), stream: null });
    }
  }
}

function hexToBytes(hex: string): number[] {
  return [...Buffer.from(hex.replace(/[^\da-f]/gi, ""), "hex")];
}

function hexToText(hex: string): string {
  const digits = hex.replace(/[^\da-f]/gi, "");
  let text = "";
  // Destinos do /ToUnicode são UTF-16BE, podendo ter mais de uma unidade por código.
  for (let index = 0; index + 4 <= digits.length; index += 4) {
    text += String.fromCharCode(Number.parseInt(digits.slice(index, index + 4), 16));
  }
  return text;
}

function parseCMap(content: string): FontCMap {
  const codes = new Map<number, string>();
  let codeBytes: 1 | 2 = 1;

  forEachSection(content, "begincodespacerange", "endcodespacerange", (body) => {
    if ((/<([\da-f]+)>/i.exec(body)?.[1].length ?? 0) > 2) codeBytes = 2;
  });

  forEachSection(content, "beginbfchar", "endbfchar", (body) => {
    for (const entry of body.matchAll(/<([\da-f]+)>\s*<([\da-f]*)>/gi)) {
      if (codes.size >= MAX_CMAP_CODES) return;
      if (entry[1].length > 2) codeBytes = 2;
      codes.set(Number.parseInt(entry[1], 16), hexToText(entry[2]));
    }
  });

  forEachSection(content, "beginbfrange", "endbfrange", (body) => {
    for (const entry of body.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*(<[\da-f]*>|\[[^\]]*\])/gi)) {
      if (codes.size >= MAX_CMAP_CODES) return;
      const low = Number.parseInt(entry[1], 16);
      const high = Number.parseInt(entry[2], 16);
      if (entry[1].length > 2) codeBytes = 2;

      if (entry[3].startsWith("[")) {
        for (const [offset, destination] of [...entry[3].matchAll(/<([\da-f]*)>/gi)].entries()) {
          codes.set(low + offset, hexToText(destination[1]));
        }
        continue;
      }

      const base = hexToText(entry[3].slice(1, -1));
      const lastUnit = base.charCodeAt(base.length - 1);
      const last = Math.min(high, low + MAX_CMAP_CODES - codes.size);
      for (let code = low; code <= last; code += 1) {
        codes.set(code, base.slice(0, -1) + String.fromCharCode(lastUnit + (code - low)));
      }
    }
  });

  return { codes, codeBytes };
}

/**
 * Mapeia o nome do recurso de fonte (`/F1`) para o `/ToUnicode` correspondente.
 *
 * ponytail: os nomes são unificados no documento inteiro em vez de resolvidos por página;
 * resolver o grafo `/Pages -> /Resources` só compensa se um documento reusar o mesmo nome
 * para fontes diferentes.
 */
function collectFontCMaps(objects: Map<number, PdfObject>): Map<string, FontCMap> {
  const fontCMaps = new Map<string, FontCMap>();
  // O mesmo /ToUnicode costuma ser referenciado por todas as páginas: parseia uma vez só.
  const parsedCMaps = new Map<number, FontCMap | null>();

  function cmapOf(fontDict: string): FontCMap | null {
    const toUnicode = Number(/\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(fontDict)?.[1]);
    if (!Number.isFinite(toUnicode)) return null;

    const cached = parsedCMaps.get(toUnicode);
    if (cached !== undefined) return cached;

    const content = objects.get(toUnicode)?.stream ?? null;
    const cmap = content === null ? null : parseCMap(content);
    parsedCMaps.set(toUnicode, cmap);
    return cmap;
  }

  for (const object of objects.values()) {
    const resourcesAt = /\/Font\s*(?:<<|(\d+)\s+\d+\s+R)/g;
    let resources = resourcesAt.exec(object.dict);

    for (; resources !== null; resources = resourcesAt.exec(object.dict)) {
      let dict: string;
      if (resources[1] === undefined) {
        // Dicionário de recursos inline: vai até o `>>` correspondente.
        const end = object.dict.indexOf(">>", resources.index);
        if (end < 0) break;
        dict = object.dict.slice(resources.index, end);
        resourcesAt.lastIndex = end;
      } else {
        dict = objects.get(Number(resources[1]))?.dict ?? "";
      }

      for (const entry of dict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
        const cmap = cmapOf(objects.get(Number(entry[2]))?.dict ?? "");
        if (cmap) fontCMaps.set(entry[1], cmap);
      }
    }
  }

  return fontCMaps;
}

const STRING_ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };

function readLiteralString(content: string, start: number): { bytes: number[]; next: number } {
  const bytes: number[] = [];
  let depth = 1;
  let index = start + 1;

  while (index < content.length && depth > 0) {
    const char = content[index];

    if (char === "\\") {
      const next = content[index + 1] ?? "";
      const octal = /^[0-7]{1,3}/.exec(content.slice(index + 1, index + 4))?.[0];
      if (octal) {
        bytes.push(Number.parseInt(octal, 8) & 0xff);
        index += 1 + octal.length;
        continue;
      }
      if (next === "\n" || next === "\r") {
        index += next === "\r" && content[index + 2] === "\n" ? 3 : 2;
        continue;
      }
      bytes.push((STRING_ESCAPES[next] ?? next).charCodeAt(0));
      index += 2;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth > 0) bytes.push(content.charCodeAt(index));
    index += 1;
  }

  return { bytes, next: index };
}

function decodeShownText(bytes: number[], font: FontCMap | undefined): string {
  if (!font) return Buffer.from(bytes).toString("latin1");

  if (font.codeBytes === 2) {
    let text = "";
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      text += font.codes.get((bytes[index] << 8) | bytes[index + 1]) ?? "";
    }
    return text;
  }

  return bytes.map((byte) => font.codes.get(byte) ?? String.fromCharCode(byte)).join("");
}

type Operand = { text: string } | { number: number } | { name: string } | { array: Operand[] };

/** Âncoras `y`: casam na posição atual sem fatiar o restante do content stream. */
const NAME_AT = /\/([^\s/<>[\]()]*)/y;
const NUMBER_AT = /[-+]?[\d.]+/y;
const OPERATOR_AT = /[A-Za-z'"*\d]+/y;

function matchAt(pattern: RegExp, content: string, index: number): RegExpExecArray | null {
  pattern.lastIndex = index;
  return pattern.exec(content);
}

/**
 * Percorre os operadores de texto do content stream (`Tj`, `TJ`, `'`, `"`).
 *
 * Só o que a página desenha como texto é lido: imagens, XObjects e qualquer outro
 * operador são ignorados, então nada do PDF é executado ou interpretado como comando.
 */
function extractContentText(content: string, fontCMaps: Map<string, FontCMap>): string {
  const parts: string[] = [];
  const operands: Operand[] = [];
  let array: Operand[] | null = null;
  let font: FontCMap | undefined;
  let lastVerticalOffset: number | null = null;
  let index = 0;

  const top = (offset: number): Operand | undefined => operands[operands.length - offset];
  const push = (operand: Operand) => (array ?? operands).push(operand);
  const show = (operand: Operand | undefined) => {
    if (operand && "text" in operand) parts.push(operand.text);
  };
  const asNumber = (operand: Operand | undefined) =>
    operand && "number" in operand ? operand.number : 0;

  while (index < content.length) {
    const char = content[index];
    const code = content.charCodeAt(index);

    if (char === "%") {
      index = content.indexOf("\n", index) + 1 || content.length;
      continue;
    }
    if (code <= 0x20) {
      index += 1;
      continue;
    }
    if (char === "(") {
      const literal = readLiteralString(content, index);
      push({ text: decodeShownText(literal.bytes, font) });
      index = literal.next;
      continue;
    }
    if (char === "<" && content[index + 1] === "<") {
      // Dicionários inline (BDC/DP) não carregam texto desenhado.
      index += 2;
      continue;
    }
    if (char === ">" && content[index + 1] === ">") {
      index += 2;
      continue;
    }
    if (char === "<") {
      const end = content.indexOf(">", index);
      if (end < 0) break;
      push({ text: decodeShownText(hexToBytes(content.slice(index + 1, end)), font) });
      index = end + 1;
      continue;
    }
    if (char === "[") {
      array = [];
      index += 1;
      continue;
    }
    if (char === "]") {
      const closed = array ?? [];
      array = null;
      push({ array: closed });
      index += 1;
      continue;
    }
    if (char === "/") {
      const name = matchAt(NAME_AT, content, index)?.[1] ?? "";
      push({ name });
      index += name.length + 1;
      continue;
    }
    // Dígito, "+", "-" ou ".": início de número.
    if ((code >= 0x30 && code <= 0x39) || code === 0x2b || code === 0x2d || code === 0x2e) {
      const number = matchAt(NUMBER_AT, content, index)?.[0] ?? "";
      push({ number: Number.parseFloat(number) || 0 });
      index += number.length || 1;
      continue;
    }

    const operator = matchAt(OPERATOR_AT, content, index)?.[0] ?? char;
    index += operator.length;

    switch (operator) {
      case "Tf": {
        const name = top(2);
        font = name && "name" in name ? fontCMaps.get(name.name) : undefined;
        break;
      }
      case "Tj":
        show(top(1));
        break;
      case "'":
      case '"':
        parts.push("\n");
        show(top(1));
        break;
      case "TJ": {
        const last = top(1);
        for (const item of last && "array" in last ? last.array : []) {
          if ("text" in item) parts.push(item.text);
          // Recuo grande entre glifos é espaço de palavra; kerning fica bem abaixo disso.
          else if ("number" in item && item.number <= -100) parts.push(" ");
        }
        break;
      }
      case "Td":
      case "TD":
        parts.push(asNumber(top(1)) === 0 ? " " : "\n");
        break;
      case "Tm": {
        const verticalOffset = asNumber(top(1));
        parts.push(verticalOffset === lastVerticalOffset ? " " : "\n");
        lastVerticalOffset = verticalOffset;
        break;
      }
      case "T*":
      case "ET":
        parts.push("\n");
        break;
      default:
        break;
    }

    operands.length = 0;
    array = null;
  }

  return parts.join("");
}

/**
 * Extrai apenas o texto já presente na camada textual de um PDF.
 *
 * Lê somente os operadores de texto dos content streams com FlateDecode ou sem filtro.
 * Filtros de imagem são descartados: um PDF digitalizado resulta em texto vazio e é
 * rejeitado, nunca enviado a OCR nem ao provedor de IA. JavaScript, ações, formulários,
 * anexos e demais objetos do arquivo são ignorados, então nada é executado.
 *
 * Limitações conhecidas: não decifra PDFs protegidos, não aplica predictors de
 * `/DecodeParms`, concatena as páginas na ordem dos objetos indiretos e para de
 * descomprimir ao atingir o teto de bytes do documento, devolvendo o texto obtido até ali.
 */
export function extractPdfText(file: Buffer): string {
  const text = file.toString("latin1");
  if (!text.startsWith("%PDF-")) throw new ServiceError(400, CORRUPTED_MESSAGE);
  // `/Encrypt` só é legal como referência indireta no trailer ou no dicionário do XRef stream.
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(text)) throw new ServiceError(400, ENCRYPTED_MESSAGE);

  const { objects, unreadable } = parseObjects(file, text);
  if (objects.size === 0) throw new ServiceError(400, CORRUPTED_MESSAGE);

  expandObjectStreams(objects);
  const fontCMaps = collectFontCMaps(objects);

  const pages: string[] = [];
  for (const object of objects.values()) {
    const stream = object.stream;
    if (stream === null || stream.includes("begincmap") || !/\b(Tj|TJ)\b/.test(stream)) continue;
    pages.push(extractContentText(stream, fontCMaps));
  }

  const extracted = pages
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!extracted && unreadable) throw new ServiceError(400, CORRUPTED_MESSAGE);
  return extracted;
}
