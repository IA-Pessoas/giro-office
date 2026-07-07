import crypto from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const DEFAULT_TMP_ROOT = "/tmp/giro-office-migration-v2";
const DEFAULT_DOCS_DIR = path.resolve("docs/migration/v2");
const DEFAULT_NAMESPACE = "giro-office:migration:v2:castelo-contabilidade";

const TABLE_FILES = {
  departments: "tb_admin.departamentos",
  adminUsers: "tb_admin.usuarios",
  rhUsers: "tb_rh.colaboradores",
  integracaoClients: "tb_integracao.clientes",
  regularizeClients: "tb_regularize.clientes",
  projects: "tb_integracao.prospeccao_comercial",
  taskModels: "tb_integracao.tarefas_express",
  plans: "tb_integracao.planos",
  planTasks: "tb_integracao.tarefas_planos",
  tasks: "tb_integracao.tarefas",
  licenses: "tb_regularize.alvaras",
  processes: "tb_regularize.processos",
  guidances: "tb_regularize.orientaoes_processual",
  partners: "tb_regularize.orientaoes_processual.socios",
  municipalTaxes: "tb_regularize.taxas_municipais",
  passwords: "tb_regularize.clientes_senhas",
};

const PASSWORD_SITE_COLUMNS = [
  ["acesso_simples", "Acesso Simples"],
  ["inscricao_estadual", "Inscricao Estadual"],
  ["sefaz", "SEFAZ"],
  ["regularize", "Regularize"],
  ["webiss_master", "WebISS Master"],
  ["webiss_usuario_cpf", "WebISS Usuario CPF"],
  ["webiss_cpf", "WebISS CPF"],
  ["webiss_usuario_cpf_dois", "WebISS Usuario CPF 2"],
  ["webiss_cpf_dois", "WebISS CPF 2"],
  ["seifsa_usuario", "SEIFSA Usuario"],
  ["seifsa_senha", "SEIFSA Senha"],
  ["bacen_usuario", "Bacen Usuario"],
  ["bacen_senha", "Bacen Senha"],
  ["gov", "Gov.br"],
  ["MEI", "MEI"],
  ["certificado_pj", "Certificado PJ"],
  ["certificado_pf", "Certificado PF"],
];

export function uuidV5(namespace, value) {
  const namespaceBytes = crypto.createHash("sha1").update(String(namespace)).digest().subarray(0, 16);
  const valueBytes = Buffer.from(String(value));
  const bytes = crypto.createHash("sha1").update(namespaceBytes).update(valueBytes).digest().subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

export function normalizeDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text || text.startsWith("0000-00-00")) {
    return null;
  }

  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export async function buildLoad({
  docsDir = DEFAULT_DOCS_DIR,
  inputDir = path.join(DEFAULT_TMP_ROOT, "raw-confirmed"),
  outputDir = path.join(DEFAULT_TMP_ROOT, "load"),
  organizationId = DEFAULT_ORGANIZATION_ID,
  namespace = DEFAULT_NAMESPACE,
} = {}) {
  const raw = await readRawTables(inputDir);
  const adHocModels = parseCsv(
    await readFile(path.join(docsDir, "task-legacy-ad-hoc-models.csv"), "utf8"),
  );

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.join(outputDir, "maps"), { recursive: true });

  const transformations = [];
  const ctx = {
    namespace,
    organizationId,
    transformations,
    ids: (kind, legacy) => uuidV5(namespace, `${kind}:${legacy}`),
  };

  const fallback = buildFallbacks(adHocModels, ctx);
  const departments = buildDepartments(raw.departments, adHocModels, fallback, ctx);
  const users = buildUsers(raw.adminUsers, raw.rhUsers, departments.map, fallback, ctx);
  const clients = buildClients(raw.integracaoClients, raw.regularizeClients, ctx);
  const projects = buildProjects(raw.projects, clients, fallback, ctx);
  const taskModels = buildTaskModels(raw.taskModels, adHocModels, departments.map, users.map, fallback, ctx);
  const plans = buildPlans(raw.plans, ctx);
  const planTasks = buildPlanTasks(raw.planTasks, plans.map, taskModels.map, ctx);
  const tasks = buildTasks(raw.tasks, clients, projects, taskModels, departments.map, users.map, fallback, ctx);
  const regularize = buildRegularize(raw, clients, users.map, tasks.byLegacyId, ctx);
  const validation = validateLoad({
    departments: departments.rows,
    users: users.rows,
    clients: clients.rows,
    projects: projects.rows,
    taskModels: taskModels.rows,
    projectPlans: plans.rows,
    projectPlanTasks: planTasks.rows,
    tasks: tasks.rows,
    ...regularize.rows,
  });

  const outputs = {
    "departments.json": departments.rows,
    "users.json": users.rows,
    "clients.json": clients.rows,
    "integracao.projects.json": projects.rows,
    "integracao.tasksModel.json": taskModels.rows,
    "integracao.projectPlan.json": plans.rows,
    "integracao.projectPlanTasks.json": planTasks.rows,
    "integracao.tasks.json": tasks.rows,
    "regularize.license.json": regularize.rows.licenses,
    "regularize.process.json": regularize.rows.processes,
    "regularize.proceduralGuidances.json": regularize.rows.proceduralGuidances,
    "clients.pf.json": regularize.rows.clientPFs,
    "regularize.partners.json": regularize.rows.partners,
    "regularize.municipalTaxes.json": regularize.rows.municipalTaxes,
    "regularize.passowordsSites.json": regularize.rows.passwordSites,
    "regularize.passwordsRegularize.json": regularize.rows.passwordsRegularize,
    "transformations.json": transformations,
  };

  await Promise.all(
    Object.entries(outputs).map(([name, rows]) =>
      writeJson(path.join(outputDir, name), rows),
    ),
  );

  const maps = {
    "maps/departments.json": departments.legacyMap,
    "maps/users.json": users.legacyMap,
    "maps/clients.integracao.json": clients.integracaoMap,
    "maps/clients.regularize.json": clients.regularizeMap,
    "maps/projects.json": projects.legacyMap,
    "maps/task-models.json": taskModels.legacyMap,
    "maps/project-plans.json": plans.legacyMap,
    "maps/tasks.json": tasks.legacyMap,
  };

  await Promise.all(Object.entries(maps).map(([name, data]) => writeJson(path.join(outputDir, name), data)));

  const manifest = {
    generatedAt: new Date().toISOString(),
    tenant: {
      organization_id: organizationId,
      slug: "castelo-contabilidade",
    },
    mode: "transformed-local-load",
    note: "Carga final transformada em arquivos locais. Nao escreve no Supabase.",
    outputDir,
    counts: {
      departments: departments.rows.length,
      users: users.rows.length,
      clients: clients.rows.length,
      projects: projects.rows.length,
      taskModels: taskModels.rows.length,
      projectPlans: plans.rows.length,
      projectPlanTasks: planTasks.rows.length,
      tasks: tasks.rows.length,
      licenses: regularize.rows.licenses.length,
      processes: regularize.rows.processes.length,
      proceduralGuidances: regularize.rows.proceduralGuidances.length,
      clientPFs: regularize.rows.clientPFs.length,
      partners: regularize.rows.partners.length,
      municipalTaxes: regularize.rows.municipalTaxes.length,
      passwordSites: regularize.rows.passwordSites.length,
      passwordsRegularize: regularize.rows.passwordsRegularize.length,
      transformations: transformations.length,
    },
    validation,
  };

  await writeJson(path.join(outputDir, "manifest.json"), manifest);

  return manifest;
}

async function readRawTables(inputDir) {
  const entries = await Promise.all(
    Object.entries(TABLE_FILES).map(async ([key, name]) => [key, await readJson(path.join(inputDir, `${name}.json`))]),
  );

  return Object.fromEntries(entries);
}

function buildFallbacks(adHocModels, ctx) {
  const fallbackModel = adHocModels.find((row) => row.name?.includes("Sem departamento legado")) ?? adHocModels[0];
  return {
    departmentId: fallbackModel?.department_id || ctx.ids("department", "fallback"),
    userId: fallbackModel?.responsible_id || ctx.ids("user", "fallback"),
    taskModelId: fallbackModel?.id || ctx.ids("task-model", "fallback"),
    clientId: ctx.ids("client", "technical-missing-reference"),
    projectId: ctx.ids("project", "technical-missing-reference"),
  };
}

function buildDepartments(rows, adHocModels, fallback, ctx) {
  const adHocDepartmentIds = new Map();
  for (const row of adHocModels) {
    const name = String(row.name ?? "").replace(/^Tarefa legada avulsa - /, "").trim();
    if (name && row.department_id) {
      adHocDepartmentIds.set(normalizeName(name), row.department_id);
    }
  }

  const output = rows.map((row) => {
    const name = cleanText(row.nome) || `Departamento legado ${row.id}`;
    const id = adHocDepartmentIds.get(normalizeName(name)) ?? ctx.ids("department", row.id);
    return {
      id,
      name,
      color: cleanText(row.color) || "#64748b",
      status: String(row.status ?? "1"),
      solution: Boolean(Number(row.parceiros ?? 0)),
      organization_id: ctx.organizationId,
    };
  });

  if (!output.some((row) => row.id === fallback.departmentId)) {
    output.push({
      id: fallback.departmentId,
      name: "Sem departamento legado",
      color: "#64748b",
      status: "1",
      solution: false,
      organization_id: ctx.organizationId,
    });
  }

  const legacyMap = Object.fromEntries(rows.map((row, index) => [String(row.id), output[index].id]));
  legacyMap["0"] = fallback.departmentId;
  legacyMap.null = fallback.departmentId;

  return { rows: output, legacyMap, map: new Map(Object.entries(legacyMap)) };
}

function buildUsers(adminRows, rhRows, departmentMap, fallback, ctx) {
  const rhByUserId = new Map(rhRows.filter((row) => row.user_id).map((row) => [String(row.user_id), row]));
  const seenCpf = new Set();
  const seenRg = new Set();
  const output = [];
  const legacyMap = {};

  for (const row of adminRows) {
    const rh = rhByUserId.get(String(row.id));
    const id = ctx.ids("user", row.id);
    const cpf = uniqueDigits(rh?.cpf, seenCpf, [11]);
    const rg = uniqueDigits(rh?.rg, seenRg);
    const departmentId = departmentMap.get(String(row.departamento_id)) ?? fallback.departmentId;

    if (departmentId === fallback.departmentId && Number(row.departamento_id ?? 0) !== 0) {
      ctx.transformations.push(transformation("users", row.id, "department-fallback", row.departamento_id));
    }

    output.push({
      id,
      name: cleanText(row.nome) || cleanText(row.user) || `Usuario legado ${row.id}`,
      login: cleanText(row.user) || `legacy-${row.id}`,
      password: cleanText(row.password) || "legacy-password-not-informed",
      permission: Number(row.cargo ?? rh?.cargo ?? 0),
      status: cleanText(row.status) || String(rh?.status ?? "Ativo"),
      organization_id: ctx.organizationId,
      type: null,
      first_owner_flag: false,
      department_id: departmentId,
      photo_url: cleanText(rh?.foto || row.img) || null,
      full_name: cleanText(rh?.nome) || cleanText(row.nome) || null,
      gender: cleanText(rh?.genero) || null,
      birth_date: normalizeDate(rh?.data_nascimento),
      cpf,
      rg,
      address: cleanText(rh?.endereco) || null,
      job_title: rh?.cargo === undefined ? cleanText(row.cargo) || null : String(rh.cargo),
      email: cleanText(rh?.email) || null,
      phone: cleanDigits(rh?.telefone) || null,
      hire_date: normalizeDate(rh?.data_admissao),
      termination_date: normalizeDate(rh?.data_demissao),
    });
    legacyMap[String(row.id)] = id;
  }

  if (!output.some((row) => row.id === fallback.userId)) {
    output.push({
      id: fallback.userId,
      name: "Responsavel legado nao informado",
      login: "legacy-fallback",
      password: "legacy-password-not-informed",
      permission: 0,
      status: "Ativo",
      organization_id: ctx.organizationId,
      type: null,
      first_owner_flag: false,
      department_id: fallback.departmentId,
      photo_url: null,
      full_name: "Responsavel legado nao informado",
      gender: null,
      birth_date: null,
      cpf: null,
      rg: null,
      address: null,
      job_title: null,
      email: null,
      phone: null,
      hire_date: null,
      termination_date: null,
    });
  }

  legacyMap["0"] = fallback.userId;
  legacyMap.null = fallback.userId;

  return { rows: output, legacyMap, map: new Map(Object.entries(legacyMap)) };
}

function buildClients(integracaoRows, regularizeRows, ctx) {
  const output = [];
  const byKey = new Map();
  const integracaoMap = {};
  const regularizeMap = {};

  function upsert(key, row, source, legacyId) {
    let client = byKey.get(key);
    if (!client) {
      client = makeClient(row, source, legacyId, ctx);
      byKey.set(key, client);
      output.push(client);
    } else {
      mergeClient(client, row, source);
    }

    return client;
  }

  for (const row of integracaoRows) {
    const client = upsert(`integracao:${row.id}`, row, "integracao", row.id);
    integracaoMap[String(row.id)] = client.id;
  }

  for (const row of regularizeRows) {
    const client = upsert(`regularize:${row.codigo}`, row, "regularize", row.codigo);

    regularizeMap[String(row.codigo)] = client.id;
    if (Number(row.cliente_id ?? 0) > 0) {
      regularizeMap[`legacy_cliente_id:${row.cliente_id}`] = integracaoMap[String(row.cliente_id)] ?? null;
    }
  }

  const technicalClientId = ctx.ids("client", "technical-missing-reference");
  if (!output.some((row) => row.id === technicalClientId)) {
    output.push({
      id: technicalClientId,
      dominio_code: null,
      name: "Cliente tecnico para referencias legadas ausentes",
      company_name: "Cliente tecnico para referencias legadas ausentes",
      fantasy_name: null,
      cnae: null,
      responsible: null,
      cpf_responsible: null,
      agent: null,
      cpf_agent: null,
      number: null,
      email: null,
      address: null,
      cep: null,
      neighborhood: null,
      state: null,
      city: null,
      customer_since: null,
      municipal_registration: null,
      state_registration: null,
      commercial_board_registration: null,
      status: "Migrado",
      competence_entry: null,
      competence_output: null,
      opening_date: null,
      instagram: null,
      indication: null,
      prospecting_status: "Tecnico",
      cpf_cnpj: "",
      type: "PJ",
      type_registration: "Tecnico",
      organization_id: ctx.organizationId,
    });
  }

  return { rows: output, integracaoMap, regularizeMap };
}

function makeClient(row, source, legacyId, ctx) {
  const doc = validCpfCnpj(row.cpf_cnpj ?? row.cnpj) ?? cleanDigits(row.cpf_cnpj ?? row.cnpj);
  const name = cleanText(row.nome || row.razao_social || row.nome_fantasia) || `Cliente legado ${source} ${legacyId}`;

  return {
    id: ctx.ids("client", `${source}:${legacyId}`),
    dominio_code: row.codigo === undefined ? null : String(row.codigo),
    name,
    company_name: cleanText(row.razao_social || row.nome) || null,
    fantasy_name: cleanText(row.nome_fantasia) || null,
    cnae: cleanDigits(row.cnae) || null,
    responsible: cleanText(row.responsavel || row.socioAdm) || null,
    cpf_responsible: cleanDigits(row.cpf_socio) || null,
    agent: cleanText(row.preposto) || null,
    cpf_agent: cleanDigits(row.cpf_preposto) || null,
    number: cleanText(row.fone || row.contato) || null,
    email: cleanText(row.email) || null,
    address: cleanText(row.endereco) || null,
    cep: cleanDigits(row.cep) || null,
    neighborhood: cleanText(row.bairro) || null,
    state: cleanText(row.estado) || null,
    city: cleanText(row.municipio || row.cidade) || null,
    customer_since: normalizeDate(row.cliente_desde || row.inicio_contrato),
    municipal_registration: cleanText(row.inscricao_municipal) || null,
    state_registration: cleanText(row.inscricao_estadual) || null,
    commercial_board_registration: cleanText(row.inscricao_junta_comercial) || null,
    status: normalizeStatus(row.situacao ?? row.tipo_cliente),
    competence_entry: normalizeCompetence(row.competencia_entrada),
    competence_output: normalizeCompetence(row.competencia_saida),
    opening_date: normalizeDate(row.dataAbertura),
    instagram: cleanText(row.instagram) || null,
    indication: cleanText(row.indicacao) || null,
    prospecting_status: "Migrado do legado",
    cpf_cnpj: doc || "",
    type: inferClientType(row.tipo, doc),
    type_registration: "Migrado",
    organization_id: ctx.organizationId,
  };
}

function mergeClient(client, row, source) {
  const incoming = makeClient(row, source, row.codigo ?? row.id ?? row.cliente_id ?? "merge", {
    ids: () => client.id,
    organizationId: client.organization_id,
  });

  for (const [key, value] of Object.entries(incoming)) {
    if ((client[key] === null || client[key] === "" || client[key] === undefined) && value !== null && value !== "") {
      client[key] = value;
    }
  }
}

function buildProjects(rows, clients, fallback, ctx) {
  const output = [];
  const legacyMap = {};
  const byClientId = new Map();

  for (const row of rows) {
    const clientId = clients.integracaoMap[String(row.cliente_id)] ?? fallback.clientId;
    const id = ctx.ids("project", row.id);
    const project = {
      id,
      name: cleanText(row.servico) || `Projeto legado ${row.id}`,
      client_id: clientId,
      status: cleanText(row.situacao) || "Migrado",
      start_date: normalizeDate(row.data_cadastro),
      end_date: normalizeDate(row.data_fechamento || row.data_status),
      objective: cleanText(row.solucao || row.status_prospeccao) || null,
      sponsor_id: null,
      porcentage: Number(row.porcentagem ?? 0),
      organization_id: ctx.organizationId,
    };
    output.push(project);
    legacyMap[String(row.id)] = id;
    if (!byClientId.has(clientId)) {
      byClientId.set(clientId, id);
    }
  }

  if (!output.some((row) => row.id === fallback.projectId)) {
    output.push({
      id: fallback.projectId,
      name: "Projeto tecnico para registros sem prospeccao legada",
      client_id: fallback.clientId,
      status: "Migrado",
      start_date: null,
      end_date: null,
      objective: "Projeto tecnico criado para preservar relacoes obrigatorias da migracao.",
      sponsor_id: null,
      porcentage: 0,
      organization_id: ctx.organizationId,
    });
  }

  return { rows: output, legacyMap, byClientId };
}

function buildTaskModels(rows, adHocModels, departmentMap, userMap, fallback, ctx) {
  const output = [];
  const legacyMap = {};
  const byName = new Map();
  const adHocByDepartment = new Map();

  for (const row of rows) {
    const departmentId = departmentMap.get(String(row.departamento_id)) ?? fallback.departmentId;
    const model = {
      id: ctx.ids("task-model", row.id),
      name: cleanText(row.nome) || `Modelo legado ${row.id}`,
      department_id: departmentId,
      responsible_id: userMap.get(String(row.responsavel_id)) ?? fallback.userId,
      responsible2_id: userMap.get(String(row.responsavel_id_dois)) ?? null,
      responsible3_id: userMap.get(String(row.responsavel_id_tres)) ?? null,
      observations: cleanText(row.obs) || null,
      billing: String(row.cobranca ?? 0),
      prevision: Number(row.previsao ?? 0),
      type: "legacy-express",
      organization_id: ctx.organizationId,
    };
    output.push(model);
    legacyMap[String(row.id)] = model.id;
    const nameKey = normalizeName(model.name);
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), model]);
  }

  for (const row of adHocModels) {
    const model = {
      id: row.id,
      name: row.name,
      department_id: row.department_id || fallback.departmentId,
      responsible_id: row.responsible_id || fallback.userId,
      responsible2_id: cleanText(row.responsible2_id) || null,
      responsible3_id: cleanText(row.responsible3_id) || null,
      observations: cleanText(row.observations) || null,
      billing: String(row.billing ?? 0),
      prevision: Number(row.prevision ?? 0),
      type: row.type || "legacy-ad-hoc",
      organization_id: ctx.organizationId,
    };
    output.push(model);
    adHocByDepartment.set(model.department_id, model);
  }

  return {
    rows: output,
    legacyMap,
    map: new Map(Object.entries(legacyMap)),
    byName,
    adHocByDepartment,
    fallbackModelId: fallback.taskModelId,
  };
}

function buildPlans(rows, ctx) {
  const output = rows.map((row) => ({
    id: ctx.ids("project-plan", row.id),
    name: cleanText(row.nome) || `Plano legado ${row.id}`,
    color: cleanText(row.color) || "#64748b",
    organization_id: ctx.organizationId,
  }));
  const legacyMap = Object.fromEntries(rows.map((row, index) => [String(row.id), output[index].id]));
  return { rows: output, legacyMap, map: new Map(Object.entries(legacyMap)) };
}

function buildPlanTasks(rows, planMap, taskModelMap, ctx) {
  return {
    rows: rows
      .map((row) => {
        const planId = planMap.get(String(row.plano_id));
        const taskId = taskModelMap.get(String(row.tarefa_express_id));
        if (!planId || !taskId) {
          ctx.transformations.push(transformation("projectPlanTasks", row.id, "relation-skipped", row));
          return null;
        }
        return {
          id: ctx.ids("project-plan-task", row.id),
          plan_id: planId,
          task_id: taskId,
          order: Number(row.ordem ?? 0),
          organization_id: ctx.organizationId,
        };
      })
      .filter(Boolean),
  };
}

function buildTasks(rows, clients, projects, taskModels, departmentMap, userMap, fallback, ctx) {
  const output = [];
  const legacyMap = {};
  const byLegacyId = new Map();

  for (const row of rows) {
    const departmentId = departmentMap.get(String(row.departamento_id)) ?? fallback.departmentId;
    const modelCandidates = taskModels.byName.get(normalizeName(row.nome)) ?? [];
    let model = modelCandidates.length === 1 ? modelCandidates[0] : null;

    if (!model) {
      model = taskModels.adHocByDepartment.get(departmentId) ?? taskModels.rows.find((item) => item.id === fallback.taskModelId);
      ctx.transformations.push(
        transformation(
          "tasks",
          row.id,
          modelCandidates.length > 1 ? "modelo-nome-ambiguo-avulso" : "modelo-nao-mapeado-avulso",
          row.nome,
        ),
      );
    }

    const clientId = clients.integracaoMap[String(row.cliente_id)] ?? fallback.clientId;
    const projectId = projects.byClientId.get(clientId) ?? fallback.projectId;
    const task = {
      id: ctx.ids("task", row.id),
      model_id: model.id,
      project_id: projectId,
      client_id: clientId,
      name: cleanText(row.nome) || `Tarefa legada ${row.id}`,
      status: cleanText(row.estado) || "Migrado",
      department_id: departmentId,
      observations: cleanText(row.obs) || null,
      billing: String(row.cobranca ?? 0),
      urgency: String(row.urgencia ?? 0),
      responsible_id: userMap.get(String(row.responsavel_id)) ?? fallback.userId,
      responsible2_id: userMap.get(String(row.responsavel_id_dois)) ?? null,
      responsible3_id: userMap.get(String(row.responsavel_id_tres)) ?? null,
      start_date: normalizeDate(row.data_cadastro),
      prevision_date: normalizeDate(row.data_previsao),
      end_date: normalizeDate(row.data_resolucao),
      date_created: normalizeDate(row.data_cadastro),
      date_updated: normalizeDate(row.data_update),
      meeting: cleanText(row.reuniao) || null,
      organization_id: ctx.organizationId,
    };
    output.push(task);
    legacyMap[String(row.id)] = task.id;
    byLegacyId.set(String(row.id), task.id);
  }

  return { rows: output, legacyMap, byLegacyId };
}

function buildRegularize(raw, clients, userMap, taskMap, ctx) {
  const processes = raw.processes.map((row) => ({
    id: ctx.ids("regularize-process", row.id),
    client_pj_id: findClientByDocumentOrName(clients.rows, row.cpf_cnpj, row.cliente),
    client_pf_id: null,
    cpf_cnpj: cleanDigits(row.cpf_cnpj) || "",
    process_type: cleanText(row.processo) || "Nao informado",
    description: cleanText(row.descricao) || "",
    entry_date: normalizeDate(row.data_entrada),
    completion_date: normalizeDate(row.data_finalizacao),
    expected_date: null,
    status: cleanText(row.status) || "Migrado",
    observation: cleanText(row.observacao) || null,
    responsible1_id: userMap.get(String(row.responsavel_um)) ?? null,
    responsible2_id: userMap.get(String(row.responsavel_dois)) ?? null,
    responsible3_id: userMap.get(String(row.responsavel_tres)) ?? null,
    locking_type: cleanText(row.travamento_cliente_notificacao) || null,
    urgency: String(row.urgencia ?? 0),
    task_id: taskMap.get(String(row.task_id)) ?? null,
    organization_id: ctx.organizationId,
  }));
  const processIds = new Set(processes.map((row) => row.id));
  const guidanceById = new Map(raw.guidances.map((row) => [String(row.id), row]));
  const clientPFs = [];
  const clientPFByKey = new Map();
  const partners = [];

  function guidanceProcessId(guidance) {
    const legacyProcessId = Number(guidance.processo_id ?? 0);
    const mappedId = legacyProcessId > 0 ? ctx.ids("regularize-process", legacyProcessId) : null;
    if (mappedId && processIds.has(mappedId)) {
      return mappedId;
    }

    const technicalId = ctx.ids("regularize-process", `technical-guidance:${guidance.id}`);
    if (!processIds.has(technicalId)) {
      processes.push({
        id: technicalId,
        client_pj_id: clients.regularizeMap[String(guidance.cliente_id)] ?? null,
        client_pf_id: null,
        cpf_cnpj: cleanDigits(guidance.cnpj) || "",
        process_type: "Processo tecnico para orientacao legada",
        description: cleanText(guidance.solicitacao) || "Processo tecnico criado para preservar orientacao sem processo legado correspondente.",
        entry_date: null,
        completion_date: null,
        expected_date: null,
        status: "Migrado",
        observation: "Criado durante a migracao v2 porque a orientacao processual nao tinha processo legado correspondente.",
        responsible1_id: null,
        responsible2_id: null,
        responsible3_id: null,
        locking_type: null,
        urgency: "0",
        task_id: null,
        organization_id: ctx.organizationId,
      });
      processIds.add(technicalId);
      ctx.transformations.push(transformation("proceduralGuidances", guidance.id, "processo-tecnico-criado", guidance.processo_id));
    }

    return technicalId;
  }

  const rows = {
    licenses: raw.licenses.map((row) => ({
      id: ctx.ids("regularize-license", row.id),
      client_id: findClientByDocumentOrName(clients.rows, row.cpf_cnpj, row.empresa),
      has: true,
      type_license: cleanText(row.tipo_do_alvara) || "Nao informado",
      entry_date: normalizeDate(row.data_de_entrada) || normalizeDate("1970-01-01"),
      protocol: String(row.protocolo ?? ""),
      responsible_id: userMap.get(String(row.responsavel)) ?? null,
      status: cleanText(row.status) || "Migrado",
      date_last_consultation: normalizeDate(row.data_ultima_consulta),
      current_situation: cleanText(row.situacao_atual) || "",
      contact: cleanText(row.contato) || "",
      observation: cleanText(row.observacao) || null,
      urgency: String(row.urgencia ?? 0),
      type: String(row.tipo ?? 0),
      due_date: null,
      task_id: taskMap.get(String(row.task_id)) ?? null,
      organization_id: ctx.organizationId,
    })),
    processes,
    proceduralGuidances: raw.guidances.map((row) => ({
      id: ctx.ids("regularize-guidance", row.id),
      process_id: guidanceProcessId(row),
      type: String(row.tipo ?? 0),
      request: cleanText(row.solicitacao) || null,
      framework_obs: cleanText(row.obs_quadro) || null,
      legal_nature: cleanText(row.natureza_juridica) || null,
      company_name: cleanText(row.razao_social) || null,
      trade_name: cleanText(row.nome_fantasia) || null,
      cpf_cnpj: cleanDigits(row.cnpj) || null,
      share_capital: Number(row.capital_social ?? 0),
      iptu: cleanText(row.iptu) || null,
      address: cleanText(row.endereco) || null,
      comporate_purpose: cleanText(row.obj_social) || null,
      carryng: cleanText(row.porte) || null,
      regime: cleanText(row.regime) || null,
      legal_representative: cleanText(row.representante_legal) || null,
      status: String(row.status ?? 0),
      economic_activities: null,
      partners: null,
      organization_id: ctx.organizationId,
    })),
    clientPFs,
    partners,
    municipalTaxes: raw.municipalTaxes
      .map((row) => {
        const clientId = clients.regularizeMap[String(row.cliente)] ?? clients.integracaoMap[String(row.cliente)];
        if (!clientId) {
          ctx.transformations.push(transformation("municipalTaxes", row.id, "client-missing-skipped", row.cliente));
          return null;
        }
        return {
          id: ctx.ids("regularize-municipal-tax", row.id),
          client_id: clientId,
          year: Number(row.ano ?? 0),
          tff_is_applicable: Boolean(Number(row.tff_possui ?? 0)),
          tff_amount: Number(row.tff_valor ?? 0),
          tff_notes: cleanText(row.tff_obs) || null,
          tff_analysis_is_done: Boolean(Number(row.tff_analise_feito ?? 0)),
          tff_analysis_notes: cleanText(row.tff_analise_obs) || null,
          tff_sent_date: normalizeDate(row.tff_envio_data),
          tff_due_date: normalizeDate(row.tff_vencimento),
          tlp_is_applicable: Boolean(Number(row.tlp_possui ?? 0)),
          tlp_amount: 0,
          tlp_notes: cleanText(row.tlp_obs) || null,
          tlp_is_sent: cleanText(row.tlp_envio) || "0",
          tlp_sent_date: normalizeDate(row.tlp_envio_data),
          tlp_due_date: normalizeDate(row.vencimento),
          tlp_not_email: Boolean(Number(row.email ?? 0)),
          tll_is_applicable: false,
          tll_amount: 0,
          tll_notes: null,
          tll_is_sent: "0",
          tll_sent_date: null,
          tll_due_date: null,
          tll_analysis_is_done: false,
          tll_analysis_notes: null,
          organization_id: ctx.organizationId,
        };
      })
      .filter(Boolean),
  };

  for (const row of raw.partners) {
    const guidance = guidanceById.get(String(row.op_id));
    let pjId =
      clients.regularizeMap[String(guidance?.cliente_id)] ??
      findClientByDocumentOrName(clients.rows, guidance?.cnpj, guidance?.razao_social);

    if (!pjId) {
      pjId = ctx.ids("client", "technical-missing-reference");
      ctx.transformations.push(transformation("partners", row.id, "pj-tecnico-usado", row.op_id));
    }

    const cpf = validCpfCnpj(row.cpf) ?? cleanDigits(row.cpf);
    const pfKey = cpf ? `cpf:${cpf}` : `legacy:${row.id}`;
    let pf = clientPFByKey.get(pfKey);
    if (!pf) {
      pf = {
        id: ctx.ids("client-pf", pfKey),
        code: String(row.id),
        name: cleanText(row.nome) || `Socio legado ${row.id}`,
        sex: "",
        address: cleanText(row.endereco) || "",
        city: "",
        zip_code: "",
        state: "",
        profession: cleanText(row.prof) || "",
        father: "",
        mother: "",
        marital_status: cleanText(row.civil) || "",
        date_of_birth: normalizeDate("1970-01-01"),
        cpf: cpf || "",
        rg: cleanText(row.rg) || "",
        rg_expedition: null,
        rg_validity: null,
        military_certificate: "",
        ctps: "",
        cnh: cleanText(row.cnh) || "",
        cnh_expedition: null,
        cnh_validity: null,
        spouse: "",
        status: "Migrado",
        notes: "Pessoa fisica criada a partir de regularize.orientaoes_processual.socios.",
        organization_id: ctx.organizationId,
      };
      clientPFByKey.set(pfKey, pf);
      clientPFs.push(pf);
    }

    partners.push({
      id: ctx.ids("regularize-partner", row.id),
      pj_id: pjId,
      pf_id: pf.id,
      part: Number(String(row.porcent ?? "0").replace(",", ".")) || 0,
      entry: normalizeDate("1970-01-01"),
      exit: null,
      organization_id: ctx.organizationId,
    });
  }

  const passwordSiteMap = new Map(
    PASSWORD_SITE_COLUMNS.map(([column, name]) => [
      column,
      {
        id: ctx.ids("regularize-password-site", column),
        name,
        sphere: "legacy",
        link: null,
        user: "",
        password: "",
        status: true,
        organization_id: ctx.organizationId,
      },
    ]),
  );
  const passwordsRegularize = [];
  for (const row of raw.passwords) {
    const clientId = clients.regularizeMap[String(row.empresa)] ?? clients.integracaoMap[String(row.empresa)];
    if (!clientId) {
      ctx.transformations.push(transformation("passwordsRegularize", row.id, "client-missing-skipped", row.empresa));
      continue;
    }
    for (const [column] of PASSWORD_SITE_COLUMNS) {
      const password = cleanText(row[column]);
      if (!password) {
        continue;
      }
      passwordsRegularize.push({
        id: ctx.ids("regularize-password", `${row.id}:${column}`),
        client_id: clientId,
        site_id: passwordSiteMap.get(column).id,
        login: cleanText(row.responsavel) || column,
        password,
        notes: `Migrado da coluna legada ${column}.`,
        organization_id: ctx.organizationId,
      });
    }
  }

  rows.passwordSites = [...passwordSiteMap.values()].filter((site) =>
    passwordsRegularize.some((password) => password.site_id === site.id),
  );
  rows.passwordsRegularize = passwordsRegularize;

  return { rows };
}

function validateLoad(data) {
  const counts = {
    orgBad: 0,
    missingDepartment: 0,
    missingUser: 0,
    missingClient: 0,
    missingProject: 0,
    missingTaskModel: 0,
    missingPlan: 0,
    missingProcess: 0,
    missingClientPF: 0,
  };
  const orgIds = new Set(Object.values(data).flat().map((row) => row.organization_id).filter(Boolean));
  counts.orgBad = [...orgIds].filter((id) => id !== DEFAULT_ORGANIZATION_ID && id !== "org-id").length;

  const departments = new Set(data.departments.map((row) => row.id));
  const users = new Set(data.users.map((row) => row.id));
  const clients = new Set(data.clients.map((row) => row.id));
  const clientPFs = new Set(data.clientPFs.map((row) => row.id));
  const projects = new Set(data.projects.map((row) => row.id));
  const taskModels = new Set(data.taskModels.map((row) => row.id));
  const plans = new Set(data.projectPlans.map((row) => row.id));
  const processes = new Set(data.processes.map((row) => row.id));

  for (const row of data.users) {
    if (!departments.has(row.department_id)) counts.missingDepartment++;
  }
  for (const row of data.taskModels) {
    if (!departments.has(row.department_id)) counts.missingDepartment++;
    if (!users.has(row.responsible_id)) counts.missingUser++;
  }
  for (const row of data.projects) {
    if (!clients.has(row.client_id)) counts.missingClient++;
  }
  for (const row of data.projectPlanTasks) {
    if (!plans.has(row.plan_id)) counts.missingPlan++;
    if (!taskModels.has(row.task_id)) counts.missingTaskModel++;
  }
  for (const row of data.tasks) {
    if (!departments.has(row.department_id)) counts.missingDepartment++;
    if (!users.has(row.responsible_id)) counts.missingUser++;
    if (!clients.has(row.client_id)) counts.missingClient++;
    if (!projects.has(row.project_id)) counts.missingProject++;
    if (!taskModels.has(row.model_id)) counts.missingTaskModel++;
  }
  for (const row of data.licenses) {
    if (row.client_id && !clients.has(row.client_id)) counts.missingClient++;
    if (row.responsible_id && !users.has(row.responsible_id)) counts.missingUser++;
  }
  for (const row of data.processes) {
    if (row.client_pj_id && !clients.has(row.client_pj_id)) counts.missingClient++;
    for (const key of ["responsible1_id", "responsible2_id", "responsible3_id"]) {
      if (row[key] && !users.has(row[key])) counts.missingUser++;
    }
  }
  for (const row of data.proceduralGuidances) {
    if (!processes.has(row.process_id)) counts.missingProcess++;
  }
  for (const row of data.partners) {
    if (!clients.has(row.pj_id)) counts.missingClient++;
    if (!clientPFs.has(row.pf_id)) counts.missingClientPF++;
  }
  for (const row of data.municipalTaxes) {
    if (!clients.has(row.client_id)) counts.missingClient++;
  }
  for (const row of data.passwordsRegularize) {
    if (!clients.has(row.client_id)) counts.missingClient++;
  }

  return {
    ...counts,
    all: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}

function findClientByDocumentOrName(clients, document, name) {
  const doc = validCpfCnpj(document);
  if (doc) {
    const client = clients.find((row) => row.cpf_cnpj === doc);
    if (client) return client.id;
  }

  const normalized = normalizeName(name);
  if (normalized) {
    const client = clients.find((row) => normalizeName(row.name) === normalized || normalizeName(row.company_name) === normalized);
    if (client) return client.id;
  }

  return null;
}

function transformation(table, legacyId, type, value) {
  return { table, legacyId, type, value };
}

function normalizeStatus(value) {
  const text = cleanText(value);
  if (!text) return "Ativo";
  if (text === "I" || text === "0") return "Inativo";
  if (text === "A" || text === "1") return "Ativo";
  return text;
}

function inferClientType(type, doc) {
  if (String(type).toLowerCase().includes("fis")) return "PF";
  if (String(type).toLowerCase().includes("jur")) return "PJ";
  return doc?.length === 11 ? "PF" : "PJ";
}

function normalizeCompetence(value) {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(\d{2})\/?(\d{4})$/);
  if (match) {
    return normalizeDate(`${match[2]}-${match[1]}-01`);
  }
  return normalizeDate(text);
}

function uniqueDigits(value, seen, validLengths = null) {
  const digits = cleanDigits(value);
  if (!digits) return null;
  if (validLengths && !validLengths.includes(digits.length)) return null;
  if (seen.has(digits)) return null;
  seen.add(digits);
  return digits;
}

function validCpfCnpj(value) {
  const digits = cleanDigits(value);
  return digits.length === 11 || digits.length === 14 ? digits : null;
}

function cleanDigits(value) {
  return cleanText(value).replace(/\D/g, "");
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function normalizeName(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index++;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await buildLoad();
  console.log(JSON.stringify(manifest, null, 2));
}
