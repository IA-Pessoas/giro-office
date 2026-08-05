import { readdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BEGIN_READ_ONLY = "BEGIN TRANSACTION READ ONLY";
const MAX_QUERY_LENGTH = 64 * 1024;
const FORBIDDEN_KEYWORDS = new Set([
  "ALTER",
  "ANALYZE",
  "BEGIN",
  "CALL",
  "CLUSTER",
  "COMMENT",
  "COMMIT",
  "COPY",
  "CREATE",
  "DEALLOCATE",
  "DELETE",
  "DISCARD",
  "DO",
  "DROP",
  "EXECUTE",
  "GRANT",
  "INSERT",
  "INTO",
  "LISTEN",
  "LOAD",
  "LOCK",
  "MERGE",
  "NOTIFY",
  "PREPARE",
  "REFRESH",
  "REINDEX",
  "RESET",
  "REVOKE",
  "ROLLBACK",
  "SECURITY",
  "SET",
  "TRUNCATE",
  "UNLISTEN",
  "UPDATE",
  "VACUUM",
]);
const FORBIDDEN_FUNCTIONS = new Set([
  "DBLINK_EXEC",
  "LO_EXPORT",
  "LO_IMPORT",
  "NEXTVAL",
  "PG_ADVISORY_LOCK",
  "PG_NOTIFY",
  "PG_TRY_ADVISORY_LOCK",
  "SETVAL",
]);
const ALLOWED_READ_ONLY_FUNCTIONS = new Set(["ANY", "COUNT", "UNNEST"]);
const PARENTHESIZED_SQL_KEYWORDS = new Set(["AS", "EXISTS", "FILTER", "FROM", "IN"]);

export async function loadPg() {
  const require = createRequire(import.meta.url);
  try {
    return require("pg");
  } catch {}

  const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const pnpmDirectory = path.join(repositoryRoot, "node_modules", ".pnpm");
  let entries;
  try {
    entries = await readdir(pnpmDirectory, { withFileTypes: true });
  } catch {
    throw new Error("Pacote PostgreSQL indisponível para o preflight somente leitura.");
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || !/^pg@\d/.test(entry.name)) continue;
    const candidate = path.join(pnpmDirectory, entry.name, "node_modules", "pg");
    try {
      const canonicalCandidate = await realpath(candidate);
      const canonicalPnpmDirectory = await realpath(pnpmDirectory);
      if (!isWithin(canonicalPnpmDirectory, canonicalCandidate)) continue;
      return require(canonicalCandidate);
    } catch {}
  }
  throw new Error("Pacote PostgreSQL indisponível para o preflight somente leitura.");
}

export async function createReadOnlyClient({ databaseUrl, loadPgModule = loadPg } = {}) {
  validateDatabaseUrl(databaseUrl);
  if (typeof loadPgModule !== "function") {
    throw new TypeError("Loader PostgreSQL inválido.");
  }
  const pg = await loadPgModule();
  if (typeof pg?.Client !== "function") {
    throw new Error("Cliente PostgreSQL indisponível para o preflight somente leitura.");
  }
  return new pg.Client({ connectionString: databaseUrl });
}

export function assertReadOnlyQuery(query) {
  const { text } = snapshotQuery(query);
  assertReadOnlySql(text);
  return true;
}

function assertReadOnlySql(text) {
  const tokens = tokenizeConservativeSql(text);
  if (tokens.length === 0) throw readOnlyError();

  const first = tokens[0];
  if (first.word !== "SELECT" && first.word !== "WITH") throw readOnlyError();
  if (first.depth !== 0) throw readOnlyError();

  for (const token of tokens) {
    if (FORBIDDEN_KEYWORDS.has(token.word) || FORBIDDEN_FUNCTIONS.has(token.word)) {
      throw readOnlyError();
    }
    if (
      token.functionCall &&
      !ALLOWED_READ_ONLY_FUNCTIONS.has(token.word) &&
      !PARENTHESIZED_SQL_KEYWORDS.has(token.word)
    ) {
      throw readOnlyError();
    }
  }
  if (
    first.word === "WITH" &&
    !tokens.some(({ depth, word }) => depth === 0 && word === "SELECT")
  ) {
    throw readOnlyError();
  }
  if (hasLockingSelect(tokens)) throw readOnlyError();
}

export async function withReadOnlyTransaction(client, callback) {
  if (client === null || typeof client !== "object" || typeof client.query !== "function") {
    throw new TypeError("Cliente PostgreSQL inválido.");
  }
  if (typeof callback !== "function") throw new TypeError("Callback de preflight inválido.");

  let transactionStarted = false;
  let transactionActive = false;
  try {
    if (typeof client.connect === "function") await client.connect();
    await client.query(BEGIN_READ_ONLY);
    transactionStarted = true;
    transactionActive = true;
    const transaction = Object.freeze({
      query: async (query, values) => {
        if (!transactionActive)
          throw new Error("Transação encerrada; query somente leitura rejeitada.");
        const snapshot = snapshotQuery(query, values);
        assertReadOnlySql(snapshot.text);
        if (snapshot.callStyle === "text") return client.query(snapshot.text);
        if (snapshot.callStyle === "arguments") {
          return client.query(snapshot.text, snapshot.values);
        }
        return client.query(snapshot.config);
      },
    });
    const result = await callback(transaction);
    transactionActive = false;
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    transactionActive = false;
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        throw new Error("Falha no rollback da transação somente leitura.", { cause: error });
      }
    }
    throw error;
  } finally {
    transactionActive = false;
    await closeClient(client);
  }
}

function snapshotQuery(query, separateValues) {
  if (typeof query === "string") {
    if (separateValues === undefined) return { callStyle: "text", text: query };
    return {
      callStyle: "arguments",
      text: query,
      values: snapshotValues(separateValues),
    };
  }
  if (separateValues !== undefined) throw new TypeError("Query PostgreSQL inválida.");
  if (query === null || typeof query !== "object" || Array.isArray(query)) {
    throw new TypeError("Query PostgreSQL inválida.");
  }
  if (Object.getPrototypeOf(query) !== Object.prototype) {
    throw new TypeError("Configuração de query PostgreSQL possui prototype não permitido.");
  }
  const keys = Reflect.ownKeys(query);
  if (keys.some((key) => typeof key === "symbol")) {
    throw new TypeError("Configuração de query PostgreSQL possui symbol não permitido.");
  }
  if (keys.includes("name")) {
    throw new Error("Query preparada nomeada não é permitida no transaction pooler.");
  }
  if (keys.some((key) => key !== "text" && key !== "values")) {
    throw new TypeError("Configuração de query PostgreSQL não permitida.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(query);
  if (Object.values(descriptors).some(isAccessorDescriptor)) {
    throw new TypeError("Configuração de query PostgreSQL com accessor não permitida.");
  }
  if (typeof descriptors.text?.value !== "string") {
    throw new TypeError("Query PostgreSQL inválida.");
  }
  const text = descriptors.text.value;
  if (descriptors.values === undefined || descriptors.values.value === undefined) {
    return {
      callStyle: "config",
      config: Object.freeze({ text }),
      text,
    };
  }
  const values = snapshotValues(descriptors.values.value);
  return {
    callStyle: "config",
    config: Object.freeze({ text, values }),
    text,
    values,
  };
}

function snapshotValues(values, depth = 0) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype || depth > 8) {
    throw new TypeError("Values PostgreSQL inválidos.");
  }
  const keys = Reflect.ownKeys(values);
  if (keys.some((key) => typeof key === "symbol")) {
    throw new TypeError("Values PostgreSQL possuem symbol não permitido.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(values);
  if (Object.values(descriptors).some(isAccessorDescriptor)) {
    throw new TypeError("Values PostgreSQL com accessor não são permitidos.");
  }
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) {
    throw new TypeError("Values PostgreSQL possuem propriedades extras ou lacunas.");
  }
  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined) throw new TypeError("Values PostgreSQL possuem lacunas.");
    const value = descriptor.value;
    if (Array.isArray(value)) snapshot.push(snapshotValues(value, depth + 1));
    else if (isQueryScalar(value)) snapshot.push(value);
    else throw new TypeError("Value PostgreSQL não suportado pelo preflight.");
  }
  return Object.freeze(snapshot);
}

function isAccessorDescriptor(descriptor) {
  return descriptor.get !== undefined || descriptor.set !== undefined;
}

function isQueryScalar(value) {
  return (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "string"
  );
}

function tokenizeConservativeSql(sql) {
  if (typeof sql !== "string" || sql.length === 0 || sql.length > MAX_QUERY_LENGTH) {
    throw readOnlyError();
  }
  const tokens = [];
  let depth = 0;
  let index = 0;

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === ";" || character === "'" || character === "`" || character === "\0") {
      throw readOnlyError();
    }
    if ((character === "-" && next === "-") || (character === "/" && next === "*")) {
      throw readOnlyError();
    }
    if (character === '"') {
      index = consumeQuotedIdentifier(sql, index + 1);
      if (nextNonWhitespaceCharacter(sql, index) === "(") throw readOnlyError();
      continue;
    }
    if (character === "$") {
      const parameter = sql.slice(index).match(/^\$[1-9]\d*/)?.[0];
      if (parameter === undefined) throw readOnlyError();
      index += parameter.length;
      continue;
    }
    if (character === "(") {
      depth += 1;
      index += 1;
      continue;
    }
    if (character === ")") {
      depth -= 1;
      if (depth < 0) throw readOnlyError();
      index += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const word = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/)[0];
      tokens.push({
        depth,
        functionCall: nextNonWhitespaceCharacter(sql, index + word.length) === "(",
        word: word.toUpperCase(),
      });
      index += word.length;
      continue;
    }
    if (!/[0-9.,:+*/%<>=!|&?[\]-]/.test(character)) throw readOnlyError();
    index += 1;
  }

  if (depth !== 0) throw readOnlyError();
  return tokens;
}

function consumeQuotedIdentifier(sql, start) {
  let index = start;
  while (index < sql.length) {
    if (sql[index] === '"') {
      if (sql[index + 1] === '"') {
        index += 2;
        continue;
      }
      return index + 1;
    }
    if (sql[index] === "\0") throw readOnlyError();
    index += 1;
  }
  throw readOnlyError();
}

function nextNonWhitespaceCharacter(sql, start) {
  let index = start;
  while (index < sql.length && /\s/u.test(sql[index])) index += 1;
  return sql[index] ?? null;
}

function hasLockingSelect(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].word !== "FOR") continue;
    const suffix = tokens.slice(index + 1, index + 4).map(({ word }) => word);
    if (
      suffix[0] === "UPDATE" ||
      suffix[0] === "SHARE" ||
      (suffix[0] === "NO" && suffix[1] === "KEY" && suffix[2] === "UPDATE") ||
      (suffix[0] === "KEY" && suffix[1] === "SHARE")
    ) {
      return true;
    }
  }
  return false;
}

function validateDatabaseUrl(databaseUrl) {
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    throw new Error("URL PostgreSQL obrigatória para o preflight somente leitura.");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("URL PostgreSQL inválida para o preflight somente leitura.");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol) || parsed.hostname.length === 0) {
    throw new Error("URL PostgreSQL inválida para o preflight somente leitura.");
  }
}

async function closeClient(client) {
  if (typeof client.release === "function") {
    await client.release();
    return;
  }
  if (typeof client.end === "function") await client.end();
}

function readOnlyError() {
  return new Error("SQL rejeitado: somente SELECT/WITH estritamente somente leitura é permitido.");
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
