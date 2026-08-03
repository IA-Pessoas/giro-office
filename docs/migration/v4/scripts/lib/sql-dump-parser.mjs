import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

const INSERT_PREFIX = "INSERT INTO";
const SENSITIVE_COLUMN_PATTERN =
  /(?:senha|password|token|secret|chave|key|cpf|cnpj|rg|email|telefone|phone)/i;

export async function* createSqlTokenizer(filePath, { onChunk } = {}) {
  const parser = new SqlInsertStreamParser(filePath);
  const decoder = new StringDecoder("utf8");
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    onChunk?.(chunk);
    for (const event of parser.consume(decoder.write(chunk))) {
      yield event;
    }
  }

  for (const event of parser.consume(decoder.end())) {
    yield event;
  }
  parser.finish();
}

export async function* iterateSqlRows(filePath) {
  for await (const event of createSqlTokenizer(filePath)) {
    if (event.type === "row") {
      yield event.row;
    }
  }
}

export async function inspectSqlDump(filePath, options = {}) {
  const hash = crypto.createHash("sha256");
  let fileSizeBytes = 0;
  let rowCount = 0;
  let insertStatementCount = 0;
  const columns = [];

  for await (const event of createSqlTokenizer(filePath, {
    onChunk(chunk) {
      fileSizeBytes += chunk.length;
      hash.update(chunk);
    },
  })) {
    if (event.type === "insert") {
      insertStatementCount += 1;
      for (const column of event.columns) {
        if (!columns.includes(column)) {
          columns.push(column);
        }
      }
    }
    if (event.type === "row") {
      rowCount += 1;
    }
  }

  const fileName = path.basename(filePath);
  const relativeTo = options.relativeTo ?? path.dirname(filePath);
  const relativePath = path.relative(relativeTo, filePath).split(path.sep).join("/");
  const legacyIdColumn = findLegacyIdColumn(columns);

  return {
    sourceTable: fileName.replace(/\.sql$/i, ""),
    fileName,
    relativePath,
    fileSizeBytes,
    sha256: hash.digest("hex"),
    columns,
    rowCount,
    insertStatementCount,
    legacyIdColumn,
    sensitiveColumns: columns.filter((column) => SENSITIVE_COLUMN_PATTERN.test(column)),
  };
}

class SqlInsertStreamParser {
  constructor(filePath) {
    this.fileName = path.basename(filePath);
    this.position = 0;
    this.mode = "leading";
    this.header = "";
    this.skipQuote = false;
    this.skipEscape = false;
    this.commentPrevious = "";
    this.columns = [];
    this.row = null;
    this.field = "";
    this.valueWasQuoted = false;
    this.inString = false;
    this.stringEscape = false;
    this.quoteClosed = false;
    this.nestedDepth = 0;
  }

  consume(text) {
    const events = [];
    for (const character of text) {
      this.position += 1;
      this.consumeCharacter(character, events);
    }
    return events;
  }

  finish() {
    if (this.mode === "values" && (this.inString || this.stringEscape || this.row !== null)) {
      this.fail("valor ou linha INSERT sem fechamento");
    }
    if (this.mode === "header") {
      this.fail("cabecalho INSERT sem VALUES");
    }
  }

  consumeCharacter(character, events) {
    if (this.mode === "leading") {
      this.consumeLeading(character);
      return;
    }
    if (this.mode === "line-comment") {
      if (character === "\n") {
        this.mode = "leading";
        this.header = "";
      }
      return;
    }
    if (this.mode === "block-comment") {
      if (this.commentPrevious === "*" && character === "/") {
        this.mode = "leading";
        this.header = "";
        this.commentPrevious = "";
      } else {
        this.commentPrevious = character;
      }
      return;
    }
    if (this.mode === "skip") {
      this.consumeSkipped(character);
      return;
    }
    if (this.mode === "header") {
      this.header += character;
      if (/\bVALUES$/i.test(this.header)) {
        this.columns = parseColumns(this.header.slice(0, -"VALUES".length), this.fail.bind(this));
        this.mode = "values";
        events.push({ type: "insert", columns: this.columns });
      }
      return;
    }
    this.consumeValues(character, events);
  }

  consumeLeading(character) {
    if (this.header.length === 0 && /\s/.test(character)) {
      return;
    }
    this.header += character;
    const candidate = this.header.trimStart().toUpperCase();

    if (candidate === "#") {
      this.mode = "line-comment";
      return;
    }
    if (candidate === "/") {
      return;
    }
    if (candidate === "/*") {
      this.mode = "block-comment";
      this.commentPrevious = "";
      return;
    }
    if (candidate === "-") {
      return;
    }
    if (candidate === "--") {
      this.mode = "line-comment";
      return;
    }
    if (INSERT_PREFIX.startsWith(candidate)) {
      return;
    }
    const insertState = getInsertIntoTableState(candidate);
    if (insertState === "waiting") {
      return;
    }
    if (insertState === "valid") {
      this.mode = "header";
      return;
    }
    this.mode = "skip";
    this.consumeSkipped(character);
  }

  consumeSkipped(character) {
    if (this.skipQuote) {
      if (this.skipEscape) {
        this.skipEscape = false;
      } else if (character === "\\") {
        this.skipEscape = true;
      } else if (character === "'") {
        this.skipQuote = false;
      }
      return;
    }
    if (character === "'") {
      this.skipQuote = true;
      return;
    }
    if (character === ";") {
      this.resetStatement();
    }
  }

  consumeValues(character, events) {
    if (this.row === null) {
      if (/\s/.test(character) || character === ",") {
        return;
      }
      if (character === "(") {
        this.startRow();
        return;
      }
      if (character === ";") {
        this.resetStatement();
        return;
      }
      this.fail("esperado tupla de valores INSERT");
    }

    if (this.inString) {
      if (this.stringEscape) {
        this.field += decodeEscape(character);
        this.stringEscape = false;
      } else if (character === "\\") {
        this.stringEscape = true;
      } else if (character === "'") {
        this.inString = false;
        this.quoteClosed = true;
      } else {
        this.field += character;
      }
      return;
    }

    if (this.quoteClosed) {
      if (character === "'") {
        this.field += "'";
        this.inString = true;
        this.quoteClosed = false;
        return;
      }
      this.quoteClosed = false;
    }

    if (this.valueWasQuoted && /\s/.test(character)) {
      return;
    }
    if (character === "'") {
      if (this.field.trim()) {
        this.fail("aspas inesperadas em valor INSERT");
      }
      this.field = "";
      this.valueWasQuoted = true;
      this.inString = true;
      return;
    }
    if (character === "(") {
      this.nestedDepth += 1;
      this.field += character;
      return;
    }
    if (character === ")") {
      if (this.nestedDepth > 0) {
        this.nestedDepth -= 1;
        this.field += character;
        return;
      }
      this.row.push(this.finishField());
      if (this.row.length !== this.columns.length) {
        this.fail("quantidade de valores diferente da lista de colunas");
      }
      events.push({
        type: "row",
        row: Object.fromEntries(this.columns.map((column, index) => [column, this.row[index]])),
      });
      this.row = null;
      return;
    }
    if (character === "," && this.nestedDepth === 0) {
      this.row.push(this.finishField());
      return;
    }
    if (this.valueWasQuoted) {
      this.fail("caractere inesperado apos valor entre aspas");
    }
    this.field += character;
  }

  startRow() {
    this.row = [];
    this.field = "";
    this.valueWasQuoted = false;
    this.inString = false;
    this.stringEscape = false;
    this.quoteClosed = false;
    this.nestedDepth = 0;
  }

  finishField() {
    const wasQuoted = this.valueWasQuoted;
    const value = wasQuoted ? this.field : this.field.trim();
    this.field = "";
    this.valueWasQuoted = false;
    this.quoteClosed = false;
    return value.toUpperCase() === "NULL" && !wasQuoted ? null : value;
  }

  resetStatement() {
    this.mode = "leading";
    this.header = "";
    this.skipQuote = false;
    this.skipEscape = false;
    this.columns = [];
    this.row = null;
  }

  fail(reason) {
    throw new Error(
      `Erro no parser SQL em ${this.fileName} na posicao ${this.position}: ${reason}`,
    );
  }
}

function getInsertIntoTableState(candidate) {
  if (!candidate.startsWith(INSERT_PREFIX)) {
    return "invalid";
  }

  const tableSegment = candidate.slice(INSERT_PREFIX.length);
  if (!/^\s+/.test(tableSegment)) {
    return "invalid";
  }

  const tableIdentifier = tableSegment.trimStart();
  if (!tableIdentifier) {
    return "waiting";
  }

  const identifierStart = tableIdentifier[0];
  return identifierStart === "`" || identifierStart === '"' || /[A-Z_]/.test(identifierStart)
    ? "valid"
    : "invalid";
}

function parseColumns(header, fail) {
  const match = header.match(/\(([\s\S]*)\)\s*$/);
  if (!match) {
    fail("INSERT sem lista explicita de colunas");
  }
  const columns = match[1].split(",").map((column) => {
    const trimmed = column.trim();
    const quoted = trimmed.match(/^`([^`]+)`$/) ?? trimmed.match(/^"([^"]+)"$/);
    return quoted ? quoted[1] : trimmed;
  });
  if (columns.length === 0 || columns.some((column) => !column)) {
    fail("lista de colunas INSERT invalida");
  }
  return columns;
}

function decodeEscape(character) {
  return (
    {
      0: "\0",
      b: "\b",
      n: "\n",
      r: "\r",
      t: "\t",
      Z: "\u001a",
    }[character] ?? character
  );
}

function findLegacyIdColumn(columns) {
  return (
    columns.find((column) => column.toLowerCase() === "id") ??
    columns.find((column) => /^(?:id_.+|.+_id)$/i.test(column)) ??
    null
  );
}
