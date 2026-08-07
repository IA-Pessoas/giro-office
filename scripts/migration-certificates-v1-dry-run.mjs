import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SOURCE_DIR = process.env.LEGACY_DUMP_DIR ?? "/home/bruno/Documents/06.07.2026";
const OUT_DIR = process.env.MIGRATION_OUT_DIR ?? "/tmp/giro-office-certificates-v1-dry-run";
const ORGANIZATION_ID =
  process.env.MIGRATION_ORGANIZATION_ID ?? "e8048d1c-0830-45d7-84de-68e20abd685b";
const GENERATED_NAMESPACE =
  process.env.MIGRATION_GENERATED_NAMESPACE ?? "3f68d246-0b54-4a10-9415-a8845a767fb5";

const SOURCE_TABLES = ["tb_certificados.pj", "tb_certificados.pf"];
const TARGET_TABLES = ["certificate.pj", "certificate.pf"];
const REQUIRED_FALLBACK = "NAO INFORMADO";

function uuidv5(name, namespace) {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = crypto.createHash("sha1").update(ns).update(Buffer.from(name, "utf8")).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const value = hash.subarray(0, 16).toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function generatedId(scope, legacyId) {
  return uuidv5(`${scope}:${legacyId}`, GENERATED_NAMESPACE);
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function requiredText(value) {
  return cleanText(value) ?? REQUIRED_FALLBACK;
}

function digitsOnly(value) {
  const digits = cleanText(value)?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? digits : REQUIRED_FALLBACK;
}

function optionalDigits(value) {
  const digits = cleanText(value)?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? digits : null;
}

function boolLegacy(value) {
  return value === true || value === 1 || value === "1";
}

function isoDate(value) {
  const text = cleanText(value);
  if (!text || text === "0000-00-00") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== text) return null;
  return date.toISOString();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === "NULL") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function extractInsertStatements(sql) {
  const statements = [];
  let offset = 0;

  while (offset < sql.length) {
    const start = sql.indexOf("INSERT INTO", offset);
    if (start === -1) break;

    let inString = false;
    let escaping = false;
    for (let index = start; index < sql.length; index += 1) {
      const char = sql[index];
      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === "'") {
          inString = false;
        }
        continue;
      }

      if (char === "'") {
        inString = true;
        continue;
      }
      if (char === ";") {
        statements.push(sql.slice(start, index + 1));
        offset = index + 1;
        break;
      }
      if (index === sql.length - 1) offset = sql.length;
    }
  }

  return statements;
}

function parseSqlDump(tableName) {
  const file = path.join(SOURCE_DIR, `${tableName}.sql`);
  if (!fs.existsSync(file)) return [];
  const sql = fs.readFileSync(file, "utf8");
  const rows = [];
  const inserts = extractInsertStatements(sql);

  for (const statement of inserts) {
    const insert = statement.match(/INSERT INTO `[^`]+` \(([^)]+)\) VALUES\s*([\s\S]*);$/);
    if (!insert) continue;
    const columns = [...insert[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    let row = null;
    let field = "";
    let inString = false;
    let escaping = false;

    const pushField = () => {
      row.push(parseScalar(field));
      field = "";
    };

    for (const char of insert[2]) {
      if (inString) {
        if (escaping) {
          const escapes = { n: "\n", r: "\r", t: "\t", 0: "\0" };
          field += escapes[char] ?? char;
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === "'") {
          inString = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === "'") {
        inString = true;
        continue;
      }
      if (char === "(" && row === null) {
        row = [];
        continue;
      }
      if (row && char === ",") {
        pushField();
        continue;
      }
      if (row && char === ")") {
        pushField();
        rows.push(Object.fromEntries(columns.map((column, index) => [column, row[index]])));
        row = null;
        continue;
      }
      if (row && !/\s/.test(char)) field += char;
    }
  }

  return rows;
}

function dumpRows() {
  return Object.fromEntries(SOURCE_TABLES.map((table) => [table, parseSqlDump(table)]));
}

function addQuarantine(quarantine, table, row, reason, field = null) {
  quarantine.push({
    table,
    legacy_id: row.legacy_id ?? row.id ?? null,
    field,
    reason,
  });
}

function withLegacyId(record, legacyId) {
  Object.defineProperty(record, "legacy_id", {
    value: legacyId,
    enumerable: false,
  });
  return record;
}

function buildCertificatePj(row, organizationId) {
  const expirationDate = isoDate(row.validade);
  if (!expirationDate) return null;

  return withLegacyId(
    {
      id: generatedId("certificate.pj", row.id),
      client_castelo_status: boolLegacy(row.cliente),
      client_focus_status: false,
      name: requiredText(row.nome),
      cnpj: digitsOnly(row.cnpj),
      responsible: requiredText(row.responsavel),
      model: requiredText(row.modelo),
      legal_nature: requiredText(row.nj),
      password: requiredText(row.senha),
      expiration_date: expirationDate,
      notes: cleanText(row.obs),
      was_paid: boolLegacy(row.pagamento),
      payment_date: isoDate(row.data_pagamento),
      payment_amount: numberOrNull(row.valor_pagamento),
      contact_info: cleanText(row.contato),
      has_certificate: boolLegacy(row.possui),
      organization_id: organizationId,
    },
    row.id,
  );
}

function buildCertificatePf(row, organizationId) {
  const expirationDate = isoDate(row.validade);
  if (!expirationDate) return null;

  return withLegacyId(
    {
      id: generatedId("certificate.pf", row.id),
      client_castelo_status: boolLegacy(row.cliente),
      client_focus_status: false,
      name: requiredText(row.nome),
      cpf: digitsOnly(row.cpf),
      model: requiredText(row.modelo),
      password: requiredText(row.senha),
      expiration_date: expirationDate,
      notes: cleanText(row.obs),
      enterprise: cleanText(row.empresa),
      cnpj: optionalDigits(row.cnpj),
      was_paid: boolLegacy(row.pagamento),
      payment_date: isoDate(row.data_pagamento),
      payment_amount: numberOrNull(row.valor_pagamento),
      contact_info: cleanText(row.contato),
      has_certificate: boolLegacy(row.possui),
      organization_id: organizationId,
    },
    row.id,
  );
}

function dedupe(rows, keyFn, quarantine, table) {
  const used = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (used.has(key)) {
      addQuarantine(quarantine, table, row, "duplicate certificate identity");
      continue;
    }
    used.add(key);
    result.push(row);
  }
  return result;
}

function buildCertificateLoad(rows, options = {}) {
  const organizationId = options.organizationId ?? ORGANIZATION_ID;
  const quarantine = [];
  const load = {
    "certificate.pj": [],
    "certificate.pf": [],
  };

  for (const row of rows["tb_certificados.pj"] ?? []) {
    const certificate = buildCertificatePj(row, organizationId);
    if (!certificate) {
      addQuarantine(
        quarantine,
        "certificate.pj",
        row,
        "invalid required expiration_date",
        "validade",
      );
      continue;
    }
    load["certificate.pj"].push(certificate);
  }

  load["certificate.pj"] = dedupe(
    load["certificate.pj"],
    (row) => `${row.organization_id}|${row.name}|${row.cnpj}|${row.model}`,
    quarantine,
    "certificate.pj",
  );

  for (const row of rows["tb_certificados.pf"] ?? []) {
    const certificate = buildCertificatePf(row, organizationId);
    if (!certificate) {
      addQuarantine(
        quarantine,
        "certificate.pf",
        row,
        "invalid required expiration_date",
        "validade",
      );
      continue;
    }
    load["certificate.pf"].push(certificate);
  }

  load["certificate.pf"] = dedupe(
    load["certificate.pf"],
    (row) => `${row.organization_id}|${row.name}|${row.cpf}|${row.model}`,
    quarantine,
    "certificate.pf",
  );

  return { load, quarantine };
}

function writeJson(relativePath, data) {
  const file = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  const sourceRows = dumpRows();
  const { load, quarantine } = buildCertificateLoad(sourceRows);
  const manifest = {
    generated_at: new Date().toISOString(),
    source_dir: SOURCE_DIR,
    organization_id: ORGANIZATION_ID,
    counts: {
      source: Object.fromEntries(
        SOURCE_TABLES.map((table) => [table, sourceRows[table]?.length ?? 0]),
      ),
      load: Object.fromEntries(TARGET_TABLES.map((table) => [table, load[table]?.length ?? 0])),
      quarantine: quarantine.length,
    },
  };

  for (const table of TARGET_TABLES) {
    writeJson(`load/${table}.json`, load[table]);
  }
  writeJson("quarantine.json", quarantine);
  writeJson("manifest.json", manifest);

  console.log(JSON.stringify({ ...manifest, out_dir: OUT_DIR }, null, 2));
}

export {
  buildCertificateLoad,
  buildCertificatePf,
  buildCertificatePj,
  generatedId,
  parseSqlDump,
  SOURCE_TABLES,
  TARGET_TABLES,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
