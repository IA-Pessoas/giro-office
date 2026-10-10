import { ServiceError } from "@workspace/shared";

// Importação manual de avisos DTE (#1744), seguindo regularize/pages/dte/upload.php e
// Fiscal::cadastrarDTE do legado. Sem amostra anonimizada real: a compatibilidade foi
// verificada só com casos sintéticos montados a partir do PHP.

export const DTE_IMPORT_LIMITS = {
  maxContentLength: 400_000,
  maxTags: 50_000,
  maxRows: 2_000,
  maxFieldLength: 2_000,
} as const;

export const DTE_IMPORT_FORMATS = ["html", "json"] as const;
export type DteImportFormat = (typeof DTE_IMPORT_FORMATS)[number];

export type DteNoticeFields = {
  tipo: string;
  aviso: string;
  cnpj_cpf: string;
  destinatario: string;
  remetente: string;
  data_emissao: string | null;
  assunto: string;
  data_leitura: string | null;
  data_ciencia: string | null;
  registro: string | null;
};

export type DteRejectionReason =
  | "LINHA_INCOMPLETA"
  | "ITEM_INVALIDO"
  | "CAMPO_INVALIDO"
  | "CAMPO_LONGO"
  | "SEM_DADOS";

export type DteRejection = { row: number; reason: DteRejectionReason };

export type DteParsedNotice = {
  row: number;
  fields: DteNoticeFields;
  // Coluna `lido` do legado: 1 para badge-important/badge-warning, zerada ao ler.
  pendingReading: boolean;
};

export type DteParseResult = {
  totalRows: number;
  notices: DteParsedNotice[];
  rejections: DteRejection[];
};

// Mesmo formato que o PHP produzia ao ler o HTML: cellN (1-based) e tipo.
type LegacyItem = Record<string, unknown>;

const PENDING_READING_TYPES = new Set(["badge badge-important", "badge badge-warning"]);

const LATIN1_ENTITY_NAMES =
  "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml".split(
    " ",
  );
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ordf: "ª",
  ordm: "º",
  deg: "°",
  sect: "§",
  ...Object.fromEntries(
    LATIN1_ENTITY_NAMES.map((name, index) => [name, String.fromCodePoint(0xc0 + index)]),
  ),
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

// trim() do PHP: só espaço ASCII, sem tirar o &nbsp;.
const PHP_TRIM_CHARS = " \t\n\r\0\v";

function phpTrim(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && PHP_TRIM_CHARS.includes(text.charAt(start))) start++;
  while (end > start && PHP_TRIM_CHARS.includes(text.charAt(end - 1))) end--;
  return text.slice(start, end);
}

// Toda alternativa aceita o fim do texto: tag sem ">" não força nova varredura (custo linear).
const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<[!?][^>]*(?:>|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^'">])*)(?:>|$)/g;
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title", "noscript"]);
const CLASS_ATTR = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

type HtmlCell = { text: string; spanClass: string | null };

// Tokenizador mínimo em vez de DOM: o Worker não tem DOMParser e nada aqui é renderizado
// nem executado. Lê só a primeira <table>, como o XPath //table do PHP.
// ponytail: tabela aninhada dentro da primeira vira linhas extras, igual ao .//tr do PHP.
function extractHtmlRows(html: string): HtmlCell[][] {
  const rows: HtmlCell[][] = [];
  let depth = 0;
  let row: HtmlCell[] | null = null;
  let cell: HtmlCell | null = null;
  let spanSeen = false;
  let sawTable = false;
  let tags = 0;
  let cursor = 0;
  TOKEN.lastIndex = 0;

  for (let match = TOKEN.exec(html); match; match = TOKEN.exec(html)) {
    if (++tags > DTE_IMPORT_LIMITS.maxTags) {
      throw new ServiceError(422, "HTML complexo demais para importar.");
    }
    if (cell) cell.text += html.slice(cursor, match.index);
    cursor = TOKEN.lastIndex;

    const [, closing, rawName, attrs = ""] = match;
    if (!rawName) continue;
    const name = rawName.toLowerCase();

    if (!closing && RAW_TEXT_TAGS.has(name)) {
      // Busca sem toLowerCase(): ele muda o tamanho do texto ("İ") e desloca o índice.
      const closer = new RegExp(`</${name}`, "gi");
      closer.lastIndex = cursor;
      cursor = closer.exec(html)?.index ?? html.length;
      TOKEN.lastIndex = cursor;
      continue;
    }

    if (name === "table") {
      if (!closing) {
        sawTable = true;
        depth++;
      } else if (depth > 0 && --depth === 0) {
        break;
      }
      continue;
    }
    if (depth === 0) continue;

    if (name === "tr" && !closing) {
      if (rows.length >= DTE_IMPORT_LIMITS.maxRows) {
        throw new ServiceError(422, `Limite de ${DTE_IMPORT_LIMITS.maxRows} linhas excedido.`);
      }
      row = [];
      rows.push(row);
      cell = null;
    } else if (name === "td") {
      cell = null;
      if (!closing && row) {
        cell = { text: "", spanClass: null };
        spanSeen = false;
        row.push(cell);
      }
    } else if (name === "span" && !closing && cell && !spanSeen) {
      spanSeen = true;
      const classMatch = CLASS_ATTR.exec(attrs);
      cell.spanClass = decodeEntities(classMatch?.[1] ?? classMatch?.[2] ?? classMatch?.[3] ?? "");
    }
  }

  if (!sawTable) {
    throw new ServiceError(422, "Tabela não encontrada no HTML fornecido.");
  }
  return rows;
}

function htmlToItems(html: string): Array<LegacyItem | null> {
  const rows = extractHtmlRows(html);
  if (rows.length === 0) throw new ServiceError(422, "Nenhuma linha encontrada na tabela.");

  return rows.map((cells) => {
    if (cells.length < 5) return null;
    const item: LegacyItem = {};
    cells.forEach((cell, index) => {
      item[`cell${index + 1}`] = phpTrim(decodeEntities(cell.text));
      if (index === 2) item.tipo = cell.spanClass;
    });
    return item;
  });
}

function jsonToItems(content: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ServiceError(422, "JSON inválido.");
  }
  if (!Array.isArray(parsed))
    throw new ServiceError(422, "O JSON precisa ser uma lista de avisos.");
  if (parsed.length > DTE_IMPORT_LIMITS.maxRows) {
    throw new ServiceError(422, `Limite de ${DTE_IMPORT_LIMITS.maxRows} linhas excedido.`);
  }
  return parsed;
}

class InvalidField extends Error {
  constructor(readonly reason: DteRejectionReason) {
    super(reason);
  }
}

function text(item: LegacyItem, key: string): string {
  const value = item[key];
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" && typeof value !== "number")
    throw new InvalidField("CAMPO_INVALIDO");
  // Mesmo trim nos dois formatos, para a chave de duplicata não depender de onde veio.
  const result = phpTrim(String(value));
  // O Postgres recusa NUL em TEXT e JSONB: melhor recusar a linha que perder o lote.
  if (result.includes("\0")) throw new InvalidField("CAMPO_INVALIDO");
  if (result.length > DTE_IMPORT_LIMITS.maxFieldLength) throw new InvalidField("CAMPO_LONGO");
  return result;
}

// O legado gravava '0000-00-00 00:00:00' para '-'; aqui ausente vira null.
function dateText(item: LegacyItem, key: string): string | null {
  const value = text(item, key);
  return value === "" || value === "-" ? null : value;
}

function toFields(item: LegacyItem): DteNoticeFields {
  return {
    tipo: text(item, "tipo"),
    aviso: text(item, "cell3"),
    cnpj_cpf: text(item, "cell4"),
    destinatario: text(item, "cell5"),
    remetente: text(item, "cell6"),
    data_emissao: dateText(item, "cell7"),
    assunto: text(item, "cell8"),
    data_leitura: dateText(item, "cell9"),
    data_ciencia: dateText(item, "cell10"),
    registro: dateText(item, "registro"),
  };
}

export function parseDteImport(format: DteImportFormat, content: string): DteParseResult {
  if (content.length > DTE_IMPORT_LIMITS.maxContentLength) {
    throw new ServiceError(413, "Conteúdo acima do tamanho máximo para importação.");
  }
  const items = format === "html" ? htmlToItems(content) : jsonToItems(content);
  const notices: DteParsedNotice[] = [];
  const rejections: DteRejection[] = [];

  items.forEach((item, index) => {
    const rowNumber = index + 1;
    if (format === "html" && item === null) {
      rejections.push({ row: rowNumber, reason: "LINHA_INCOMPLETA" });
      return;
    }
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      rejections.push({ row: rowNumber, reason: "ITEM_INVALIDO" });
      return;
    }
    let fields: DteNoticeFields;
    try {
      fields = toFields(item as LegacyItem);
    } catch (error) {
      if (error instanceof InvalidField) {
        rejections.push({ row: rowNumber, reason: error.reason });
        return;
      }
      throw error;
    }
    const { registro: _registro, ...keyFields } = fields;
    if (Object.values(keyFields).every((value) => value === null || phpTrim(value) === "")) {
      rejections.push({ row: rowNumber, reason: "SEM_DADOS" });
      return;
    }
    notices.push({
      row: rowNumber,
      fields,
      pendingReading: PENDING_READING_TYPES.has(fields.tipo),
    });
  });

  return { totalRows: items.length, notices, rejections };
}

// Como o STR_TO_DATE do legado: dia, mês e hora com um ou dois dígitos, e o que vier depois
// dos minutos (segundos) é ignorado.
const DTE_DATE_TIME = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/;

// Data do portal no formato que o dte/home.php lia (STR_TO_DATE '%d/%m/%Y %H:%i'). O horário
// é o do portal, guardado sem fuso: o filtro da caixa compara só o dia.
export function parseDteDateTime(text: string | null): Date | null {
  const match = DTE_DATE_TIME.exec(text ?? "");
  if (!match) return null;
  const [, rawDay = "", rawMonth = "", year, rawHour = "0", minute = "00"] = match;
  const [day, month, hour] = [rawDay, rawMonth, rawHour].map((part) => part.padStart(2, "0"));
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`);
  // "31/02/2024" não vira data: o Date rolaria para março.
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(`${year}-${month}-${day}`)
    ? date
    : null;
}

// Chave de nove campos do SELECT de Fiscal::cadastrarDTE; o hash cabe num índice único.
export async function dteDedupeKey(fields: DteNoticeFields): Promise<string> {
  const key = JSON.stringify([
    fields.tipo,
    fields.aviso,
    fields.cnpj_cpf,
    fields.destinatario,
    fields.remetente,
    fields.data_emissao,
    fields.assunto,
    fields.data_leitura,
    fields.data_ciencia,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
