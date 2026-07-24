import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OLD_DUMP_DIR = "/home/bruno/Documents/06.07.2026";
const NEW_DUMP_DIR = "/home/bruno/Documents/10.07.2026";
const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const FALLBACK_USER_ID = "d1912dfe-df13-517a-be69-ce2be72bbca8";
const FALLBACK_DEPARTMENT_ID = "d0aa5033-39b2-56a5-a875-9a8a95b26f7f";
const FALLBACK_PROJECT_STATUS = "Migrado";
const FALLBACK_CLIENT_STATUS = "Inativo";
const GENERATED_NAMESPACE = "3f68d246-0b54-4a10-9415-a8845a767fb5";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

function loadPg() {
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
    if (!pgPackage) {
      throw new Error("Pacote pg nao encontrado em node_modules.");
    }
    return require(path.join(pnpmDir, pgPackage, "node_modules", "pg"));
  }
}

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of [".env", "infra/.env", "services/src/.env"]) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    const line = fs
      .readFileSync(fullPath, "utf8")
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().startsWith("DATABASE_URL="));
    if (!line) continue;
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  throw new Error("DATABASE_URL nao encontrada no ambiente nem nos .env locais.");
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
  if (value == null) return null;
  const trimmed = String(value).replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredText(value, fallback = "-") {
  return cleanText(value) ?? fallback;
}

function normalizeKey(value) {
  return requiredText(value, "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function digits(value) {
  return requiredText(value, "").replace(/\D/g, "");
}

function nullableLegacyDate(value) {
  const text = cleanText(value);
  if (!text || text.startsWith("0000-00-00")) return null;
  return text;
}

function parseScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === "NULL") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseValues(valuesSql) {
  const rows = [];
  let row = null;
  let field = "";
  let inString = false;
  let escaping = false;

  const pushField = () => {
    row.push(parseScalar(field));
    field = "";
  };

  for (let i = 0; i < valuesSql.length; i += 1) {
    const char = valuesSql[i];

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
      field = "";
      continue;
    }
    if (char === "," && row !== null) {
      pushField();
      continue;
    }
    if (char === ")" && row !== null) {
      pushField();
      rows.push(row);
      row = null;
      continue;
    }
    if (row !== null) {
      field += char;
    }
  }

  return rows;
}

function parseMysqlDump(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const rows = [];
  let offset = 0;
  while (offset < sql.length) {
    const start = sql.indexOf("INSERT INTO `", offset);
    if (start === -1) break;

    let end = start;
    let inString = false;
    let escaping = false;
    for (; end < sql.length; end += 1) {
      const char = sql[end];
      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === "'") {
          inString = false;
        }
      } else if (char === "'") {
        inString = true;
      } else if (char === ";") {
        break;
      }
    }

    const statement = sql.slice(start, end);
    offset = end + 1;
    const valuesIndex = statement.indexOf(" VALUES");
    if (valuesIndex === -1) continue;
    const header = statement.slice(0, valuesIndex);
    const openColumns = header.indexOf("(");
    const closeColumns = header.lastIndexOf(")");
    if (openColumns === -1 || closeColumns === -1) continue;
    const columns = header
      .slice(openColumns + 1, closeColumns)
      .split(",")
      .map((column) => column.trim().replaceAll("`", ""));
    const valuesSql = statement.slice(valuesIndex + " VALUES".length);

    for (const values of parseValues(valuesSql)) {
      const row = {};
      columns.forEach((column, index) => {
        row[column] = values[index];
      });
      rows.push(row);
    }
  }
  return rows;
}

function loadDumpSet(dir) {
  return {
    clients: parseMysqlDump(path.join(dir, "tb_integracao.clientes.sql")),
    projects: parseMysqlDump(path.join(dir, "tb_integracao.prospeccao_comercial.sql")),
    tasks: parseMysqlDump(path.join(dir, "tb_integracao.tarefas.sql")),
  };
}

function mapById(rows) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

function clientSourceKey(row) {
  return [
    normalizeKey(row.nome),
    normalizeKey(row.nome_fantasia),
    digits(row.cpf_cnpj),
    normalizeKey(row.email),
  ].join("|");
}

function projectSourceKey(row, clientId) {
  return [
    clientId,
    normalizeKey(row.servico),
    normalizeKey(row.solucao),
    normalizeKey(row.situacao),
    String(Number(row.porcentagem) || 0),
    nullableLegacyDate(row.data_cadastro) ?? "",
  ].join("|");
}

function currentClientKey(row) {
  return [
    normalizeKey(row.name),
    normalizeKey(row.fantasy_name),
    digits(row.cpf_cnpj),
    normalizeKey(row.email),
  ].join("|");
}

function currentProjectKey(row, clientId = row.client_id) {
  return [
    clientId,
    normalizeKey(row.name),
    normalizeKey(row.objective),
    normalizeKey(row.status),
    String(Number(row.porcentage) || 0),
    row.start_date ? String(row.start_date).slice(0, 19).replace("T", " ") : "",
  ].join("|");
}

function indexOnlyUnique(rows, keyFn) {
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

function clientPayload(row, id) {
  const type = normalizeKey(row.tipo).includes("fis") ? "PF" : "PJ";
  const cpfCnpj = digits(row.cpf_cnpj);
  return {
    id,
    dominio_code: null,
    name: requiredText(row.nome),
    company_name: requiredText(row.nome),
    fantasy_name: cleanText(row.nome_fantasia),
    cnae: null,
    responsible: cleanText(row.socioAdm),
    cpf_responsible: cleanText(row.cpf_socio),
    agent: cleanText(row.preposto),
    cpf_agent: cleanText(row.cpf_preposto),
    number: cleanText(row.contato),
    email: cleanText(row.email),
    address: cleanText(row.endereco),
    cep: cleanText(row.cep),
    neighborhood: cleanText(row.bairro),
    state: cleanText(row.estado),
    city: cleanText(row.cidade),
    customer_since: nullableLegacyDate(row.inicio_contrato),
    municipal_registration: null,
    state_registration: null,
    commercial_board_registration: null,
    status: Number(row.tipo_cliente) === 1 ? "Ativo" : FALLBACK_CLIENT_STATUS,
    competence_entry: null,
    competence_output: null,
    opening_date: nullableLegacyDate(row.dataAbertura),
    instagram: cleanText(row.instagram),
    indication: cleanText(row.indicacao),
    regime: null,
    size: cleanText(row.complexidade),
    segment: null,
    start_strike: null,
    end_strike: null,
    deletion_date: null,
    contract: null,
    prospecting_status: "Migrado do legado",
    date_status: null,
    description_prospecting: null,
    participants_meet: null,
    meet_type: null,
    closing_date: null,
    register_date_prospecting: "1970-01-01 00:00:00",
    contabil: null,
    fiscal: null,
    pessoal: null,
    infoproduto: null,
    consultoria: null,
    castelo_med: null,
    cnae_secondary: null,
    service_unique: null,
    cpf_cnpj: cpfCnpj,
    type,
    type_registration: "Migrado",
    organization_id: ORGANIZATION_ID,
  };
}

function legacyProjectName(row) {
  return requiredText(row.servico, `Projeto legado ${row.id}`);
}

function projectPayload(row, id, clientId) {
  return {
    id,
    name: legacyProjectName(row),
    client_id: clientId,
    status: requiredText(row.situacao, FALLBACK_PROJECT_STATUS),
    start_date: nullableLegacyDate(row.data_cadastro),
    end_date: nullableLegacyDate(row.data_fechamento),
    objective: requiredText(row.solucao),
    sponsor_id: null,
    porcentage: Number(row.porcentagem) || 0,
    organization_id: ORGANIZATION_ID,
  };
}

function taskPayload(row, id, maps) {
  const legacyDepartment = String(row.departamento_id ?? "0");
  const legacyResponsible = String(row.responsavel_id ?? "0");
  const departmentId = maps.departmentByLegacy.get(legacyDepartment) ?? FALLBACK_DEPARTMENT_ID;
  const responsibleId = maps.userByLegacy.get(legacyResponsible) ?? FALLBACK_USER_ID;
  const responsible2Id = maps.userByLegacy.get(String(row.responsavel_id_dois ?? "0")) ?? null;
  const responsible3Id = maps.userByLegacy.get(String(row.responsavel_id_tres ?? "0")) ?? null;
  const modelId =
    maps.modelByNameDepartment.get(`${normalizeKey(row.nome)}|${departmentId}`) ??
    maps.adHocModelByDepartment.get(departmentId) ??
    maps.adHocModelByDepartment.get(FALLBACK_DEPARTMENT_ID);
  const clientId = maps.clientByLegacy.get(String(row.cliente_id));
  const projectId = maps.projectByClient.get(clientId);

  return {
    id,
    model_id: modelId,
    project_id: projectId,
    client_id: clientId,
    name: requiredText(row.nome),
    status: requiredText(row.estado, "Migrado"),
    department_id: departmentId,
    observations: cleanText(row.obs),
    billing: String(row.cobranca ?? "0"),
    urgency: String(row.urgencia ?? "0"),
    responsible_id: responsibleId,
    responsible2_id: responsible2Id,
    responsible3_id: responsible3Id,
    start_date: null,
    prevision_date: nullableLegacyDate(row.data_previsao),
    end_date: nullableLegacyDate(row.data_resolucao),
    date_created: nullableLegacyDate(row.data_cadastro),
    date_updated: nullableLegacyDate(row.data_update),
    pending_approval: null,
    charge_comercial: null,
    charge_financeiro: null,
    billing_description: null,
    hiring_status: null,
    payment: null,
    justification: null,
    meeting: cleanText(row.reuniao),
    organization_id: ORGANIZATION_ID,
  };
}

function changedColumns(payload, current, columns) {
  return columns.filter((column) => {
    const next = payload[column] ?? null;
    const previous = current[column] ?? null;
    const previousText =
      previous instanceof Date ? previous.toISOString().slice(0, 19).replace("T", " ") : previous;
    return String(next ?? "") !== String(previousText ?? "");
  });
}

async function queryAll(client) {
  const clients = await client.query(
    "select *, ctid::text as _ctid from public.clients where organization_id = $1 order by ctid",
    [ORGANIZATION_ID],
  );
  const projects = await client.query(
    'select *, ctid::text as _ctid from public."integracao.projects" where organization_id = $1 order by ctid',
    [ORGANIZATION_ID],
  );
  const tasks = await client.query(
    'select *, ctid::text as _ctid from public."integracao.tasks" where organization_id = $1 order by ctid',
    [ORGANIZATION_ID],
  );
  const departments = await client.query(
    "select * from public.departments where organization_id = $1",
    [ORGANIZATION_ID],
  );
  const users = await client.query("select * from public.users where organization_id = $1", [
    ORGANIZATION_ID,
  ]);
  const taskModels = await client.query(
    'select * from public."integracao.tasksModel" where organization_id = $1',
    [ORGANIZATION_ID],
  );
  return {
    currentClients: clients.rows,
    currentProjects: projects.rows,
    currentTasks: tasks.rows,
    departments: departments.rows,
    users: users.rows,
    taskModels: taskModels.rows,
  };
}

function buildMappings(oldDump, current) {
  const clientByLegacy = new Map();
  const currentClientIndexes = [
    [indexOnlyUnique(current.currentClients, currentClientKey), clientSourceKey],
    [
      indexOnlyUnique(current.currentClients, (row) => {
        const document = digits(row.cpf_cnpj);
        return document ? `${normalizeKey(row.name)}|${document}` : null;
      }),
      (row) => {
        const document = digits(row.cpf_cnpj);
        return document ? `${normalizeKey(row.nome)}|${document}` : null;
      },
    ],
    [
      indexOnlyUnique(
        current.currentClients,
        (row) => `${normalizeKey(row.name)}|${normalizeKey(row.fantasy_name)}`,
      ),
      (row) => `${normalizeKey(row.nome)}|${normalizeKey(row.nome_fantasia)}`,
    ],
    [
      indexOnlyUnique(current.currentClients, (row) => normalizeKey(row.name)),
      (row) => normalizeKey(row.nome),
    ],
  ];
  for (const row of oldDump.clients) {
    const currentRow = firstMatch(row, currentClientIndexes);
    if (currentRow) clientByLegacy.set(String(row.id), currentRow.id);
  }
  for (let index = 0; index < oldDump.clients.length; index += 1) {
    const row = oldDump.clients[index];
    const currentRow = current.currentClients[index];
    if (!currentRow || clientByLegacy.has(String(row.id))) continue;
    if (normalizeKey(row.nome) === normalizeKey(currentRow.name)) {
      clientByLegacy.set(String(row.id), currentRow.id);
    }
  }

  const projectByLegacy = new Map();
  const projectByClient = new Map();
  const currentProjectIndexes = [
    [
      indexOnlyUnique(current.currentProjects, currentProjectKey),
      (row) => projectSourceKey(row, clientByLegacy.get(String(row.cliente_id))),
    ],
    [
      indexOnlyUnique(
        current.currentProjects,
        (row) =>
          `${row.client_id}|${normalizeKey(row.name)}|${normalizeKey(row.objective)}|${normalizeKey(row.status)}|${Number(row.porcentage) || 0}`,
      ),
      (row) => {
        const clientId = clientByLegacy.get(String(row.cliente_id));
        return clientId
          ? `${clientId}|${normalizeKey(legacyProjectName(row))}|${normalizeKey(row.solucao)}|${normalizeKey(row.situacao)}|${Number(row.porcentagem) || 0}`
          : null;
      },
    ],
    [
      indexOnlyUnique(
        current.currentProjects,
        (row) =>
          `${row.client_id}|${normalizeKey(row.name)}|${normalizeKey(row.objective)}|${normalizeKey(row.status)}`,
      ),
      (row) => {
        const clientId = clientByLegacy.get(String(row.cliente_id));
        return clientId
          ? `${clientId}|${normalizeKey(legacyProjectName(row))}|${normalizeKey(row.solucao)}|${normalizeKey(row.situacao)}`
          : null;
      },
    ],
  ];
  for (const row of oldDump.projects) {
    const clientId = clientByLegacy.get(String(row.cliente_id));
    if (!clientId) continue;
    const currentRow = firstMatch(row, currentProjectIndexes);
    if (currentRow) {
      projectByLegacy.set(String(row.id), currentRow.id);
      if (!projectByClient.has(clientId)) projectByClient.set(clientId, currentRow.id);
    }
  }
  for (let index = 0; index < oldDump.projects.length; index += 1) {
    const row = oldDump.projects[index];
    const currentRow = current.currentProjects[index];
    if (!currentRow || projectByLegacy.has(String(row.id))) continue;
    let clientId = clientByLegacy.get(String(row.cliente_id));
    if (!clientId) {
      clientId = currentRow.client_id;
      clientByLegacy.set(String(row.cliente_id), clientId);
    }
    projectByLegacy.set(String(row.id), currentRow.id);
    if (!projectByClient.has(clientId)) projectByClient.set(clientId, currentRow.id);
  }
  for (const project of current.currentProjects) {
    if (!projectByClient.has(project.client_id)) projectByClient.set(project.client_id, project.id);
  }

  const taskRowsById = new Map(current.currentTasks.map((row) => [row.id, row]));
  const departmentByLegacy = new Map();
  const userByLegacy = new Map();
  const taskByLegacy = new Map();
  const usedTaskIds = new Set();
  const currentTaskCandidates = new Map();

  for (const task of current.currentTasks) {
    const candidates =
      currentTaskCandidates.get(
        `${task.client_id}|${normalizeKey(task.name)}|${normalizeKey(task.status)}`,
      ) ?? [];
    candidates.push(task);
    currentTaskCandidates.set(
      `${task.client_id}|${normalizeKey(task.name)}|${normalizeKey(task.status)}`,
      candidates,
    );
  }

  const registerTaskMapping = (row, currentRow) => {
    usedTaskIds.add(currentRow.id);
    taskByLegacy.set(String(row.id), currentRow.id);
    if (row.departamento_id != null)
      departmentByLegacy.set(String(row.departamento_id), currentRow.department_id);
    if (row.responsavel_id && Number(row.responsavel_id) !== 0)
      userByLegacy.set(String(row.responsavel_id), currentRow.responsible_id);
    if (
      row.responsavel_id_dois &&
      Number(row.responsavel_id_dois) !== 0 &&
      currentRow.responsible2_id
    ) {
      userByLegacy.set(String(row.responsavel_id_dois), currentRow.responsible2_id);
    }
    if (
      row.responsavel_id_tres &&
      Number(row.responsavel_id_tres) !== 0 &&
      currentRow.responsible3_id
    ) {
      userByLegacy.set(String(row.responsavel_id_tres), currentRow.responsible3_id);
    }
  };

  for (let index = 0; index < oldDump.tasks.length; index += 1) {
    const row = oldDump.tasks[index];
    const currentRow = current.currentTasks[index];
    if (!currentRow) continue;
    let clientId = clientByLegacy.get(String(row.cliente_id));
    if (!clientId) {
      clientId = currentRow.client_id;
      clientByLegacy.set(String(row.cliente_id), clientId);
    }
    if (!projectByClient.has(clientId)) projectByClient.set(clientId, currentRow.project_id);
    registerTaskMapping(row, currentRow);
  }

  for (const row of oldDump.tasks) {
    if (taskByLegacy.has(String(row.id))) continue;
    const clientId = clientByLegacy.get(String(row.cliente_id));
    if (!clientId) continue;
    const key = `${clientId}|${normalizeKey(row.nome)}|${normalizeKey(row.estado)}`;
    const candidates = currentTaskCandidates.get(key) ?? [];
    const currentRow =
      candidates.find(
        (candidate) =>
          !usedTaskIds.has(candidate.id) &&
          String(candidate.billing) === String(row.cobranca ?? "0") &&
          String(candidate.urgency) === String(row.urgencia ?? "0"),
      ) ?? candidates.find((candidate) => !usedTaskIds.has(candidate.id));
    if (!currentRow) continue;
    registerTaskMapping(row, currentRow);
  }

  departmentByLegacy.set("0", FALLBACK_DEPARTMENT_ID);
  userByLegacy.set("0", FALLBACK_USER_ID);

  const adHocModelByDepartment = new Map();
  const modelByNameDepartment = new Map();
  for (const model of current.taskModels) {
    if (normalizeKey(model.name).startsWith("tarefa legada avulsa")) {
      adHocModelByDepartment.set(model.department_id, model.id);
    }
    modelByNameDepartment.set(`${normalizeKey(model.name)}|${model.department_id}`, model.id);
  }

  return {
    clientByLegacy,
    projectByLegacy,
    projectByClient,
    taskByLegacy,
    taskRowsById,
    departmentByLegacy,
    userByLegacy,
    adHocModelByDepartment,
    modelByNameDepartment,
  };
}

function buildPlan(oldDump, newDump, current, maps) {
  const oldClientsById = mapById(oldDump.clients);
  const newClientsById = mapById(newDump.clients);
  const oldProjectsById = mapById(oldDump.projects);
  const newProjectsById = mapById(newDump.projects);
  const oldTasksById = mapById(oldDump.tasks);
  const newTasksById = mapById(newDump.tasks);
  const currentClientsById = new Map(current.currentClients.map((row) => [row.id, row]));
  const currentProjectsById = new Map(current.currentProjects.map((row) => [row.id, row]));

  const plan = {
    clients: { insert: [], update: [], missingExistingMap: [] },
    projects: { insert: [], update: [], missingExistingMap: [], missingClient: [] },
    tasks: {
      insert: [],
      update: [],
      delete: [],
      missingExistingMap: [],
      missingClient: [],
      missingProject: [],
      missingModel: [],
    },
  };

  for (const [legacyId, row] of newClientsById.entries()) {
    const existingId = maps.clientByLegacy.get(legacyId);
    const id = existingId ?? generatedId("client:integracao", legacyId);
    const payload = clientPayload(row, id);
    if (!oldClientsById.has(legacyId)) {
      plan.clients.insert.push({ legacyId, payload });
      maps.clientByLegacy.set(legacyId, id);
      continue;
    }
    if (!existingId) {
      plan.clients.missingExistingMap.push(legacyId);
      continue;
    }
    const changed = changedColumns(payload, currentClientsById.get(existingId), [
      "name",
      "company_name",
      "fantasy_name",
      "responsible",
      "cpf_responsible",
      "agent",
      "cpf_agent",
      "number",
      "email",
      "address",
      "cep",
      "neighborhood",
      "state",
      "city",
      "status",
      "opening_date",
      "instagram",
      "indication",
      "size",
      "cpf_cnpj",
      "type",
    ]);
    if (changed.length > 0)
      plan.clients.update.push({ legacyId, id: existingId, payload, changed });
  }

  for (const [legacyId, row] of newProjectsById.entries()) {
    const clientId = maps.clientByLegacy.get(String(row.cliente_id));
    if (!clientId) {
      plan.projects.missingClient.push(legacyId);
      continue;
    }
    const existingId = maps.projectByLegacy.get(legacyId);
    const id = existingId ?? generatedId("project:integracao", legacyId);
    const payload = projectPayload(row, id, clientId);
    if (!oldProjectsById.has(legacyId)) {
      plan.projects.insert.push({ legacyId, payload });
      maps.projectByLegacy.set(legacyId, id);
      if (!maps.projectByClient.has(clientId)) maps.projectByClient.set(clientId, id);
      continue;
    }
    if (!existingId) {
      plan.projects.missingExistingMap.push(legacyId);
      continue;
    }
    const changed = changedColumns(payload, currentProjectsById.get(existingId), [
      "name",
      "client_id",
      "status",
      "start_date",
      "end_date",
      "objective",
      "porcentage",
    ]);
    if (changed.length > 0)
      plan.projects.update.push({ legacyId, id: existingId, payload, changed });
  }

  for (const legacyId of oldTasksById.keys()) {
    if (newTasksById.has(legacyId)) continue;
    const id = maps.taskByLegacy.get(legacyId);
    if (id) plan.tasks.delete.push({ legacyId, id });
  }

  for (const [legacyId, row] of newTasksById.entries()) {
    const clientId = maps.clientByLegacy.get(String(row.cliente_id));
    if (!clientId) {
      plan.tasks.missingClient.push(legacyId);
      continue;
    }
    if (!maps.projectByClient.get(clientId)) {
      plan.tasks.missingProject.push(legacyId);
      continue;
    }
    const existingId = maps.taskByLegacy.get(legacyId);
    const id = existingId ?? generatedId("task:integracao", legacyId);
    const payload = taskPayload(row, id, maps);
    if (!payload.model_id) {
      plan.tasks.missingModel.push(legacyId);
      continue;
    }
    if (!oldTasksById.has(legacyId)) {
      plan.tasks.insert.push({ legacyId, payload });
      maps.taskByLegacy.set(legacyId, id);
      continue;
    }
    if (!existingId) {
      plan.tasks.missingExistingMap.push(legacyId);
      continue;
    }
    const changed = changedColumns(payload, maps.taskRowsById.get(existingId), [
      "model_id",
      "project_id",
      "client_id",
      "name",
      "status",
      "department_id",
      "observations",
      "billing",
      "urgency",
      "responsible_id",
      "responsible2_id",
      "responsible3_id",
      "prevision_date",
      "end_date",
      "date_created",
      "date_updated",
      "meeting",
    ]);
    if (changed.length > 0) plan.tasks.update.push({ legacyId, id: existingId, payload, changed });
  }

  return plan;
}

function summarize(oldDump, newDump, current, maps, plan) {
  const summary = {
    source: {
      old: {
        clients: oldDump.clients.length,
        projects: oldDump.projects.length,
        tasks: oldDump.tasks.length,
      },
      new: {
        clients: newDump.clients.length,
        projects: newDump.projects.length,
        tasks: newDump.tasks.length,
      },
    },
    current: {
      clients: current.currentClients.length,
      projects: current.currentProjects.length,
      tasks: current.currentTasks.length,
    },
    mappedExisting: {
      clients: maps.clientByLegacy.size,
      projects: maps.projectByLegacy.size,
      tasks: maps.taskByLegacy.size,
      departments: maps.departmentByLegacy.size,
      users: maps.userByLegacy.size,
    },
    plan: {
      clients: {
        insert: plan.clients.insert.length,
        update: plan.clients.update.length,
        missingExistingMap: plan.clients.missingExistingMap.length,
      },
      projects: {
        insert: plan.projects.insert.length,
        update: plan.projects.update.length,
        missingExistingMap: plan.projects.missingExistingMap.length,
        missingClient: plan.projects.missingClient.length,
      },
      tasks: {
        insert: plan.tasks.insert.length,
        update: plan.tasks.update.length,
        delete: plan.tasks.delete.length,
        missingExistingMap: plan.tasks.missingExistingMap.length,
        missingClient: plan.tasks.missingClient.length,
        missingProject: plan.tasks.missingProject.length,
        missingModel: plan.tasks.missingModel.length,
      },
    },
    expectedAfterApply: {
      clients: current.currentClients.length + plan.clients.insert.length,
      projects: current.currentProjects.length + plan.projects.insert.length,
      tasks: current.currentTasks.length + plan.tasks.insert.length - plan.tasks.delete.length,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
}

function assertSafePlan(plan) {
  const blockers = [
    ["clients.missingExistingMap", plan.clients.missingExistingMap],
    ["projects.missingExistingMap", plan.projects.missingExistingMap],
    ["projects.missingClient", plan.projects.missingClient],
    ["tasks.missingExistingMap", plan.tasks.missingExistingMap],
    ["tasks.missingClient", plan.tasks.missingClient],
    ["tasks.missingProject", plan.tasks.missingProject],
    ["tasks.missingModel", plan.tasks.missingModel],
  ].filter(([, values]) => values.length > 0);
  if (blockers.length > 0) {
    for (const [name, values] of blockers) {
      console.error(`${name}: ${values.slice(0, 20).join(", ")}${values.length > 20 ? "..." : ""}`);
    }
    throw new Error("Plano possui bloqueios; nenhuma escrita sera feita.");
  }
}

async function bulkInsert(client, table, rows) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0].payload);
  const values = [];
  const placeholders = rows.map(({ payload }, rowIndex) => {
    const rowPlaceholders = columns.map((column, columnIndex) => {
      values.push(payload[column]);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });
  await client.query(
    `insert into public."${table}" (${columns.map((column) => `"${column}"`).join(", ")}) values ${placeholders.join(", ")}`,
    values,
  );
}

async function bulkDelete(client, table, rows) {
  if (rows.length === 0) return;
  await client.query(`delete from public."${table}" where id = any($1::text[])`, [
    rows.map((row) => row.id),
  ]);
}

function bulkUpdateExpression(column) {
  const timestampColumns = new Set([
    "opening_date",
    "start_date",
    "end_date",
    "prevision_date",
    "date_created",
    "date_updated",
  ]);
  if (timestampColumns.has(column)) return `data."${column}"::timestamp without time zone`;
  if (column === "porcentage") return `data."${column}"::double precision`;
  return `data."${column}"`;
}

async function bulkUpdate(client, table, rows, columns) {
  if (rows.length === 0) return;
  const setColumns = columns.filter(
    (column) => column !== "id" && Object.hasOwn(rows[0].payload, column),
  );
  const dataColumns = ["id", ...setColumns];
  const chunkSize = 500;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const tuples = chunk.map((row, rowIndex) => {
      const tupleValues = [row.id, ...setColumns.map((column) => row.payload[column] ?? null)];
      const placeholders = tupleValues.map((value, columnIndex) => {
        values.push(value);
        return `$${rowIndex * dataColumns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(
      `update public."${table}" as target set ${setColumns
        .map((column) => `"${column}" = ${bulkUpdateExpression(column)}`)
        .join(", ")} from (values ${tuples.join(", ")}) as data(${dataColumns
        .map((column) => `"${column}"`)
        .join(", ")}) where target.id = data."id"`,
      values,
    );
  }
}

async function applyPlan(client, plan) {
  await client.query("begin");
  try {
    await bulkInsert(client, "clients", plan.clients.insert);
    await bulkInsert(client, "integracao.projects", plan.projects.insert);
    await bulkInsert(client, "integracao.tasks", plan.tasks.insert);

    await bulkUpdate(client, "clients", plan.clients.update, [
      "name",
      "company_name",
      "fantasy_name",
      "responsible",
      "cpf_responsible",
      "agent",
      "cpf_agent",
      "number",
      "email",
      "address",
      "cep",
      "neighborhood",
      "state",
      "city",
      "status",
      "opening_date",
      "instagram",
      "indication",
      "size",
      "cpf_cnpj",
      "type",
    ]);
    await bulkUpdate(client, "integracao.projects", plan.projects.update, [
      "name",
      "client_id",
      "status",
      "start_date",
      "end_date",
      "objective",
      "porcentage",
    ]);
    await bulkDelete(client, "integracao.tasks", plan.tasks.delete);

    await bulkUpdate(client, "integracao.tasks", plan.tasks.update, [
      "model_id",
      "project_id",
      "client_id",
      "name",
      "status",
      "department_id",
      "observations",
      "billing",
      "urgency",
      "responsible_id",
      "responsible2_id",
      "responsible3_id",
      "prevision_date",
      "end_date",
      "date_created",
      "date_updated",
      "meeting",
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function validate(client) {
  const result = await client.query(`
    select 'clients' as table_name, count(*)::bigint as total from public.clients
    union all select 'integracao.projects', count(*)::bigint from public."integracao.projects"
    union all select 'integracao.tasks', count(*)::bigint from public."integracao.tasks"
  `);
  const fkResult = await client.query(`
    select 'tasks_client' as check_name, count(*)::bigint as broken
    from public."integracao.tasks" t left join public.clients c on c.id = t.client_id where c.id is null
    union all
    select 'tasks_project', count(*)::bigint
    from public."integracao.tasks" t left join public."integracao.projects" p on p.id = t.project_id where p.id is null
    union all
    select 'projects_client', count(*)::bigint
    from public."integracao.projects" p left join public.clients c on c.id = p.client_id where c.id is null
  `);
  console.log("validation.counts", JSON.stringify(result.rows));
  console.log("validation.fks", JSON.stringify(fkResult.rows));
}

async function main() {
  const oldDump = loadDumpSet(OLD_DUMP_DIR);
  const newDump = loadDumpSet(NEW_DUMP_DIR);
  const { Client } = loadPg();
  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const current = await queryAll(client);
    const maps = buildMappings(oldDump, current);
    const plan = buildPlan(oldDump, newDump, current, maps);
    summarize(oldDump, newDump, current, maps, plan);
    assertSafePlan(plan);
    if (!apply) {
      console.log("Dry-run concluido. Rode com --apply para escrever no Supabase.");
      return;
    }
    await applyPlan(client, plan);
    await validate(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
