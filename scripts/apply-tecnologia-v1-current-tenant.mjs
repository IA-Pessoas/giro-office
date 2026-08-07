import crypto, { createCipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SOURCE_DIR = process.env.LEGACY_DUMP_DIR ?? "/home/bruno/Documents/06.07.2026";
const APPLY_ROOT = process.env.MIGRATION_APPLY_DIR ?? "/tmp";
const ORGANIZATION_ID =
  process.env.MIGRATION_ORGANIZATION_ID ?? "e8048d1c-0830-45d7-84de-68e20abd685b";
const GENERATED_NAMESPACE =
  process.env.MIGRATION_GENERATED_NAMESPACE ?? "3f68d246-0b54-4a10-9415-a8845a767fb5";
const APPLY = process.argv.includes("--apply");
const DEFAULT_TECH_REQUESTER_LEGACY_ADMIN_ID =
  process.env.MIGRATION_TECNOLOGIA_DEFAULT_REQUESTER_LEGACY_ADMIN_ID ?? "1";
const PASSWORD_MISSING_BUSINESS_OBSERVATION =
  "Mantido em quarentena por decisao operacional: o setor de TI informou que os registros legados sem password nao sao necessarios no novo sistema.";
const RESET_BUSINESS_OBSERVATION =
  "Mantido em quarentena por decisao operacional: a funcionalidade de reset do legado nao sera migrada porque o fluxo no novo sistema Tecnologia e diferente.";
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.join(APPLY_ROOT, `giro-office-tecnologia-v1-apply-${TIMESTAMP}`);

const SOURCE_TABLES = [
  "tb_admin.usuarios",
  "tb_admin.departamentos",
  "tb_rh.colaboradores",
  "tb_tecnologia.atualizacoes",
  "tb_tecnologia.atualizacoes_previsao",
  "tb_tecnologia.estoque",
  "tb_tecnologia.estoque_entradas",
  "tb_tecnologia.estoque_saidas",
  "tb_tecnologia.inventario",
  "tb_tecnologia.inventario_fotos",
  "tb_tecnologia.inventario_itens",
  "tb_tecnologia.inventario_loc",
  "tb_tecnologia.opcoes",
  "tb_tecnologia.reset",
  "tb_tecnologia.robos",
  "tb_tecnologia.robos_controles",
  "tb_tecnologia.senhas",
  "tb_tecnologia.termos",
];

const DELETE_ORDER = [
  "tecnologia.robot_runs",
  "tecnologia.robots",
  "tecnologia.request_messages",
  "tecnologia.requests",
  "tecnologia.request_categories",
  "tecnologia.passwords_users",
  "tecnologia.inventory",
  "tecnologia.inventoryCategories",
  "tecnologia.inventoryLocations",
  "tecnologia.terms",
  "tecnologia.extensions",
  "stock.exits",
  "stock.entries",
  "stock",
  "stock.categories",
  "stock.locations",
];

const INSERT_ORDER = [
  "stock.locations",
  "stock.categories",
  "stock",
  "stock.entries",
  "stock.exits",
  "tecnologia.inventoryCategories",
  "tecnologia.inventoryLocations",
  "tecnologia.inventory",
  "tecnologia.terms",
  "tecnologia.request_categories",
  "tecnologia.requests",
  "tecnologia.request_messages",
  "tecnologia.passwords_users",
  "tecnologia.robots",
  "tecnologia.robot_runs",
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
loadEnvFile(path.join(ROOT, "services", "ti-service", ".env"));

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

function requiredLegacyDate(value) {
  return nullableLegacyDate(value) ?? "1970-01-01T00:00:00";
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

function redactRow(row) {
  return Object.fromEntries(
    Object.entries(row ?? {}).map(([key, value]) => [
      key,
      /pass|senha|password/i.test(key) && value ? "<redacted>" : value,
    ]),
  );
}

function addQuarantine(
  quarantine,
  legacyTable,
  row,
  reason,
  targetTable = null,
  field = null,
  observation = null,
) {
  quarantine.push({
    legacy_table: legacyTable,
    legacy_id: String(row?.id ?? ""),
    target_table: targetTable,
    field,
    reason,
    observation,
    row: redactRow(row),
  });
}

function uniqueIndex(rows, keyFn) {
  const values = new Map();
  const duplicates = new Set();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (values.has(key)) {
      duplicates.add(key);
      continue;
    }
    values.set(key, row);
  }
  for (const key of duplicates) values.delete(key);
  return values;
}

function firstExistingId(candidates, ids) {
  return candidates.find((id) => id && ids.has(id)) ?? null;
}

function buildLegacyUserResolver(rows, current) {
  const collaboratorsByAdminId = new Map();
  const collaboratorById = new Map();
  for (const collaborator of rows["tb_rh.colaboradores"]) {
    collaboratorById.set(String(collaborator.id), collaborator);
    if (collaborator.user_id) {
      collaboratorsByAdminId.set(String(collaborator.user_id), collaborator);
    }
  }

  const byLogin = uniqueIndex(current.users, (row) => normalizeNatural(row.login));
  const byCpf = uniqueIndex(current.users, (row) => normalizeDocument(row.cpf));
  const byRg = uniqueIndex(current.users, (row) => normalizeDocument(row.rg));
  const byEmail = uniqueIndex(current.users, (row) => normalizeNatural(row.email));
  const byName = uniqueIndex(current.users, (row) => normalizeNatural(row.name));
  const cache = new Map();

  const resolveFromProfile = (profile) =>
    firstExistingId([profile.generatedAdminId, profile.generatedCollaboratorId], current.userIds) ??
    byLogin.get(normalizeNatural(profile.login))?.id ??
    byCpf.get(normalizeDocument(profile.cpf))?.id ??
    byRg.get(normalizeDocument(profile.rg))?.id ??
    byEmail.get(normalizeNatural(profile.email))?.id ??
    byName.get(normalizeNatural(profile.name))?.id ??
    null;

  const adminProfiles = new Map();
  for (const user of rows["tb_admin.usuarios"]) {
    const collaborator = collaboratorsByAdminId.get(String(user.id));
    adminProfiles.set(String(user.id), {
      generatedAdminId: generatedId("user:tb_admin.usuarios", user.id),
      generatedCollaboratorId: collaborator
        ? generatedId("user:tb_rh.colaboradores", collaborator.id)
        : null,
      login: user.user,
      cpf: collaborator?.cpf,
      rg: collaborator?.rg,
      email: collaborator?.email,
      name: collaborator?.nome ?? user.nome,
    });
  }

  return {
    resolveAdminUser(legacyId) {
      const key = cleanText(legacyId);
      if (!key || Number(key) === 0) return null;
      if (cache.has(`admin:${key}`)) return cache.get(`admin:${key}`);
      const profile = adminProfiles.get(String(key));
      const id = profile ? resolveFromProfile(profile) : null;
      cache.set(`admin:${key}`, id);
      return id;
    },
    resolveCollaborator(legacyId) {
      const key = cleanText(legacyId);
      if (!key || Number(key) === 0) return null;
      if (cache.has(`collaborator:${key}`)) return cache.get(`collaborator:${key}`);
      const collaborator = collaboratorById.get(String(key));
      const adminId = collaborator?.user_id ? this.resolveAdminUser(collaborator.user_id) : null;
      const profileId =
        adminId ??
        resolveFromProfile({
          generatedAdminId: null,
          generatedCollaboratorId: generatedId("user:tb_rh.colaboradores", key),
          login: null,
          cpf: collaborator?.cpf,
          rg: collaborator?.rg,
          email: collaborator?.email,
          name: collaborator?.nome,
        });
      cache.set(`collaborator:${key}`, profileId);
      return profileId;
    },
  };
}

function buildNameMap(rows, table, scope, nameField = "nome") {
  const byName = new Map();
  const byLegacy = new Map();
  for (const row of rows) {
    const name = requiredText(row[nameField], `Legado ${row.id}`);
    const key = normalizeNatural(name);
    if (!byName.has(key)) {
      const id = generatedId(scope, key);
      byName.set(key, { id, name, source: row });
    }
    if (row.id !== undefined) byLegacy.set(String(row.id), byName.get(key));
  }
  return { byName, byLegacy, table };
}

function ensureName(map, name, scope) {
  const normalized = normalizeNatural(name);
  if (!normalized) return null;
  if (!map.byName.has(normalized)) {
    map.byName.set(normalized, { id: generatedId(scope, normalized), name: requiredText(name) });
  }
  return map.byName.get(normalized);
}

function note(parts) {
  return parts
    .filter((part) => part.value !== null && part.value !== undefined && cleanText(part.value))
    .map((part) => `${part.label}: ${cleanText(part.value)}`)
    .join("\n");
}

function mapUrgency(value) {
  const text = normalizeNatural(value);
  if (text.includes("crit") || text.includes("urgent")) return "Critical";
  if (text.includes("alta") || text.includes("high")) return "High";
  if (text.includes("baixa") || text.includes("low")) return "Low";
  return "Medium";
}

function mapRequestStatus(row) {
  const text = normalizeNatural(row.status);
  if (text.includes("final") || text.includes("resol")) return "Resolved";
  if (text.includes("descontinu") || text.includes("cancel") || text.includes("fech")) {
    return "Closed";
  }
  if (text.includes("aguard") || text.includes("esper")) return "Waiting";
  if (text.includes("andamento") || text.includes("pend") || row.responsavel_um) {
    return "In_Progress";
  }
  return "New";
}

function mapRobotType(row) {
  const text = normalizeNatural(`${row.nome ?? ""} ${row.descricao ?? ""}`);
  if (text.includes("backup")) return "Backup";
  if (text.includes("relatorio") || text.includes("report")) return "Relatorio";
  if (text.includes("integr")) return "Integracao";
  if (text.includes("monitor")) return "Monitoramento";
  return "Manutencao";
}

function mapRobotStatus(value) {
  const text = normalizeNatural(value);
  if (text.includes("inativ") || text.includes("desativ")) return "inactive";
  if (text.includes("falh") || text.includes("erro")) return "failed";
  if (text.includes("rod") || text.includes("exec")) return "running";
  return "active";
}

function mapRobotRunStatus(value) {
  const text = normalizeNatural(value);
  if (text.includes("execut") || text.includes("sucesso")) return "success";
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("falh") || text.includes("erro")) return "failed";
  return "running";
}

function boolStatus(value) {
  const text = normalizeNatural(value);
  if (["0", "false", "inativo", "desativado", "cancelado"].includes(text)) return false;
  return true;
}

function encryptPassword(value) {
  const key = Buffer.from(process.env.MTK_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("MTK_ENCRYPTION_KEY invalida para criptografar senhas de TI.");
  }
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(String(value), "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted}`;
}

function buildTechnologyLoad(rows, current) {
  const load = Object.fromEntries(INSERT_ORDER.map((table) => [table, []]));
  const quarantine = [];
  const userResolver = buildLegacyUserResolver(rows, current);
  const defaultTechRequesterId = userResolver.resolveAdminUser(
    DEFAULT_TECH_REQUESTER_LEGACY_ADMIN_ID,
  );
  if (!defaultTechRequesterId) {
    throw new Error(
      `Usuario tecnico padrao nao encontrado para legacy admin id ${DEFAULT_TECH_REQUESTER_LEGACY_ADMIN_ID}.`,
    );
  }
  const departmentByName = uniqueIndex(current.departments, (row) => normalizeNatural(row.name));

  const inventoryCategoryMap = buildNameMap(
    rows["tb_tecnologia.opcoes"].filter((row) => Number(row.tipo) === 0),
    "tb_tecnologia.opcoes",
    "tecnologia.inventoryCategories",
    "categoria",
  );
  for (const row of rows["tb_tecnologia.inventario"]) {
    ensureName(inventoryCategoryMap, row.tipo, "tecnologia.inventoryCategories");
  }
  for (const row of rows["tb_tecnologia.inventario_itens"]) {
    ensureName(inventoryCategoryMap, row.tipo, "tecnologia.inventoryCategories");
  }
  const uncategorizedInventory = ensureName(
    inventoryCategoryMap,
    "Sem categoria legado",
    "tecnologia.inventoryCategories",
  );

  const inventoryLocationMap = buildNameMap(
    rows["tb_tecnologia.inventario_loc"],
    "tb_tecnologia.inventario_loc",
    "tecnologia.inventoryLocations",
    "nome",
  );

  load["tecnologia.inventoryCategories"] = [...inventoryCategoryMap.byName.values()].map((row) => ({
    id: row.id,
    name: row.name,
    tag: null,
    active: true,
    organization_id: ORGANIZATION_ID,
  }));
  load["tecnologia.inventoryLocations"] = [...inventoryLocationMap.byName.values()].map((row) => ({
    id: row.id,
    name: row.name,
    active: true,
    organization_id: ORGANIZATION_ID,
  }));

  const photosByInventoryId = new Map();
  for (const photo of rows["tb_tecnologia.inventario_fotos"]) {
    const key = String(photo.id_inventario ?? "");
    const values = photosByInventoryId.get(key) ?? [];
    values.push(cleanText(photo.foto));
    photosByInventoryId.set(key, values.filter(Boolean));
  }

  const assetCodes = new Set();
  const uniqueAssetCode = (base, scope, legacyId) => {
    const normalized = requiredText(base, `${scope}-${legacyId}`).slice(0, 180);
    let candidate = normalized;
    let index = 2;
    while (assetCodes.has(candidate)) {
      candidate = `${normalized}-${index}`;
      index += 1;
    }
    assetCodes.add(candidate);
    return candidate;
  };

  for (const row of rows["tb_tecnologia.inventario"]) {
    const category =
      ensureName(inventoryCategoryMap, row.tipo, "tecnologia.inventoryCategories") ??
      uncategorizedInventory;
    const userId = userResolver.resolveAdminUser(row.usuario_id);
    const staffId = userResolver.resolveAdminUser(row.ti_responsavel);
    if (row.usuario_id && !userId) {
      addQuarantine(
        quarantine,
        "tb_tecnologia.inventario",
        row,
        "usuario_id sem correspondencia; ativo migrado sem usuario vinculado",
        "tecnologia.inventory",
        "user_id",
      );
    }
    load["tecnologia.inventory"].push({
      id: generatedId("tecnologia.inventory:tb_tecnologia.inventario", row.id),
      user_id: userId,
      location_id: null,
      category_id: category.id,
      asset_code: uniqueAssetCode(row.cod, "INV", row.id),
      notes: note([
        { label: "Origem", value: "tb_tecnologia.inventario" },
        { label: "ID legado", value: row.id },
        { label: "Observacao", value: row.obs },
        { label: "Termo legado", value: row.termo },
        {
          label: "Fotos legadas",
          value: (photosByInventoryId.get(String(row.id)) ?? []).join(", "),
        },
      ]),
      delivery_date: nullableLegacyDate(row.data_entrega),
      return_date: nullableLegacyDate(row.data_devolucao),
      responsible_it_staff_id: staffId,
      created_at: nullableLegacyDate(row.data_registro) ?? requiredLegacyDate(row.data_entrega),
      updated_at: nullableLegacyDate(row.data_registro) ?? requiredLegacyDate(row.data_entrega),
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_tecnologia.inventario_itens"]) {
    const category =
      ensureName(inventoryCategoryMap, row.tipo, "tecnologia.inventoryCategories") ??
      uncategorizedInventory;
    const location = inventoryLocationMap.byLegacy.get(String(row.local_id));
    const staffId = userResolver.resolveAdminUser(row.id_responsavel);
    load["tecnologia.inventory"].push({
      id: generatedId("tecnologia.inventory:tb_tecnologia.inventario_itens", row.id),
      user_id: null,
      location_id: location?.id ?? null,
      category_id: category.id,
      asset_code: uniqueAssetCode(row.cod, "INVITEM", row.id),
      notes: note([
        { label: "Origem", value: "tb_tecnologia.inventario_itens" },
        { label: "ID legado", value: row.id },
        { label: "Observacao", value: row.obs },
      ]),
      delivery_date: nullableLegacyDate(row.data_entrega),
      return_date: null,
      responsible_it_staff_id: staffId,
      created_at: nullableLegacyDate(row.data_registro) ?? "1970-01-01T00:00:00",
      updated_at: nullableLegacyDate(row.data_registro) ?? "1970-01-01T00:00:00",
      organization_id: ORGANIZATION_ID,
    });
  }

  const stockCategoryMap = buildNameMap(
    rows["tb_tecnologia.estoque"],
    "tb_tecnologia.estoque",
    "stock.categories",
    "categoria",
  );
  const stockLocationMap = buildNameMap(
    rows["tb_tecnologia.estoque"],
    "tb_tecnologia.estoque",
    "stock.locations",
    "localizacao",
  );
  const defaultStockCategory = ensureName(
    stockCategoryMap,
    "Sem categoria legado",
    "stock.categories",
  );
  const defaultStockLocation = ensureName(stockLocationMap, "Sem local legado", "stock.locations");

  load["stock.categories"] = [...stockCategoryMap.byName.values()].map((row) => ({
    id: row.id,
    name: row.name,
    department_id: current.technologyDepartmentId,
    status: true,
    organization_id: ORGANIZATION_ID,
  }));
  load["stock.locations"] = [...stockLocationMap.byName.values()].map((row) => ({
    id: row.id,
    name: row.name,
    floor: null,
    department_id: current.technologyDepartmentId,
    status: true,
    organization_id: ORGANIZATION_ID,
  }));

  const stockByLegacy = new Map();
  for (const row of rows["tb_tecnologia.estoque"]) {
    const category =
      ensureName(stockCategoryMap, row.categoria, "stock.categories") ?? defaultStockCategory;
    const location =
      ensureName(stockLocationMap, row.localizacao, "stock.locations") ?? defaultStockLocation;
    const id = generatedId("stock:tb_tecnologia.estoque", row.id);
    stockByLegacy.set(String(row.id), id);
    load.stock.push({
      id,
      department_id: current.technologyDepartmentId,
      name: requiredText(row.descricao, requiredText(row.categoria, `Item legado ${row.id}`)),
      category_id: category.id,
      location_id: location.id,
      quantity: Math.max(0, Number(row.quantidade ?? 0)),
      description: note([
        { label: "Origem", value: "tb_tecnologia.estoque" },
        { label: "ID legado", value: row.id },
        { label: "Descricao", value: row.descricao },
        { label: "Status legado", value: row.status },
      ]),
      status: boolStatus(row.status),
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_tecnologia.estoque_entradas"]) {
    const stockId = stockByLegacy.get(String(row.produto_id));
    const userId = userResolver.resolveAdminUser(row.repositor);
    if (!stockId || !userId || Number(row.quantidade ?? 0) <= 0) {
      addQuarantine(
        quarantine,
        "tb_tecnologia.estoque_entradas",
        row,
        !stockId
          ? "produto_id sem item de estoque migrado"
          : !userId
            ? "repositor sem correspondencia de usuario"
            : "quantidade invalida",
        "stock.entries",
      );
      continue;
    }
    load["stock.entries"].push({
      id: generatedId("stock.entries:tb_tecnologia.estoque_entradas", row.id),
      stock_id: stockId,
      quantity: Number(row.quantidade),
      entry_date: requiredLegacyDate(row.data_entrada),
      entry_by_user_id: userId,
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_tecnologia.estoque_saidas"]) {
    const stockId = stockByLegacy.get(String(row.produto_id));
    const requesterId =
      userResolver.resolveAdminUser(row.solicitante) ??
      userResolver.resolveCollaborator(row.solicitante);
    const approverId = userResolver.resolveAdminUser(row.autorizador);
    const operatorId = userResolver.resolveAdminUser(row.operador);
    if (!stockId || !requesterId || Number(row.quantidade ?? 0) <= 0) {
      addQuarantine(
        quarantine,
        "tb_tecnologia.estoque_saidas",
        row,
        !stockId
          ? "produto_id sem item de estoque migrado"
          : !requesterId
            ? "solicitante sem correspondencia de usuario"
            : "quantidade invalida",
        "stock.exits",
      );
      continue;
    }
    load["stock.exits"].push({
      id: generatedId("stock.exits:tb_tecnologia.estoque_saidas", row.id),
      stock_id: stockId,
      quantity: Number(row.quantidade),
      destination: cleanText(row.destino),
      exit_date: requiredLegacyDate(row.data_saida),
      requester_id: requesterId,
      approver_id: approverId,
      operator_id: operatorId,
      location_destination_id: null,
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_tecnologia.termos"]) {
    const userId = userResolver.resolveAdminUser(row.user_id);
    const departmentId = departmentByName.get(normalizeNatural(row.departamento))?.id ?? null;
    load["tecnologia.terms"].push({
      id: generatedId("tecnologia.terms:tb_tecnologia.termos", row.id),
      user_id: userId,
      date: requiredLegacyDate(row.data),
      user_name: requiredText(row.nome, "Usuario legado"),
      user_cpf: requiredText(row.cpf, "-"),
      department_id: departmentId,
      address: cleanText(row.endereco),
      reason: cleanText(row.motivo),
      equipament_list: cleanText(row.equipamentos),
      brand: cleanText(row.marca),
      asset_code: cleanText(row.codigo),
      imei: cleanText(row.imei),
      organization_id: ORGANIZATION_ID,
    });
  }

  const requestCategoryMap = buildNameMap(
    rows["tb_tecnologia.atualizacoes"],
    "tb_tecnologia.atualizacoes",
    "tecnologia.request_categories",
    "tipo",
  );
  const defaultRequestCategory = ensureName(
    requestCategoryMap,
    "Atualizacoes legadas",
    "tecnologia.request_categories",
  );
  load["tecnologia.request_categories"] = [...requestCategoryMap.byName.values()].map((row) => ({
    id: row.id,
    name: row.name,
    active: true,
    organization_id: ORGANIZATION_ID,
  }));

  const requestsByLegacy = new Map();
  for (const row of rows["tb_tecnologia.atualizacoes"]) {
    const legacyRequester = cleanText(row.solicitante);
    const requesterId = legacyRequester
      ? userResolver.resolveAdminUser(row.solicitante)
      : defaultTechRequesterId;
    const usedDefaultRequester = !legacyRequester;
    if (!requesterId) {
      addQuarantine(
        quarantine,
        "tb_tecnologia.atualizacoes",
        row,
        "solicitante sem correspondencia de usuario",
        "tecnologia.requests",
        "requester_id",
      );
      continue;
    }
    const assignedToId =
      userResolver.resolveAdminUser(row.responsavel_um) ??
      userResolver.resolveAdminUser(row.responsavel_dois) ??
      userResolver.resolveAdminUser(row.responsavel_tres);
    const category =
      ensureName(requestCategoryMap, row.tipo, "tecnologia.request_categories") ??
      defaultRequestCategory;
    const id = generatedId("tecnologia.requests:tb_tecnologia.atualizacoes", row.id);
    requestsByLegacy.set(String(row.id), { id, requesterId });
    load["tecnologia.requests"].push({
      id,
      title: requiredText(row.nome, `Atualizacao legada ${row.id}`),
      description:
        note([
          { label: "Origem", value: "tb_tecnologia.atualizacoes" },
          { label: "ID legado", value: row.id },
          { label: "Modulo 1", value: row.modulo_um },
          { label: "Modulo 2", value: row.modulo_dois },
          { label: "Status legado", value: row.status },
          {
            label: "Solicitante legado",
            value: usedDefaultRequester
              ? `ausente; requester_id atribuido ao usuario tecnico padrao legado ${DEFAULT_TECH_REQUESTER_LEGACY_ADMIN_ID}`
              : row.solicitante,
          },
          { label: "Observacao", value: row.obs },
          { label: "Responsavel 1 legado", value: row.responsavel_um },
          { label: "Responsavel 2 legado", value: row.responsavel_dois },
          { label: "Responsavel 3 legado", value: row.responsavel_tres },
        ]) || "-",
      requester_id: requesterId,
      category_id: category.id,
      assigned_to_id: assignedToId,
      urgency: mapUrgency(row.urgencia),
      status: mapRequestStatus(row),
      attachment: null,
      created_at: requiredLegacyDate(row.solicitacao),
      updated_at:
        nullableLegacyDate(row.finalizacao) ??
        nullableLegacyDate(row.solicitacao) ??
        "1970-01-01T00:00:00",
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_tecnologia.atualizacoes_previsao"]) {
    const request = requestsByLegacy.get(String(row.id_tarefa));
    if (!request) {
      addQuarantine(
        quarantine,
        "tb_tecnologia.atualizacoes_previsao",
        row,
        "id_tarefa sem chamado migrado",
        "tecnologia.request_messages",
      );
      continue;
    }
    load["tecnologia.request_messages"].push({
      id: generatedId("tecnologia.request_messages:tb_tecnologia.atualizacoes_previsao", row.id),
      request_id: request.id,
      sender_id: request.requesterId,
      message:
        note([
          { label: "Previsao/status legado", value: row.status },
          { label: "Data prevista", value: row.data },
          { label: "Registro", value: row.registro },
        ]) || "Registro legado de previsao",
      attachment: null,
      type: "Message",
      created_at:
        nullableLegacyDate(row.data_atualizacao) ??
        nullableLegacyDate(row.data) ??
        "1970-01-01T00:00:00",
      organization_id: ORGANIZATION_ID,
    });
  }

  const canEncryptPasswords =
    Buffer.from(process.env.MTK_ENCRYPTION_KEY ?? "", "base64").length === 32;
  for (const row of rows["tb_tecnologia.senhas"]) {
    const userId = userResolver.resolveAdminUser(row.id_usuario);
    if (!canEncryptPasswords || !userId || !cleanText(row.password)) {
      addQuarantine(
        quarantine,
        "tb_tecnologia.senhas",
        row,
        !canEncryptPasswords
          ? "MTK_ENCRYPTION_KEY ausente ou invalida"
          : !userId
            ? "id_usuario sem correspondencia de usuario"
            : "password ausente; nao migrar por decisao do setor de TI",
        "tecnologia.passwords_users",
        null,
        !canEncryptPasswords || !userId ? null : PASSWORD_MISSING_BUSINESS_OBSERVATION,
      );
      continue;
    }
    load["tecnologia.passwords_users"].push({
      id: generatedId("tecnologia.passwords_users:tb_tecnologia.senhas", row.id),
      local: requiredText(row.local, requiredText(row.item, `Senha legada ${row.id}`)),
      user_id: userId,
      password: encryptPassword(row.password),
      notes: note([
        { label: "Origem", value: "tb_tecnologia.senhas" },
        { label: "ID legado", value: row.id },
        { label: "Usuario/login legado", value: row.user },
        { label: "Item", value: row.item },
        { label: "Tipo", value: row.tipo },
        { label: "Observacao", value: row.obs },
      ]),
      createdAt: "1970-01-01T00:00:00",
      updatedAt: "1970-01-01T00:00:00",
      organization_id: ORGANIZATION_ID,
    });
  }

  const robotsByLegacy = new Map();
  for (const row of rows["tb_tecnologia.robos"]) {
    const id = generatedId("tecnologia.robots:tb_tecnologia.robos", row.id);
    robotsByLegacy.set(String(row.id), id);
    load["tecnologia.robots"].push({
      id,
      name: requiredText(row.nome, `Robo legado ${row.id}`),
      description: note([
        { label: "Descricao", value: row.descricao },
        { label: "Departamento legado", value: row.departamento_id },
        { label: "Responsavel legado", value: row.responsavel_id },
      ]),
      type: mapRobotType(row),
      schedule: cleanText(row.padrao),
      status: mapRobotStatus(row.status),
      active: !normalizeNatural(row.status).includes("inativ"),
      created_at: "1970-01-01T00:00:00",
      updated_at: "1970-01-01T00:00:00",
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_tecnologia.robos_controles"]) {
    const robotId = robotsByLegacy.get(String(row.robo_id));
    if (!robotId) {
      addQuarantine(
        quarantine,
        "tb_tecnologia.robos_controles",
        row,
        "robo_id sem robo migrado",
        "tecnologia.robot_runs",
      );
      continue;
    }
    load["tecnologia.robot_runs"].push({
      id: generatedId("tecnologia.robot_runs:tb_tecnologia.robos_controles", row.id),
      robot_id: robotId,
      status: mapRobotRunStatus(row.status),
      started_at: requiredLegacyDate(row.data),
      finished_at: normalizeNatural(row.status).includes("execut")
        ? requiredLegacyDate(row.data)
        : null,
      message: cleanText(row.status),
      metadata_json: {
        legacy_table: "tb_tecnologia.robos_controles",
        legacy_id: row.id,
        legacy_date: row.data,
      },
      organization_id: ORGANIZATION_ID,
    });
  }

  for (const row of rows["tb_tecnologia.reset"]) {
    addQuarantine(
      quarantine,
      "tb_tecnologia.reset",
      row,
      "nao migrar por decisao operacional; fluxo de reset mudou no novo sistema",
      null,
      null,
      RESET_BUSINESS_OBSERVATION,
    );
  }

  return { load, quarantine };
}

async function currentContext(client) {
  const users = (
    await client.query(
      "select id, name, login, cpf, rg, email from users where organization_id = $1",
      [ORGANIZATION_ID],
    )
  ).rows;
  const departments = (
    await client.query("select id, name from departments where organization_id = $1", [
      ORGANIZATION_ID,
    ])
  ).rows;
  const technologyDepartment = departments.find(
    (department) => normalizeNatural(department.name) === "tecnologia",
  );
  if (!technologyDepartment) throw new Error("Departamento Tecnologia nao encontrado no tenant.");

  return {
    users,
    departments,
    userIds: new Set(users.map((row) => row.id)),
    technologyDepartmentId: technologyDepartment.id,
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
  for (const table of DELETE_ORDER) {
    const result = await client.query(
      `delete from ${quoteIdent(table)} where organization_id = $1`,
      [ORGANIZATION_ID],
    );
    deleted[table] = result.rowCount;
  }
  return deleted;
}

function placeholder(column, index, value) {
  if (column === "metadata_json" || Array.isArray(value) || (value && typeof value === "object")) {
    return `$${index}::jsonb`;
  }
  return `$${index}`;
}

async function insertRows(client, table, rows) {
  let inserted = 0;
  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map((column) => {
      const value = row[column];
      if (Array.isArray(value) || (value && typeof value === "object"))
        return JSON.stringify(value);
      return value;
    });
    await client.query(
      `insert into ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) values (${columns
        .map((column, index) => placeholder(column, index + 1, row[column]))
        .join(", ")})`,
      values,
    );
    inserted += 1;
  }
  return inserted;
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
    const beforeCounts = await countTables(client, DELETE_ORDER);
    const { load, quarantine } = buildTechnologyLoad(rows, current);
    const expected = Object.fromEntries(INSERT_ORDER.map((table) => [table, load[table].length]));

    writeJson("reports/plan.json", {
      organization_id: ORGANIZATION_ID,
      sourceDir: SOURCE_DIR,
      outDir: OUT_DIR,
      sourceRows: Object.fromEntries(
        Object.entries(rows).map(([table, value]) => [table, value.length]),
      ),
      current: {
        users: current.users.length,
        departments: current.departments.length,
        technologyDepartmentId: current.technologyDepartmentId,
      },
      beforeCounts,
      plannedInsertRows: expected,
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
      const finalCounts = await validateFinalCounts(client, expected);
      await client.query("commit");
      writeJson("reports/result.json", {
        organization_id: ORGANIZATION_ID,
        sourceDir: SOURCE_DIR,
        outDir: OUT_DIR,
        deleted,
        inserted,
        finalCounts,
        quarantineRows: quarantine.length,
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            outDir: OUT_DIR,
            inserted,
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
