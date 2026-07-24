import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SOURCE_DIR = process.env.LEGACY_DUMP_DIR ?? "/home/bruno/Documents/10.07.2026";
const APPLY_ROOT = process.env.MIGRATION_APPLY_DIR ?? "/tmp";
const ORGANIZATION_ID =
  process.env.MIGRATION_ORGANIZATION_ID ?? "e8048d1c-0830-45d7-84de-68e20abd685b";
const GENERATED_NAMESPACE =
  process.env.MIGRATION_GENERATED_NAMESPACE ?? "3f68d246-0b54-4a10-9415-a8845a767fb5";
const APPLY = process.argv.includes("--apply");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.join(APPLY_ROOT, `giro-office-parcelamento-v1-apply-${TIMESTAMP}`);

const SOURCE_TABLES = [
  "tb_admin.usuarios",
  "tb_admin.permissoes_parcelamento",
  "tb_integracao.clientes",
  "tb_parcelamento.clientes",
  "tb_parcelamento.parcelamentos",
  "tb_parcelamento.competencia",
  "tb_parcelamento.simulacoes",
  "tb_parcelamento.simulacoes_parcelamentos",
  "tb_cbc.panorama_clientes_parcelamento",
  "tb_cbc.panorama_parcelamentos",
  "tb_historico.parcelamento",
  "tb_rh.colaboradores",
];

const DELETE_ORDER = [
  "parcelamento.installmentsCompetencies",
  "parcelamento.panorama",
  "parcelamento.installments",
];

const INSERT_ORDER = [
  "parcelamento.installments",
  "parcelamento.installmentsCompetencies",
  "parcelamento.panorama",
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
loadEnvFile(path.join(ROOT, "services", "src", ".env"));

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

function requiredText(value, fallback = "-") {
  return cleanText(value) ?? fallback;
}

function normalizeNatural(value) {
  return requiredText(value, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDocument(value) {
  return requiredText(value, "").replace(/\D/g, "");
}

function nullableLegacyDate(value) {
  const text = cleanText(value);
  if (!text || text.startsWith("0000-00-00")) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) return text.replace(" ", "T");
  return text;
}

function boolLegacy(value) {
  return Number(value ?? 0) === 1;
}

function numberValue(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function intValue(value) {
  return Math.trunc(numberValue(value));
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

  for (const statement of extractInsertStatements(sql)) {
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

function loadSourceRows() {
  return Object.fromEntries(SOURCE_TABLES.map((table) => [table, parseSqlDump(table)]));
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function writeJson(relativePath, data) {
  const file = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function compactRow(row) {
  if (!row) return null;
  const compact = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "password" || key === "senha") compact[key] = value ? "<redacted>" : value;
    else compact[key] = value;
  }
  return compact;
}

function addQuarantine(quarantine, legacyTable, row, reason, targetTable = null, field = null) {
  quarantine.push({
    legacy_table: legacyTable,
    legacy_id: String(row?.id ?? ""),
    target_table: targetTable,
    field,
    reason,
    row: compactRow(row),
  });
}

function addQuarantineSummary(quarantine, legacyTable, rows, reason, targetTable = null) {
  for (const row of rows) {
    quarantine.push({
      legacy_table: legacyTable,
      legacy_id: String(row?.id ?? ""),
      target_table: targetTable,
      field: null,
      reason,
    });
  }
}

function uniqueIndex(rows, keyFn) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  const index = new Map();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.length === 1) index.set(key, bucket[0]);
  }
  return index;
}

function firstMatch(row, strategies) {
  for (const [index, keyFn] of strategies) {
    const key = keyFn(row);
    if (!key) continue;
    const match = index.get(key);
    if (match) return match;
  }
  return null;
}

function legacyClientKeys(row) {
  return {
    full: [
      normalizeNatural(row.nome),
      normalizeNatural(row.nome_fantasia),
      normalizeDocument(row.cpf_cnpj),
      normalizeNatural(row.email),
    ].join("|"),
    nameDocument: normalizeDocument(row.cpf_cnpj)
      ? `${normalizeNatural(row.nome)}|${normalizeDocument(row.cpf_cnpj)}`
      : null,
    companyDocument: normalizeDocument(row.cpf_cnpj)
      ? `${normalizeNatural(row.razao_social ?? row.nome)}|${normalizeDocument(row.cpf_cnpj)}`
      : null,
    document: normalizeDocument(row.cpf_cnpj),
    nameFantasy: `${normalizeNatural(row.nome)}|${normalizeNatural(row.nome_fantasia)}`,
    name: normalizeNatural(row.nome),
  };
}

function buildClientResolver(rows, current) {
  const strategies = [
    [
      uniqueIndex(current.clients, (row) =>
        [
          normalizeNatural(row.name),
          normalizeNatural(row.fantasy_name),
          normalizeDocument(row.cpf_cnpj),
          normalizeNatural(row.email),
        ].join("|"),
      ),
      (row) => legacyClientKeys(row).full,
    ],
    [
      uniqueIndex(current.clients, (row) => {
        const document = normalizeDocument(row.cpf_cnpj);
        return document ? `${normalizeNatural(row.name)}|${document}` : null;
      }),
      (row) => legacyClientKeys(row).nameDocument,
    ],
    [
      uniqueIndex(current.clients, (row) => {
        const document = normalizeDocument(row.cpf_cnpj);
        return document ? `${normalizeNatural(row.company_name)}|${document}` : null;
      }),
      (row) => legacyClientKeys(row).companyDocument,
    ],
    [
      uniqueIndex(current.clients, (row) => normalizeDocument(row.cpf_cnpj)),
      (row) => legacyClientKeys(row).document,
    ],
    [
      uniqueIndex(
        current.clients,
        (row) => `${normalizeNatural(row.name)}|${normalizeNatural(row.fantasy_name)}`,
      ),
      (row) => legacyClientKeys(row).nameFantasy,
    ],
    [
      uniqueIndex(current.clients, (row) => normalizeNatural(row.name)),
      (row) => legacyClientKeys(row).name,
    ],
  ];

  const byLegacy = new Map();
  for (const row of rows["tb_integracao.clientes"]) {
    const match = firstMatch(row, strategies);
    if (match) byLegacy.set(String(row.id), match.id);
  }
  for (const row of rows["tb_parcelamento.clientes"]) {
    const match = firstMatch(row, strategies);
    if (match) byLegacy.set(String(row.id), match.id);
  }

  return (legacyId) => byLegacy.get(String(legacyId ?? "")) ?? null;
}

function buildUserResolver(rows, current) {
  const collaboratorsByAdminId = new Map();
  for (const collaborator of rows["tb_rh.colaboradores"]) {
    if (collaborator.user_id)
      collaboratorsByAdminId.set(String(collaborator.user_id), collaborator);
  }

  const byLogin = uniqueIndex(current.users, (row) => normalizeNatural(row.login));
  const byCpf = uniqueIndex(current.users, (row) => normalizeDocument(row.cpf));
  const byRg = uniqueIndex(current.users, (row) => normalizeDocument(row.rg));
  const byEmail = uniqueIndex(current.users, (row) => normalizeNatural(row.email));
  const byName = uniqueIndex(current.users, (row) => normalizeNatural(row.name));
  const cache = new Map();

  return (legacyId) => {
    const key = cleanText(legacyId);
    if (!key || Number(key) === 0) return null;
    if (cache.has(key)) return cache.get(key);
    const admin = rows["tb_admin.usuarios"].find((row) => String(row.id) === key);
    const collaborator = collaboratorsByAdminId.get(key);
    const generatedAdminId = generatedId("user:tb_admin.usuarios", key);
    const generatedCollaboratorId = collaborator
      ? generatedId("user:tb_rh.colaboradores", collaborator.id)
      : null;
    const id =
      (current.userIds.has(generatedAdminId) ? generatedAdminId : null) ??
      (generatedCollaboratorId && current.userIds.has(generatedCollaboratorId)
        ? generatedCollaboratorId
        : null) ??
      byLogin.get(normalizeNatural(admin?.user))?.id ??
      byCpf.get(normalizeDocument(collaborator?.cpf))?.id ??
      byRg.get(normalizeDocument(collaborator?.rg))?.id ??
      byEmail.get(normalizeNatural(collaborator?.email))?.id ??
      byName.get(normalizeNatural(collaborator?.nome ?? admin?.nome))?.id ??
      null;
    cache.set(key, id);
    return id;
  };
}

function mapInstallmentStatus(value) {
  if (Number(value) === 1) return "Liquidado";
  if (Number(value) === 2) return "Paralisado";
  return "Ativo";
}

function mapSituationShutdown(value) {
  const text = cleanText(value);
  if (!text || text === "0") return null;
  return text;
}

function buildLoad(rows, current) {
  const load = Object.fromEntries(INSERT_ORDER.map((table) => [table, []]));
  const permissions = [];
  const quarantine = [];
  const clientIdForLegacy = buildClientResolver(rows, current);
  const userIdForLegacy = buildUserResolver(rows, current);
  const installmentByLegacy = new Map();

  for (const row of rows["tb_parcelamento.parcelamentos"]) {
    const clientId = clientIdForLegacy(row.cliente_id);
    if (!clientId) {
      addQuarantine(
        quarantine,
        "tb_parcelamento.parcelamentos",
        row,
        "cliente_id sem correspondencia no tenant atual",
        "parcelamento.installments",
        "client_id",
      );
      continue;
    }
    const id = generatedId("parcelamento.installments:tb_parcelamento.parcelamentos", row.id);
    installmentByLegacy.set(String(row.id), id);
    load["parcelamento.installments"].push({
      id,
      client_id: clientId,
      type: requiredText(row.tipo, "Migrado"),
      jurisdiction: requiredText(row.estancia, "Migrado"),
      is_automatic_debit: boolLegacy(row.debito_automatico),
      consolidated_total_amount: numberValue(row.total_consolidado),
      first_installment_amount: numberValue(row.primeira_parcela),
      current_month_installment_amount: numberValue(row.parcela_mes_vigente),
      outstanding_balance: numberValue(row.saldo_devedor),
      paid_installments_count: intValue(row.parcelas_pagas),
      agreed_installments_count: intValue(row.parcelas_acordadas),
      remaining_installments_count: intValue(row.parcelas_restantes),
      overdue_installments_count: intValue(row.parcelas_vencidas),
      enrollment_date: nullableLegacyDate(row.data_adesao),
      document_url: cleanText(row.documento) ?? cleanText(row.caminho) ?? "",
      status: mapInstallmentStatus(row.situacao),
      completion_date: nullableLegacyDate(row.data_finalizacao),
      down_payment_installments_count: intValue(row.parcelas_entradas),
      legal_nature: requiredText(row.natureza, "Migrado"),
      situation_shutdown: mapSituationShutdown(row.tipo_paralisacao),
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_parcelamento.competencia"]) {
    const installmentId = installmentByLegacy.get(String(row.id_parcelamento));
    if (!installmentId) {
      addQuarantine(
        quarantine,
        "tb_parcelamento.competencia",
        row,
        "id_parcelamento fora da carga filtrada",
        "parcelamento.installmentsCompetencies",
        "installment_id",
      );
      continue;
    }
    const notes = [
      cleanText(row.obs),
      cleanText(row.recibo) ? `Recibo legado: ${row.recibo}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    load["parcelamento.installmentsCompetencies"].push({
      id: generatedId("parcelamento.installmentsCompetencies:tb_parcelamento.competencia", row.id),
      installment_id: installmentId,
      how_many_paid: intValue(row.pagas),
      how_many_overdue: intValue(row.vencida),
      download: boolLegacy(row.download),
      download_notes: cleanText(row.download_obs),
      upload_file: boolLegacy(row.upload),
      is_sent: boolLegacy(row.envio),
      submission_type: cleanText(row.tipo_envio),
      notes: notes || null,
      installment_amount: numberValue(row.parcela),
      competence: requiredText(row.data, "legacy"),
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_cbc.panorama_parcelamentos"]) {
    const clientId = clientIdForLegacy(row.cliente_id);
    if (!clientId) {
      addQuarantine(
        quarantine,
        "tb_cbc.panorama_parcelamentos",
        row,
        "cliente_id sem correspondencia no tenant atual",
        "parcelamento.panorama",
        "client_id",
      );
      continue;
    }
    const responsibleId = userIdForLegacy(row.responsavel_id);
    load["parcelamento.panorama"].push({
      id: generatedId("parcelamento.panorama:tb_cbc.panorama_parcelamentos", row.id),
      competence: requiredText(row.comp, "legacy"),
      cnd_municipal: boolLegacy(row.cnd_municipal),
      cnd_state: boolLegacy(row.cnd_estadual),
      cnd_federal: boolLegacy(row.cnd_federal),
      cnd_fgts: boolLegacy(row.cnd_fgts),
      cnd_labor: boolLegacy(row.cnd_trabalhista),
      protests: boolLegacy(row.protestos),
      state_tax_situation: boolLegacy(row.situacao_fiscal_estadual),
      federal_tax_situation: boolLegacy(row.situacao_fiscal_federal),
      responsavel_id: responsibleId,
      client_id: clientId,
      organization_id: ORGANIZATION_ID,
    });
    if (row.responsavel_id && !responsibleId) {
      addQuarantine(
        quarantine,
        "tb_cbc.panorama_parcelamentos",
        row,
        "responsavel_id sem correspondencia; panorama migrado sem responsavel",
        "parcelamento.panorama",
        "responsavel_id",
      );
    }
  }

  for (const row of rows["tb_admin.permissoes_parcelamento"]) {
    const userId = userIdForLegacy(row.user_id);
    if (!userId) {
      addQuarantine(
        quarantine,
        "tb_admin.permissoes_parcelamento",
        row,
        "user_id sem correspondencia no tenant atual",
        "permissions",
        "user_id",
      );
      continue;
    }
    permissions.push({
      user_id: userId,
      organization_id: ORGANIZATION_ID,
      parcelamento: Number(row.permissao ?? 0),
    });
  }

  for (const row of rows["tb_cbc.panorama_clientes_parcelamento"]) {
    addQuarantine(
      quarantine,
      "tb_cbc.panorama_clientes_parcelamento",
      row,
      "snapshot sem competencia; preservado fora da carga principal",
      "parcelamento.panorama",
    );
  }
  addQuarantineSummary(
    quarantine,
    "tb_historico.parcelamento",
    rows["tb_historico.parcelamento"],
    "historico sem tabela destino no schema atual",
  );
  addQuarantineSummary(
    quarantine,
    "tb_parcelamento.simulacoes",
    rows["tb_parcelamento.simulacoes"],
    "simulacoes sem tabela destino no schema atual",
  );
  addQuarantineSummary(
    quarantine,
    "tb_parcelamento.simulacoes_parcelamentos",
    rows["tb_parcelamento.simulacoes_parcelamentos"],
    "itens de simulacao sem tabela destino no schema atual",
  );

  return { load, permissions, quarantine };
}

async function currentContext(client) {
  const clients = (
    await client.query(
      "select id, name, company_name, fantasy_name, cpf_cnpj, email from clients where organization_id = $1",
      [ORGANIZATION_ID],
    )
  ).rows;
  const users = (
    await client.query(
      "select id, name, login, cpf, rg, email from users where organization_id = $1",
      [ORGANIZATION_ID],
    )
  ).rows;
  return {
    clients,
    users,
    userIds: new Set(users.map((row) => row.id)),
  };
}

async function countTables(client, tables) {
  const counts = {};
  for (const table of tables) {
    const result = await client.query(
      `select count(*)::int as total from ${quoteIdent(table)} where organization_id = $1`,
      [ORGANIZATION_ID],
    );
    counts[table] = result.rows[0].total;
  }
  return counts;
}

async function deleteCurrentScope(client) {
  const deleted = {};
  await client.query('update "permissions" set parcelamento = null where organization_id = $1', [
    ORGANIZATION_ID,
  ]);
  for (const table of DELETE_ORDER) {
    const result = await client.query(
      `delete from ${quoteIdent(table)} where organization_id = $1`,
      [ORGANIZATION_ID],
    );
    deleted[table] = result.rowCount;
  }
  return deleted;
}

async function insertRows(client, table, rows) {
  let inserted = 0;
  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map((column) => row[column]);
    await client.query(
      `insert into ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) values (${columns
        .map((_, index) => `$${index + 1}`)
        .join(", ")})`,
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
        insert into "permissions" (id, user_id, organization_id, parcelamento)
        values (gen_random_uuid()::text, $1, $2, $3)
        on conflict (user_id, organization_id)
        do update set parcelamento = excluded.parcelamento
      `,
      [row.user_id, row.organization_id, row.parcelamento],
    );
  }
  return permissions.length;
}

async function validateFinalCounts(client, expected) {
  const finalCounts = await countTables(client, INSERT_ORDER);
  for (const table of INSERT_ORDER) {
    if (finalCounts[table] !== expected[table]) {
      throw new Error(
        `Contagem final divergente em ${table}: esperado ${expected[table]}, encontrado ${finalCounts[table]}`,
      );
    }
  }
  return finalCounts;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao definida.");
  if (!APPLY) throw new Error("Este script exige --apply para escrever no banco.");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const rows = loadSourceRows();
    const current = await currentContext(client);
    const beforeCounts = await countTables(client, INSERT_ORDER);
    const { load, permissions, quarantine } = buildLoad(rows, current);
    const expected = Object.fromEntries(INSERT_ORDER.map((table) => [table, load[table].length]));

    writeJson("reports/plan.json", {
      organization_id: ORGANIZATION_ID,
      sourceDir: SOURCE_DIR,
      outDir: OUT_DIR,
      sourceRows: Object.fromEntries(
        Object.entries(rows).map(([table, value]) => [table, value.length]),
      ),
      current: {
        clients: current.clients.length,
        users: current.users.length,
      },
      beforeCounts,
      plannedInsertRows: expected,
      plannedPermissionUpserts: permissions.length,
      plannedQuarantineRows: quarantine.length,
    });
    writeJson("quarantine/apply-quarantine.json", quarantine);

    await client.query("begin");
    try {
      const deleted = await deleteCurrentScope(client);
      const inserted = {};
      for (const table of INSERT_ORDER) {
        inserted[table] = await insertRows(client, table, load[table]);
      }
      const permissionsUpserted = await upsertPermissions(client, permissions);
      const finalCounts = await validateFinalCounts(client, expected);
      await client.query("commit");
      writeJson("reports/result.json", {
        organization_id: ORGANIZATION_ID,
        sourceDir: SOURCE_DIR,
        outDir: OUT_DIR,
        deleted,
        inserted,
        permissionsUpserted,
        finalCounts,
        quarantineRows: quarantine.length,
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            outDir: OUT_DIR,
            inserted,
            permissionsUpserted,
            quarantineRows: quarantine.length,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await client.query("rollback");
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
