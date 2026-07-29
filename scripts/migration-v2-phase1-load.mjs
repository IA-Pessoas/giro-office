#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const DEFAULT_INPUT_DIR = "/tmp/giro-office-migration-v2/load";
const DEFAULT_OUTPUT_DIR = "/tmp/giro-office-migration-v2/phase1";
const DEFAULT_ENV_FILE = ".env";

export const PHASE1_TABLES = [
  {
    source: "departments",
    relation: "public.departments",
    columns: ["id", "name", "color", "status", "solution", "organization_id"],
  },
  {
    source: "users",
    relation: "public.users",
    columns: [
      "id",
      "name",
      "login",
      "password",
      "permission",
      "status",
      "organization_id",
      "type",
      "first_owner_flag",
      "department_id",
      "photo_url",
      "full_name",
      "gender",
      "birth_date",
      "cpf",
      "rg",
      "address",
      "job_title",
      "email",
      "phone",
      "hire_date",
      "termination_date",
    ],
  },
  {
    source: "clients",
    relation: "public.clients",
    columns: [
      "id",
      "dominio_code",
      "name",
      "company_name",
      "fantasy_name",
      "cnae",
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
      "customer_since",
      "municipal_registration",
      "state_registration",
      "commercial_board_registration",
      "status",
      "competence_entry",
      "competence_output",
      "opening_date",
      "instagram",
      "indication",
      "prospecting_status",
      "cpf_cnpj",
      "type",
      "type_registration",
      "organization_id",
    ],
  },
  {
    source: "clients.pf",
    relation: 'public."clients.pf"',
    columns: [
      "id",
      "code",
      "name",
      "sex",
      "address",
      "city",
      "zip_code",
      "state",
      "profession",
      "father",
      "mother",
      "marital_status",
      "date_of_birth",
      "cpf",
      "rg",
      "rg_expedition",
      "rg_validity",
      "military_certificate",
      "ctps",
      "cnh",
      "cnh_expedition",
      "cnh_validity",
      "spouse",
      "status",
      "notes",
      "organization_id",
    ],
  },
  {
    source: "integracao.tasksModel",
    relation: 'public."integracao.tasksModel"',
    columns: [
      "id",
      "name",
      "department_id",
      "responsible_id",
      "responsible2_id",
      "responsible3_id",
      "observations",
      "billing",
      "prevision",
      "type",
      "organization_id",
    ],
  },
  {
    source: "integracao.projectPlan",
    relation: 'public."integracao.projectPlan"',
    columns: ["id", "name", "color", "organization_id"],
  },
  {
    source: "integracao.projectPlanTasks",
    relation: 'public."integracao.projectPlanTasks"',
    columns: ["id", "plan_id", "task_id", "order", "organization_id"],
  },
  {
    source: "integracao.projects",
    relation: 'public."integracao.projects"',
    columns: [
      "id",
      "name",
      "client_id",
      "status",
      "start_date",
      "end_date",
      "objective",
      "sponsor_id",
      "porcentage",
      "organization_id",
    ],
  },
];

const TRUNCATE_RELATIONS = [
  'public."integracao.projectPlanTasks"',
  'public."integracao.projects"',
  'public."integracao.tasksModel"',
  'public."integracao.projectPlan"',
  'public."clients.pf"',
  "public.clients",
  "public.users",
  "public.departments",
];

export async function preparePhase1Load({
  inputDir = DEFAULT_INPUT_DIR,
  outputDir = DEFAULT_OUTPUT_DIR,
  organizationId = DEFAULT_ORGANIZATION_ID,
} = {}) {
  const csvDir = path.join(outputDir, "csv");
  await mkdir(csvDir, { recursive: true });

  const tables = [];
  for (const table of PHASE1_TABLES) {
    const rows = await readJson(path.join(inputDir, `${table.source}.json`));
    const csvFile = path.join(csvDir, `${table.source}.csv`);
    await writeFile(csvFile, toCsv(rows, table.columns));
    tables.push({
      source: table.source,
      relation: table.relation,
      csvFile,
      rowCount: rows.length,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: "phase1-local-loader",
    note: "Pacote de carga parcial Fase 1. Pode escrever no Supabase apenas quando executado com o modo apply.",
    organizationId,
    inputDir,
    outputDir,
    sqlFile: path.join(outputDir, "apply-phase1.sql"),
    tables,
    counts: Object.fromEntries(tables.map((table) => [table.source, table.rowCount])),
  };

  await writeFile(
    manifest.sqlFile,
    renderApplySql({ tables: PHASE1_TABLES, outputDir, organizationId }),
  );
  await writeJson(path.join(outputDir, "manifest.phase1.json"), manifest);

  return manifest;
}

async function applyPhase1({ envFile, outputDir }) {
  const sqlFile = path.join(outputDir, "apply-phase1.sql");
  const connection = await readDatabaseConnection(envFile);
  runPsql({
    connection,
    args: ["-f", sqlFile],
    maxBuffer: 1024 * 1024 * 50,
  });
}

async function verifyPhase1({ envFile }) {
  const connection = await readDatabaseConnection(envFile);
  const sql = `
select 'departments' as table_name, count(*) from public.departments where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'users', count(*) from public.users where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'clients', count(*) from public.clients where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'clients.pf', count(*) from public."clients.pf" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'integracao.tasksModel', count(*) from public."integracao.tasksModel" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'integracao.projectPlan', count(*) from public."integracao.projectPlan" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'integracao.projectPlanTasks', count(*) from public."integracao.projectPlanTasks" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'integracao.projects', count(*) from public."integracao.projects" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
order by table_name;
`;

  return runPsql({
    connection,
    args: ["-At", "-F", "\t", "-c", sql],
    maxBuffer: 1024 * 1024 * 10,
  });
}

async function validatePhase1({ envFile }) {
  const connection = await readDatabaseConnection(envFile);
  const sql = `
with checks as (
  select 'usersDepartment' as check_name, count(*)::bigint as failures
  from public.users u
  left join public.departments d on d.id = u.department_id
  where u.organization_id = '${DEFAULT_ORGANIZATION_ID}' and d.id is null
  union all
  select 'taskModelsDepartment', count(*)::bigint
  from public."integracao.tasksModel" tm
  left join public.departments d on d.id = tm.department_id
  where tm.organization_id = '${DEFAULT_ORGANIZATION_ID}' and d.id is null
  union all
  select 'taskModelsResponsible', count(*)::bigint
  from public."integracao.tasksModel" tm
  left join public.users u on u.id = tm.responsible_id
  where tm.organization_id = '${DEFAULT_ORGANIZATION_ID}' and u.id is null
  union all
  select 'taskModelsResponsible2', count(*)::bigint
  from public."integracao.tasksModel" tm
  left join public.users u on u.id = tm.responsible2_id
  where tm.organization_id = '${DEFAULT_ORGANIZATION_ID}' and tm.responsible2_id is not null and u.id is null
  union all
  select 'taskModelsResponsible3', count(*)::bigint
  from public."integracao.tasksModel" tm
  left join public.users u on u.id = tm.responsible3_id
  where tm.organization_id = '${DEFAULT_ORGANIZATION_ID}' and tm.responsible3_id is not null and u.id is null
  union all
  select 'projectPlanTasksPlan', count(*)::bigint
  from public."integracao.projectPlanTasks" ppt
  left join public."integracao.projectPlan" pp on pp.id = ppt.plan_id
  where ppt.organization_id = '${DEFAULT_ORGANIZATION_ID}' and pp.id is null
  union all
  select 'projectPlanTasksModel', count(*)::bigint
  from public."integracao.projectPlanTasks" ppt
  left join public."integracao.tasksModel" tm on tm.id = ppt.task_id
  where ppt.organization_id = '${DEFAULT_ORGANIZATION_ID}' and tm.id is null
  union all
  select 'projectsClient', count(*)::bigint
  from public."integracao.projects" p
  left join public.clients c on c.id = p.client_id
  where p.organization_id = '${DEFAULT_ORGANIZATION_ID}' and c.id is null
  union all
  select 'projectsSponsor', count(*)::bigint
  from public."integracao.projects" p
  left join public.users u on u.id = p.sponsor_id
  where p.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.sponsor_id is not null and u.id is null
  union all
  select 'orgBadDepartments', count(*)::bigint
  from public.departments where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadUsers', count(*)::bigint
  from public.users where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadClients', count(*)::bigint
  from public.clients where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadClientPFs', count(*)::bigint
  from public."clients.pf" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadTaskModels', count(*)::bigint
  from public."integracao.tasksModel" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadProjectPlans', count(*)::bigint
  from public."integracao.projectPlan" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadProjectPlanTasks', count(*)::bigint
  from public."integracao.projectPlanTasks" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadProjects', count(*)::bigint
  from public."integracao.projects" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
)
select check_name || chr(9) || failures from checks order by check_name;
`;

  return runPsql({
    connection,
    args: ["-At", "-c", sql],
    maxBuffer: 1024 * 1024 * 10,
  });
}

function renderApplySql({ tables, outputDir, organizationId }) {
  const lines = [
    "\\set ON_ERROR_STOP on",
    "BEGIN;",
    `TRUNCATE TABLE\n  ${TRUNCATE_RELATIONS.join(",\n  ")}\nRESTART IDENTITY CASCADE;`,
    [
      "INSERT INTO public.organizations (id, name, slug, created_at, updated_at, cnpj, email_created_by, subscription_plan, status)",
      "VALUES (",
      `  ${sqlLiteral(organizationId)},`,
      "  'Castelo Contabilidade',",
      "  'castelo-contabilidade',",
      "  now(),",
      "  now(),",
      "  '12345678901234',",
      "  'migracao@placeholder.com',",
      "  'trial',",
      "  'active'",
      ")",
      "ON CONFLICT (id) DO UPDATE SET",
      "  name = EXCLUDED.name,",
      "  slug = EXCLUDED.slug,",
      "  cnpj = EXCLUDED.cnpj,",
      "  email_created_by = EXCLUDED.email_created_by,",
      "  updated_at = now();",
    ].join("\n"),
  ];

  for (const table of tables) {
    const csvFile = path.join(outputDir, "csv", `${table.source}.csv`);
    lines.push(
      `\\copy ${table.relation} (${table.columns.map(quoteIdent).join(", ")}) FROM ${sqlLiteral(
        csvFile,
      )} WITH (FORMAT csv, HEADER true, NULL '\\N');`,
    );
  }

  lines.push("COMMIT;", "");
  return lines.join("\n\n");
}

function toCsv(rows, columns) {
  const header = columns.map(csvValue).join(",");
  const body = rows.map((row) => columns.map((column) => csvValue(row[column])).join(","));
  return `${[header, ...body].join("\n")}\n`;
}

function csvValue(value) {
  if (value === null || value === undefined) {
    return "\\N";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const text = String(value);
  if (text === "\\N") {
    return '"\\\\N"';
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

async function readDatabaseConnection(envFile) {
  const env = parseEnvFile(await readFile(envFile, "utf8"));
  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL nao encontrado em ${envFile}.`);
  }

  const url = new URL(env.DATABASE_URL);
  return {
    url,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1) || "postgres",
  };
}

function runPsql({ connection, args, maxBuffer }) {
  const result = spawnSync(
    "psql",
    [
      "-h",
      connection.url.hostname,
      "-p",
      connection.url.port || "5432",
      "-U",
      connection.user,
      "-d",
      connection.database,
      "-v",
      "ON_ERROR_STOP=1",
      ...args,
    ],
    {
      encoding: "utf8",
      maxBuffer,
      env: {
        ...process.env,
        PGPASSWORD: connection.password,
        PGSSLMODE: "require",
      },
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `psql falhou com status ${result.status}`);
  }

  return result.stdout;
}

function parseEnvFile(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(argv) {
  const args = {
    command: "prepare",
    inputDir: DEFAULT_INPUT_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    envFile: DEFAULT_ENV_FILE,
    organizationId: DEFAULT_ORGANIZATION_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["prepare", "apply", "verify", "validate"].includes(arg)) {
      args.command = arg;
      continue;
    }
    if (arg === "--input-dir") {
      args.inputDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      args.outputDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--env-file") {
      args.envFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--organization-id") {
      args.organizationId = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Argumento desconhecido: ${arg}`);
  }

  return args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "prepare") {
    const manifest = await preparePhase1Load(args);
    console.log(JSON.stringify(manifest, null, 2));
  } else if (args.command === "apply") {
    await applyPhase1(args);
    console.log("phase1 apply ok");
  } else if (args.command === "verify") {
    process.stdout.write(await verifyPhase1(args));
  } else if (args.command === "validate") {
    process.stdout.write(await validatePhase1(args));
  }
}
