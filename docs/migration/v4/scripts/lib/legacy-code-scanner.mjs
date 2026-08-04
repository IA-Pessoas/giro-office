import { open, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([".js", ".php", ".sql"]);
const EXCLUDED_DIRECTORIES = new Set(["node_modules", "uploads", "vendor"]);
const SQL_OPERATIONS = ["select", "insert", "update", "delete"];

export async function scanLegacyUsage({
  legacyDir,
  sourceTables,
  readTextFile = readFile,
  openSqlFile = open,
}) {
  const files = await listLegacyTextFiles(legacyDir);
  const orderedSourceTables = [...sourceTables].sort(compareText);
  const records = new Map(orderedSourceTables.map((sourceTable) => [sourceTable, createRecord()]));
  const sourceTablesByNormalizedName = new Map(
    orderedSourceTables.map((sourceTable) => [sourceTable.toLowerCase(), sourceTable]),
  );
  const directMatcher = createDirectMatcher(orderedSourceTables);

  for (const filePath of files) {
    if (path.extname(filePath).toLowerCase() === ".sql") {
      await scanSqlFile({
        directMatcher,
        filePath,
        legacyDir,
        openSqlFile,
        orderedSourceTables,
        records,
        sourceTablesByNormalizedName,
      });
    } else {
      const content = await readTextFile(filePath, "utf8");
      scanFile({
        content,
        directMatcher,
        filePath,
        legacyDir,
        orderedSourceTables,
        records,
        sourceTablesByNormalizedName,
      });
    }
  }

  return {
    legacyDirectoryLabel: path.basename(path.resolve(legacyDir)),
    tables: orderedSourceTables.map((sourceTable) =>
      formatRecord(sourceTable, records.get(sourceTable)),
    ),
  };
}

async function scanSqlFile({
  directMatcher,
  filePath,
  legacyDir,
  openSqlFile,
  orderedSourceTables,
  records,
  sourceTablesByNormalizedName,
}) {
  const file = await openSqlFile(filePath, "r");
  let header = "";
  let headerStartLine = 0;
  let lineNumber = 0;
  let position = 0;
  let skippingValues = false;
  let quote = null;
  let escaped = false;
  const byte = Buffer.allocUnsafe(1);
  try {
    while (true) {
      const { bytesRead } = await file.read(byte, 0, 1, position);
      if (bytesRead === 0) {
        break;
      }
      const character = byte.toString("utf8", 0, bytesRead);
      position += bytesRead;

      if (skippingValues) {
        const nextValueState = consumeInsertValueByte({ character, escaped, quote });
        skippingValues = !nextValueState.complete;
        quote = nextValueState.quote;
        escaped = nextValueState.escaped;
      } else {
        if (header.length === 0) {
          headerStartLine = lineNumber;
        }
        header += character;
        if (/\bvalues$/i.test(header)) {
          scanSqlHeader({
            content: header,
            directMatcher,
            filePath,
            headerStartLine,
            legacyDir,
            orderedSourceTables,
            records,
            sourceTablesByNormalizedName,
          });
          header = "";
          skippingValues = true;
        } else if (character === ";") {
          scanSqlHeader({
            content: header,
            directMatcher,
            filePath,
            headerStartLine,
            legacyDir,
            orderedSourceTables,
            records,
            sourceTablesByNormalizedName,
          });
          header = "";
        }
      }

      if (character === "\n") {
        lineNumber += 1;
      }
    }
  } finally {
    await file.close();
  }

  scanSqlHeader({
    content: header,
    directMatcher,
    filePath,
    headerStartLine,
    legacyDir,
    orderedSourceTables,
    records,
    sourceTablesByNormalizedName,
  });
}

function consumeInsertValueByte({ character, escaped, quote }) {
  if (quote === null) {
    if (character === "'" || character === '"') {
      return { complete: false, escaped: false, quote: character };
    }
    return { complete: character === ";", escaped: false, quote: null };
  }
  if (escaped) {
    return { complete: false, escaped: false, quote };
  }
  if (character === "\\") {
    return { complete: false, escaped: true, quote };
  }
  if (character === quote) {
    return { complete: false, escaped: false, quote: null };
  }
  return { complete: false, escaped: false, quote };
}

function scanSqlHeader({ content, headerStartLine, ...options }) {
  if (content.length === 0) {
    return;
  }
  scanFile({ content, lineOffset: headerStartLine, ...options });
}

async function listLegacyTextFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new Error("Diretório de código legado inválido.");
  }

  const files = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) {
        files.push(...(await listLegacyTextFiles(entryPath)));
      }
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }
  return files;
}

function scanFile({
  content,
  directMatcher,
  filePath,
  legacyDir,
  lineOffset = 0,
  orderedSourceTables,
  records,
  sourceTablesByNormalizedName,
}) {
  const relativePath = path.relative(legacyDir, filePath).split(path.sep).join("/");
  for (const [lineNumber, line] of content.split(/\r?\n/).entries()) {
    for (const sourceTable of findDirectMatches(
      line,
      directMatcher,
      sourceTablesByNormalizedName,
    )) {
      addUsage(records.get(sourceTable), {
        line,
        lineNumber: lineNumber + lineOffset,
        relativePath,
      });
    }
    for (const { sourceTable, pattern } of findDynamicMatches(line, orderedSourceTables)) {
      addUsage(records.get(sourceTable), {
        line,
        lineNumber: lineNumber + lineOffset,
        relativePath,
        dynamicPattern: pattern,
      });
    }
  }
}

function createRecord() {
  return {
    legacyReferences: new Set(),
    legacyRelationships: new Set(),
    modules: new Set(),
    operations: new Set(),
  };
}

function formatRecord(sourceTable, record) {
  return {
    sourceTable,
    legacyModule:
      record.modules.size === 0 ? null : [...record.modules].sort(compareText).join(", "),
    legacyReferences: [...record.legacyReferences].sort(compareText),
    operations: [...record.operations].sort(compareText),
    legacyRelationships: [...record.legacyRelationships].sort(compareText),
  };
}

function addUsage(record, { line, lineNumber, relativePath, dynamicPattern = null }) {
  record.legacyReferences.add(`${relativePath}:${lineNumber + 1}`);
  record.modules.add(path.posix.dirname(relativePath));
  for (const operation of findOperations(line, dynamicPattern !== null)) {
    record.operations.add(operation);
  }
  if (dynamicPattern !== null) {
    record.legacyRelationships.add(dynamicPattern);
  }
}

function createDirectMatcher(sourceTables) {
  if (sourceTables.length === 0) {
    return null;
  }
  const alternatives = [...sourceTables]
    .sort((left, right) => right.length - left.length || compareText(left, right))
    .map(escapeRegularExpression)
    .join("|");
  return new RegExp(`(^|[^A-Za-z0-9_.])(${alternatives})(?=$|[^A-Za-z0-9_.])`, "gi");
}

function findDirectMatches(line, matcher, sourceTablesByNormalizedName) {
  if (matcher === null) {
    return [];
  }
  matcher.lastIndex = 0;
  const matches = [];
  let match = matcher.exec(line);
  while (match !== null) {
    matches.push(sourceTablesByNormalizedName.get(match[2].toLowerCase()));
    match = matcher.exec(line);
  }
  return matches;
}

function* findDynamicMatches(line, sourceTables) {
  const dynamicMatcher = /([A-Za-z0-9_.]+_)\s*(\{\$[^}]+\})/g;
  let dynamicMatch = dynamicMatcher.exec(line);
  while (dynamicMatch !== null) {
    const [, prefix, interpolation] = dynamicMatch;
    for (const sourceTable of sourceTables) {
      if (sourceTable.toLowerCase().startsWith(prefix.toLowerCase())) {
        yield { sourceTable, pattern: `${prefix}${interpolation}` };
      }
    }
    dynamicMatch = dynamicMatcher.exec(line);
  }
}

function findOperations(line, dynamic) {
  const operations = SQL_OPERATIONS.filter((operation) =>
    new RegExp(`\\b${operation}\\b`, "i").test(line),
  );
  if (/Painel\s*::\s*select\b/i.test(line) && !operations.includes("select")) {
    operations.push("select");
  }
  if (dynamic) {
    operations.push("dynamic");
  }
  return operations;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareText(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
