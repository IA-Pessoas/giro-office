import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ORGANIZATION_ID =
  process.env.MIGRATION_ORGANIZATION_ID ?? "e8048d1c-0830-45d7-84de-68e20abd685b";
const LOAD_DIR = process.env.MIGRATION_LOAD_DIR ?? "/tmp/giro-office-certificates-v1-dry-run";
const APPLY_ROOT = process.env.MIGRATION_APPLY_DIR ?? "/tmp";
const APPLY = process.argv.includes("--apply");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.join(APPLY_ROOT, `giro-office-certificates-v1-apply-${TIMESTAMP}`);

const TABLES = ["certificate.pj", "certificate.pf"];

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, ".env"));
loadEnvFile(path.join(ROOT, "infra", ".env"));
loadEnvFile(path.join(ROOT, "services", "certificate-service", ".env"));

async function loadPg() {
  const require = createRequire(import.meta.url);
  try {
    return require("pg");
  } catch {
    const pnpmDir = path.join(ROOT, "node_modules", ".pnpm");
    const pgPackage = fs
      .readdirSync(pnpmDir)
      .find(
        (entry) =>
          entry.startsWith("pg@") && fs.existsSync(path.join(pnpmDir, entry, "node_modules", "pg")),
      );
    if (!pgPackage) throw new Error("Pacote pg nao encontrado em node_modules.");
    return require(path.join(pnpmDir, pgPackage, "node_modules", "pg"));
  }
}

function readJson(relativePath) {
  const file = path.join(LOAD_DIR, relativePath);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, data) {
  const file = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function serializeSqlValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function conflictColumns(table) {
  if (table === "certificate.pj") return ["organization_id", "name", "cnpj", "model"];
  if (table === "certificate.pf") return ["organization_id", "name", "cpf", "model"];
  throw new Error(`Tabela sem chave de conflito configurada: ${table}`);
}

async function upsertRows(client, table, rows) {
  if (rows.length === 0) return 0;
  let upserted = 0;
  const conflict = conflictColumns(table);
  for (const row of rows) {
    const columns = Object.keys(row);
    const updateColumns = columns.filter((column) => column !== "id");
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = columns.map((column) => serializeSqlValue(row[column]));
    await client.query(
      `
        insert into ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})
        values (${placeholders.join(", ")})
        on conflict (${conflict.map(quoteIdent).join(", ")})
        do update set ${updateColumns
          .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
          .join(", ")}
      `,
      values,
    );
    upserted += 1;
  }
  return upserted;
}

async function currentCounts(client) {
  const counts = {};
  for (const table of TABLES) {
    const result = await client.query(
      `select count(*)::int as total from ${quoteIdent(table)} where organization_id = $1`,
      [ORGANIZATION_ID],
    );
    counts[table] = result.rows[0].total;
  }
  return counts;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL nao definida.");
  }
  if (!APPLY) {
    throw new Error("Este script exige --apply para escrever no banco.");
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const load = Object.fromEntries(TABLES.map((table) => [table, readJson(`load/${table}.json`)]));
  const quarantine = readJson("quarantine.json");
  const manifest = readJson("manifest.json");
  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const before = await currentCounts(client);
    await client.query("begin");
    try {
      const upserted = {};
      for (const table of TABLES) {
        upserted[table] = await upsertRows(client, table, load[table]);
      }
      await client.query("commit");
      const after = await currentCounts(client);
      const result = {
        organization_id: ORGANIZATION_ID,
        load_dir: LOAD_DIR,
        source_manifest: manifest,
        before,
        upserted,
        after,
        quarantine_rows: quarantine.length,
        committed: true,
        committed_at: new Date().toISOString(),
      };
      writeJson("reports/result.json", result);
      console.log(
        JSON.stringify({ committed: true, out_dir: OUT_DIR, upserted, before, after }, null, 2),
      );
    } catch (err) {
      await client.query("rollback");
      writeJson("reports/error.json", {
        committed: false,
        message: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      });
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
