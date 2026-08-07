#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const DEFAULT_INPUT_DIR = "/tmp/giro-office-migration-v2/load";
const DEFAULT_OUTPUT_DIR = "/tmp/giro-office-migration-v2/phase2";
const DEFAULT_ENV_FILE = ".env";

export const PHASE2_TABLES = [
  {
    source: "integracao.tasks",
    relation: 'public."integracao.tasks"',
    columns: [
      "id",
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
      "start_date",
      "prevision_date",
      "end_date",
      "date_created",
      "date_updated",
      "meeting",
      "organization_id",
    ],
  },
  {
    source: "regularize.license",
    relation: 'public."regularize.license"',
    columns: [
      "id",
      "client_id",
      "has",
      "type_license",
      "entry_date",
      "protocol",
      "responsible_id",
      "status",
      "date_last_consultation",
      "current_situation",
      "contact",
      "observation",
      "urgency",
      "type",
      "due_date",
      "task_id",
      "organization_id",
    ],
  },
  {
    source: "regularize.process",
    relation: 'public."regularize.process"',
    columns: [
      "id",
      "client_pj_id",
      "client_pf_id",
      "cpf_cnpj",
      "process_type",
      "description",
      "entry_date",
      "completion_date",
      "expected_date",
      "status",
      "observation",
      "responsible1_id",
      "responsible2_id",
      "responsible3_id",
      "locking_type",
      "urgency",
      "task_id",
      "organization_id",
    ],
  },
  {
    source: "regularize.proceduralGuidances",
    relation: 'public."regularize.proceduralGuidances"',
    columns: [
      "id",
      "process_id",
      "type",
      "request",
      "framework_obs",
      "legal_nature",
      "company_name",
      "trade_name",
      "cpf_cnpj",
      "share_capital",
      "iptu",
      "address",
      "comporate_purpose",
      "carryng",
      "regime",
      "legal_representative",
      "status",
      "economic_activities",
      "partners",
      "organization_id",
    ],
  },
  {
    source: "regularize.partners",
    relation: 'public."regularize.partners"',
    columns: ["id", "pj_id", "pf_id", "part", "entry", "exit", "organization_id"],
  },
  {
    source: "regularize.municipalTaxes",
    relation: 'public."regularize.municipalTaxes"',
    columns: [
      "id",
      "client_id",
      "year",
      "tff_is_applicable",
      "tff_amount",
      "tff_notes",
      "tff_analysis_is_done",
      "tff_analysis_notes",
      "tff_sent_date",
      "tff_due_date",
      "tlp_is_applicable",
      "tlp_amount",
      "tlp_notes",
      "tlp_is_sent",
      "tlp_sent_date",
      "tlp_due_date",
      "tlp_not_email",
      "tll_is_applicable",
      "tll_amount",
      "tll_notes",
      "tll_is_sent",
      "tll_sent_date",
      "tll_due_date",
      "tll_analysis_is_done",
      "tll_analysis_notes",
      "organization_id",
    ],
  },
  {
    source: "regularize.passowordsSites",
    relation: 'public."regularize.passowordsSites"',
    columns: ["id", "name", "sphere", "link", "user", "password", "status", "organization_id"],
  },
  {
    source: "regularize.passwordsRegularize",
    relation: 'public."regularize.passwordsRegularize"',
    columns: ["id", "client_id", "site_id", "login", "password", "notes", "organization_id"],
  },
];

const TRUNCATE_RELATIONS = [
  'public."regularize.passwordsRegularize"',
  'public."regularize.municipalTaxes"',
  'public."regularize.partners"',
  'public."regularize.proceduralGuidances"',
  'public."regularize.process"',
  'public."regularize.license"',
  'public."regularize.passowordsSites"',
  'public."integracao.tasks"',
];

export async function preparePhase2Load({
  inputDir = DEFAULT_INPUT_DIR,
  outputDir = DEFAULT_OUTPUT_DIR,
  organizationId = DEFAULT_ORGANIZATION_ID,
} = {}) {
  const csvDir = path.join(outputDir, "csv");
  await mkdir(csvDir, { recursive: true });

  const tables = [];
  for (const table of PHASE2_TABLES) {
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
    mode: "phase2-local-loader",
    note: "Pacote de carga parcial Fase 2. Pode escrever no Supabase apenas quando executado com o modo apply.",
    organizationId,
    inputDir,
    outputDir,
    sqlFile: path.join(outputDir, "apply-phase2.sql"),
    tables,
    counts: Object.fromEntries(tables.map((table) => [table.source, table.rowCount])),
  };

  await writeFile(manifest.sqlFile, renderApplySql({ tables: PHASE2_TABLES, outputDir }));
  await writeJson(path.join(outputDir, "manifest.phase2.json"), manifest);

  return manifest;
}

async function applyPhase2({ envFile, outputDir }) {
  const connection = await readDatabaseConnection(envFile);
  runPsql({
    connection,
    args: ["-f", path.join(outputDir, "apply-phase2.sql")],
    maxBuffer: 1024 * 1024 * 80,
  });
}

async function verifyPhase2({ envFile }) {
  const connection = await readDatabaseConnection(envFile);
  const sql = `
select 'integracao.tasks' as table_name, count(*) from public."integracao.tasks" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'regularize.license', count(*) from public."regularize.license" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'regularize.process', count(*) from public."regularize.process" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'regularize.proceduralGuidances', count(*) from public."regularize.proceduralGuidances" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'regularize.partners', count(*) from public."regularize.partners" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'regularize.municipalTaxes', count(*) from public."regularize.municipalTaxes" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'regularize.passowordsSites', count(*) from public."regularize.passowordsSites" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
union all select 'regularize.passwordsRegularize', count(*) from public."regularize.passwordsRegularize" where organization_id = '${DEFAULT_ORGANIZATION_ID}'
order by table_name;
`;

  return runPsql({
    connection,
    args: ["-At", "-F", "\t", "-c", sql],
    maxBuffer: 1024 * 1024 * 10,
  });
}

async function validatePhase2({ envFile }) {
  const connection = await readDatabaseConnection(envFile);
  const sql = `
with checks as (
  select 'tasksModel' as check_name, count(*)::bigint as failures
  from public."integracao.tasks" t
  left join public."integracao.tasksModel" tm on tm.id = t.model_id
  where t.organization_id = '${DEFAULT_ORGANIZATION_ID}' and tm.id is null
  union all
  select 'tasksProject', count(*)::bigint
  from public."integracao.tasks" t
  left join public."integracao.projects" p on p.id = t.project_id
  where t.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.id is null
  union all
  select 'tasksClient', count(*)::bigint
  from public."integracao.tasks" t
  left join public.clients c on c.id = t.client_id
  where t.organization_id = '${DEFAULT_ORGANIZATION_ID}' and c.id is null
  union all
  select 'tasksDepartment', count(*)::bigint
  from public."integracao.tasks" t
  left join public.departments d on d.id = t.department_id
  where t.organization_id = '${DEFAULT_ORGANIZATION_ID}' and d.id is null
  union all
  select 'tasksResponsible', count(*)::bigint
  from public."integracao.tasks" t
  left join public.users u on u.id = t.responsible_id
  where t.organization_id = '${DEFAULT_ORGANIZATION_ID}' and u.id is null
  union all
  select 'tasksResponsible2', count(*)::bigint
  from public."integracao.tasks" t
  left join public.users u on u.id = t.responsible2_id
  where t.organization_id = '${DEFAULT_ORGANIZATION_ID}' and t.responsible2_id is not null and u.id is null
  union all
  select 'tasksResponsible3', count(*)::bigint
  from public."integracao.tasks" t
  left join public.users u on u.id = t.responsible3_id
  where t.organization_id = '${DEFAULT_ORGANIZATION_ID}' and t.responsible3_id is not null and u.id is null
  union all
  select 'licenseClient', count(*)::bigint
  from public."regularize.license" l
  left join public.clients c on c.id = l.client_id
  where l.organization_id = '${DEFAULT_ORGANIZATION_ID}' and l.client_id is not null and c.id is null
  union all
  select 'licenseResponsible', count(*)::bigint
  from public."regularize.license" l
  left join public.users u on u.id = l.responsible_id
  where l.organization_id = '${DEFAULT_ORGANIZATION_ID}' and l.responsible_id is not null and u.id is null
  union all
  select 'licenseTask', count(*)::bigint
  from public."regularize.license" l
  left join public."integracao.tasks" t on t.id = l.task_id
  where l.organization_id = '${DEFAULT_ORGANIZATION_ID}' and l.task_id is not null and t.id is null
  union all
  select 'processClientPJ', count(*)::bigint
  from public."regularize.process" p
  left join public.clients c on c.id = p.client_pj_id
  where p.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.client_pj_id is not null and c.id is null
  union all
  select 'processClientPF', count(*)::bigint
  from public."regularize.process" p
  left join public."clients.pf" pf on pf.id = p.client_pf_id
  where p.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.client_pf_id is not null and pf.id is null
  union all
  select 'processTask', count(*)::bigint
  from public."regularize.process" p
  left join public."integracao.tasks" t on t.id = p.task_id
  where p.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.task_id is not null and t.id is null
  union all
  select 'processResponsible1', count(*)::bigint
  from public."regularize.process" p
  left join public.users u on u.id = p.responsible1_id
  where p.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.responsible1_id is not null and u.id is null
  union all
  select 'processResponsible2', count(*)::bigint
  from public."regularize.process" p
  left join public.users u on u.id = p.responsible2_id
  where p.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.responsible2_id is not null and u.id is null
  union all
  select 'processResponsible3', count(*)::bigint
  from public."regularize.process" p
  left join public.users u on u.id = p.responsible3_id
  where p.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.responsible3_id is not null and u.id is null
  union all
  select 'guidanceProcess', count(*)::bigint
  from public."regularize.proceduralGuidances" g
  left join public."regularize.process" p on p.id = g.process_id
  where g.organization_id = '${DEFAULT_ORGANIZATION_ID}' and p.id is null
  union all
  select 'partnersPJ', count(*)::bigint
  from public."regularize.partners" rp
  left join public.clients c on c.id = rp.pj_id
  where rp.organization_id = '${DEFAULT_ORGANIZATION_ID}' and c.id is null
  union all
  select 'partnersPF', count(*)::bigint
  from public."regularize.partners" rp
  left join public."clients.pf" pf on pf.id = rp.pf_id
  where rp.organization_id = '${DEFAULT_ORGANIZATION_ID}' and pf.id is null
  union all
  select 'municipalTaxesClient', count(*)::bigint
  from public."regularize.municipalTaxes" mt
  left join public.clients c on c.id = mt.client_id
  where mt.organization_id = '${DEFAULT_ORGANIZATION_ID}' and c.id is null
  union all
  select 'passwordsClient', count(*)::bigint
  from public."regularize.passwordsRegularize" pr
  left join public.clients c on c.id = pr.client_id
  where pr.organization_id = '${DEFAULT_ORGANIZATION_ID}' and c.id is null
  union all
  select 'passwordsSite', count(*)::bigint
  from public."regularize.passwordsRegularize" pr
  left join public."regularize.passowordsSites" ps on ps.id = pr.site_id
  where pr.organization_id = '${DEFAULT_ORGANIZATION_ID}' and ps.id is null
  union all
  select 'orgBadTasks', count(*)::bigint from public."integracao.tasks" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadLicense', count(*)::bigint from public."regularize.license" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadProcess', count(*)::bigint from public."regularize.process" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadGuidance', count(*)::bigint from public."regularize.proceduralGuidances" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadPartners', count(*)::bigint from public."regularize.partners" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadMunicipalTaxes', count(*)::bigint from public."regularize.municipalTaxes" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadPasswordSites', count(*)::bigint from public."regularize.passowordsSites" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
  union all
  select 'orgBadPasswords', count(*)::bigint from public."regularize.passwordsRegularize" where organization_id <> '${DEFAULT_ORGANIZATION_ID}'
)
select check_name || chr(9) || failures from checks order by check_name;
`;

  return runPsql({
    connection,
    args: ["-At", "-c", sql],
    maxBuffer: 1024 * 1024 * 10,
  });
}

function renderApplySql({ tables, outputDir }) {
  const lines = [
    "\\set ON_ERROR_STOP on",
    "BEGIN;",
    `TRUNCATE TABLE\n  ${TRUNCATE_RELATIONS.join(",\n  ")}\nRESTART IDENTITY CASCADE;`,
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
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
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
    const manifest = await preparePhase2Load(args);
    console.log(JSON.stringify(manifest, null, 2));
  } else if (args.command === "apply") {
    await applyPhase2(args);
    console.log("phase2 apply ok");
  } else if (args.command === "verify") {
    process.stdout.write(await verifyPhase2(args));
  } else if (args.command === "validate") {
    process.stdout.write(await validatePhase2(args));
  }
}
