import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ORGANIZATION_ID =
  process.env.MIGRATION_ORGANIZATION_ID ?? "e8048d1c-0830-45d7-84de-68e20abd685b";
const LOAD_DIR = process.env.MIGRATION_LOAD_DIR ?? "/tmp/giro-office-rh-pessoal-v3-dry-run";
const APPLY_ROOT = process.env.MIGRATION_APPLY_DIR ?? "/tmp";
const APPLY = process.argv.includes("--apply");
const APPLY_PESSOAL_PASSWORDS = process.env.MIGRATION_APPLY_PESSOAL_PASSWORDS === "1";
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.join(APPLY_ROOT, `giro-office-rh-pessoal-v3-apply-${TIMESTAMP}`);

const INSERT_ORDER = [
  "pessoal.union",
  "pessoal.payroll",
  "pessoal.ldd",
  "pessoal.obrigations",
  "pessoal.situations",
  "pessoal.passwords",
  "rh.request_categories",
  "rh.score_questions",
  "rh.pointConfig",
  "rh.points",
  "rh.timeSheets",
  "rh.timeBankReleases",
  "rh.timeClockRequest",
  "rh.score",
  "rh.score_nitro",
  "rh.score_evaluations",
  "rh.requests",
  "rh.request_messages",
];

const DELETE_ORDER = [
  "pessoal.passwords",
  "pessoal.situations",
  "pessoal.obrigations",
  "pessoal.payroll",
  "pessoal.ldd",
  "pessoal.union",
  "rh.request_messages",
  "rh.requests",
  "rh.request_categories",
  "rh.score_evaluations",
  "rh.score_nitro",
  "rh.score",
  "rh.score_questions",
  "rh.timeClockRequest",
  "rh.points",
  "rh.timeBankReleases",
  "rh.timeSheets",
  "rh.pointConfig",
  "rh.holidays",
];

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
loadEnvFile(path.join(ROOT, "services", "pessoal-service", ".env"));

function readJson(relativePath) {
  const file = path.join(LOAD_DIR, relativePath);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, data) {
  const file = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

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

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableFile(table) {
  return `load/${table}.json`;
}

function loadTable(table) {
  return readJson(tableFile(table));
}

function addQuarantine(quarantine, table, row, reason, field = null) {
  quarantine.push({
    table,
    id: row.id ?? null,
    field,
    reason,
  });
}

function requireId(set, value) {
  return value && set.has(value);
}

function nullMissingUser(row, field, userIds) {
  if (row[field] && !userIds.has(row[field])) row[field] = null;
}
function isEncryptedPessoalPassword(value) {
  if (value === null || value === undefined) return true;
  try {
    const payload = JSON.parse(value);
    return (
      typeof payload.v === "string" &&
      typeof payload.iv === "string" &&
      typeof payload.tag === "string" &&
      typeof payload.data === "string"
    );
  } catch {
    return false;
  }
}

function dedupe(rows, keyFn, quarantine, table, reason) {
  const used = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (used.has(key)) {
      addQuarantine(quarantine, table, row, reason);
      continue;
    }
    used.add(key);
    result.push(row);
  }
  return result;
}

function filterLoad(rawLoad, current) {
  const quarantine = [];
  const migratedAt = new Date().toISOString();
  const load = Object.fromEntries(INSERT_ORDER.map((table) => [table, rawLoad[table] ?? []]));

  load["pessoal.payroll"] = load["pessoal.payroll"]
    .map((row) => ({ ...row }))
    .filter((row) => {
      nullMissingUser(row, "responsible_id", current.userIds);
      if (row.union_id && !load["pessoal.union"].some((union) => union.id === row.union_id)) {
        row.union_id = null;
      }
      if (requireId(current.clientIds, row.client_id)) return true;
      addQuarantine(quarantine, "pessoal.payroll", row, "client_id inexistente no tenant atual");
      return false;
    });
  load["pessoal.payroll"] = dedupe(
    load["pessoal.payroll"],
    (row) => row.client_id,
    quarantine,
    "pessoal.payroll",
    "client_id duplicado apos reconciliacao",
  );

  for (const table of ["pessoal.ldd", "pessoal.obrigations"]) {
    load[table] = load[table].filter((row) => {
      if (table === "pessoal.obrigations") nullMissingUser(row, "responsavel_id", current.userIds);
      if (requireId(current.clientIds, row.client_id)) return true;
      addQuarantine(quarantine, table, row, "client_id inexistente no tenant atual");
      return false;
    });
  }
  load["pessoal.obrigations"] = dedupe(
    load["pessoal.obrigations"],
    (row) => `${row.client_id}|${row.competence}`,
    quarantine,
    "pessoal.obrigations",
    "organization_id/client_id/competence duplicado apos reconciliacao",
  );

  load["pessoal.situations"] = load["pessoal.situations"]
    .map((row) => ({ ...row }))
    .filter((row) => {
      nullMissingUser(row, "completed_by_id", current.userIds);
      if (!requireId(current.clientIds, row.client_id)) {
        addQuarantine(
          quarantine,
          "pessoal.situations",
          row,
          "client_id inexistente no tenant atual",
        );
        return false;
      }
      if (!requireId(current.userIds, row.registered_by_id)) {
        addQuarantine(
          quarantine,
          "pessoal.situations",
          row,
          "registered_by_id inexistente no tenant atual",
        );
        return false;
      }
      return true;
    });
  if (APPLY_PESSOAL_PASSWORDS) {
    load["pessoal.passwords"] = load["pessoal.passwords"]
      .map((row) => ({ ...row }))
      .filter((row) => {
        nullMissingUser(row, "responsavel_id", current.userIds);
        if (!requireId(current.clientIds, row.client_id)) {
          addQuarantine(
            quarantine,
            "pessoal.passwords",
            row,
            "client_id inexistente no tenant atual",
          );
          return false;
        }
        for (const field of ["login_main", "senha_main", "login_secondary", "senha_secondary"]) {
          if (!isEncryptedPessoalPassword(row[field])) {
            addQuarantine(
              quarantine,
              "pessoal.passwords",
              row,
              `${field} sem criptografia compativel com pessoal-service`,
            );
            return false;
          }
        }
        return true;
      });
  } else {
    for (const row of load["pessoal.passwords"]) {
      addQuarantine(
        quarantine,
        "pessoal.passwords",
        row,
        "senhas exigem criptografia do pessoal-service; carga bloqueada nesta etapa",
      );
    }
    load["pessoal.passwords"] = [];
  }

  load["rh.pointConfig"] = load["rh.pointConfig"].filter((row) => {
    if (requireId(current.userIds, row.user_id)) return true;
    addQuarantine(quarantine, "rh.pointConfig", row, "user_id inexistente no tenant atual");
    return false;
  });
  load["rh.pointConfig"] = dedupe(
    load["rh.pointConfig"],
    (row) => row.user_id,
    quarantine,
    "rh.pointConfig",
    "user_id duplicado apos reconciliacao",
  );

  load["rh.points"] = load["rh.points"].filter((row) => {
    if (requireId(current.userIds, row.user_id)) return true;
    addQuarantine(quarantine, "rh.points", row, "user_id inexistente no tenant atual");
    return false;
  });
  const pointIds = new Set(load["rh.points"].map((row) => row.id));

  for (const table of ["rh.timeSheets"]) {
    load[table] = load[table].filter((row) => {
      if (requireId(current.userIds, row.user_id)) return true;
      addQuarantine(quarantine, table, row, "user_id inexistente no tenant atual");
      return false;
    });
  }

  load["rh.timeBankReleases"] = load["rh.timeBankReleases"].filter((row) => {
    if (!requireId(current.userIds, row.user_id)) {
      addQuarantine(quarantine, "rh.timeBankReleases", row, "user_id inexistente no tenant atual");
      return false;
    }
    if (!requireId(current.userIds, row.added_by_user_id)) {
      addQuarantine(
        quarantine,
        "rh.timeBankReleases",
        row,
        "added_by_user_id inexistente no tenant atual",
      );
      return false;
    }
    return true;
  });

  load["rh.timeClockRequest"] = load["rh.timeClockRequest"]
    .map((row) => ({ ...row }))
    .filter((row) => {
      nullMissingUser(row, "approver_user_id", current.userIds);
      if (!requireId(current.userIds, row.user_id)) {
        addQuarantine(
          quarantine,
          "rh.timeClockRequest",
          row,
          "user_id inexistente no tenant atual",
        );
        return false;
      }
      if (!pointIds.has(row.point_id)) {
        addQuarantine(quarantine, "rh.timeClockRequest", row, "point_id fora da carga filtrada");
        return false;
      }
      return true;
    });

  load["rh.score"] = load["rh.score"]
    .map((row) => ({ ...row, updated_at: row.updated_at ?? migratedAt }))
    .filter((row) => {
      if (requireId(current.userIds, row.user_id)) return true;
      addQuarantine(quarantine, "rh.score", row, "user_id inexistente no tenant atual");
      return false;
    });
  load["rh.score"] = dedupe(
    load["rh.score"],
    (row) => `${row.user_id}|${row.quarter}`,
    quarantine,
    "rh.score",
    "user_id/quarter duplicado apos reconciliacao",
  );
  const scoreIds = new Set(load["rh.score"].map((row) => row.id));

  load["rh.score_nitro"] = load["rh.score_nitro"].filter((row) => {
    if (scoreIds.has(row.score_id)) return true;
    addQuarantine(quarantine, "rh.score_nitro", row, "score_id fora da carga filtrada");
    return false;
  });
  load["rh.score_nitro"] = dedupe(
    load["rh.score_nitro"],
    (row) => row.score_id,
    quarantine,
    "rh.score_nitro",
    "score_id duplicado apos reconciliacao",
  );

  load["rh.score_evaluations"] = load["rh.score_evaluations"]
    .map((row) => ({ ...row }))
    .filter((row) => {
      nullMissingUser(row, "evaluator_id", current.userIds);
      if (scoreIds.has(row.score_id)) return true;
      addQuarantine(quarantine, "rh.score_evaluations", row, "score_id fora da carga filtrada");
      return false;
    });

  const categoryIds = new Set(load["rh.request_categories"].map((row) => row.id));
  load["rh.requests"] = load["rh.requests"]
    .map((row) => ({ ...row }))
    .filter((row) => {
      nullMissingUser(row, "assigned_to_user_id", current.userIds);
      if (!requireId(current.userIds, row.requester_user_id)) {
        addQuarantine(
          quarantine,
          "rh.requests",
          row,
          "requester_user_id inexistente no tenant atual",
        );
        return false;
      }
      if (!categoryIds.has(row.category_id)) {
        addQuarantine(quarantine, "rh.requests", row, "category_id fora da carga filtrada");
        return false;
      }
      return true;
    });
  const requestIds = new Set(load["rh.requests"].map((row) => row.id));

  load["rh.request_messages"] = load["rh.request_messages"].filter((row) => {
    if (!requestIds.has(row.request_id)) {
      addQuarantine(quarantine, "rh.request_messages", row, "request_id fora da carga filtrada");
      return false;
    }
    if (!requireId(current.userIds, row.sender_user_id)) {
      addQuarantine(
        quarantine,
        "rh.request_messages",
        row,
        "sender_user_id inexistente no tenant atual",
      );
      return false;
    }
    return true;
  });

  return { load, quarantine };
}

function mergePermissions(rawPermissions, current) {
  const byUser = new Map();
  const quarantine = [];
  for (const row of rawPermissions) {
    if (!current.userIds.has(row.user_id)) {
      addQuarantine(quarantine, "permissions", row, "user_id inexistente no tenant atual");
      continue;
    }
    const currentRow = byUser.get(row.user_id) ?? {
      user_id: row.user_id,
      organization_id: ORGANIZATION_ID,
      rh: null,
      pessoal: null,
    };
    if (row.rh !== undefined) currentRow.rh = row.rh;
    if (row.pessoal !== undefined) currentRow.pessoal = row.pessoal;
    byUser.set(row.user_id, currentRow);
  }
  return { permissions: [...byUser.values()], quarantine };
}

async function currentSets(client) {
  const users = await client.query("select id from users where organization_id = $1", [
    ORGANIZATION_ID,
  ]);
  const clients = await client.query("select id from clients where organization_id = $1", [
    ORGANIZATION_ID,
  ]);
  const departments = await client.query("select id from departments where organization_id = $1", [
    ORGANIZATION_ID,
  ]);
  return {
    userIds: new Set(users.rows.map((row) => row.id)),
    clientIds: new Set(clients.rows.map((row) => row.id)),
    departmentIds: new Set(departments.rows.map((row) => row.id)),
  };
}

async function deleteCurrentScope(client) {
  const deleted = {};
  await client.query(
    'update "permissions" set rh = null, pessoal = null where organization_id = $1',
    [ORGANIZATION_ID],
  );
  for (const table of DELETE_ORDER) {
    const result = await client.query(
      `delete from ${quoteIdent(table)} where organization_id = $1`,
      [ORGANIZATION_ID],
    );
    deleted[table] = result.rowCount;
  }
  return deleted;
}

function serializeSqlValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

async function insertRows(client, table, rows) {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (const row of rows) {
    const columns = Object.keys(row).filter((column) => !column.startsWith("dry_run_"));
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = columns.map((column) => serializeSqlValue(row[column]));
    await client.query(
      `insert into ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) values (${placeholders.join(", ")})`,
      values,
    );
    inserted += 1;
  }
  return inserted;
}

async function upsertPermissions(client, permissions) {
  for (const row of permissions) {
    await client.query(
      `
        insert into "permissions" (id, user_id, organization_id, rh, pessoal)
        values (gen_random_uuid()::text, $1, $2, $3, $4)
        on conflict (user_id, organization_id)
        do update set rh = excluded.rh, pessoal = excluded.pessoal
      `,
      [row.user_id, row.organization_id, row.rh, row.pessoal],
    );
  }
  return permissions.length;
}

async function validateFinalCounts(client, expected) {
  const counts = {};
  for (const table of INSERT_ORDER) {
    const result = await client.query(
      `select count(*)::int as total from ${quoteIdent(table)} where organization_id = $1`,
      [ORGANIZATION_ID],
    );
    counts[table] = result.rows[0].total;
    if (counts[table] !== expected[table]) {
      throw new Error(
        `Contagem final divergente em ${table}: esperado ${expected[table]}, encontrado ${counts[table]}`,
      );
    }
  }
  return counts;
}

function loadRawTables() {
  const rawLoad = {};
  for (const table of INSERT_ORDER) rawLoad[table] = loadTable(table);
  rawLoad.permissions = loadTable("permissions");
  return rawLoad;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL nao definida.");
  }
  if (!APPLY) {
    throw new Error("Este script exige --apply para escrever no banco.");
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const rawLoad = loadRawTables();
    const current = await currentSets(client);
    const { load, quarantine } = filterLoad(rawLoad, current);
    const permissionResult = mergePermissions(rawLoad.permissions, current);
    quarantine.push(...permissionResult.quarantine);

    const expected = Object.fromEntries(
      Object.entries(load).map(([table, rows]) => [table, rows.length]),
    );
    const passwordQuarantineRows = quarantine.filter(
      (row) => row.table === "pessoal.passwords",
    ).length;
    const blockedPasswords = APPLY_PESSOAL_PASSWORDS ? 0 : rawLoad["pessoal.passwords"].length;
    const planned = {
      organization_id: ORGANIZATION_ID,
      loadDir: LOAD_DIR,
      outDir: OUT_DIR,
      current: {
        users: current.userIds.size,
        clients: current.clientIds.size,
        departments: current.departmentIds.size,
      },
      plannedInsertRows: expected,
      plannedPermissionUpserts: permissionResult.permissions.length,
      passwordApplyEnabled: APPLY_PESSOAL_PASSWORDS,
      passwordRowsFromLoad: rawLoad["pessoal.passwords"].length,
      plannedPasswordInserts: load["pessoal.passwords"].length,
      passwordQuarantineRows,
      blockedPasswords,
      applyQuarantineRows: quarantine.length,
    };
    writeJson("reports/plan.json", planned);
    writeJson("quarantine/apply-quarantine.json", quarantine);

    await client.query("begin");
    try {
      const deleted = await deleteCurrentScope(client);
      const inserted = {};
      for (const table of INSERT_ORDER) {
        inserted[table] = await insertRows(client, table, load[table]);
      }
      const permissionsUpserted = await upsertPermissions(client, permissionResult.permissions);
      const finalCounts = await validateFinalCounts(client, expected);
      await client.query("commit");
      writeJson("reports/result.json", {
        ...planned,
        backupCounts: null,
        deleted,
        inserted,
        permissionsUpserted,
        finalCounts,
        committed: true,
        committedAt: new Date().toISOString(),
      });
      console.log(
        JSON.stringify(
          {
            committed: true,
            outDir: OUT_DIR,
            inserted,
            permissionsUpserted,
            applyQuarantineRows: quarantine.length,
            passwordQuarantineRows,
            blockedPasswords,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await client.query("rollback");
      writeJson("reports/error.json", {
        committed: false,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
