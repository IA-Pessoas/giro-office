#!/usr/bin/env node
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { uuidV5 as uuidV5FromStringNamespace } from "./migration-v2-build-load.mjs";

const DEFAULT_LEGACY_DIR = "/home/bruno/Documents/06.07.2026";
const DEFAULT_ENV_FILE = ".env";
const DEFAULT_OUTPUT_DIR = "/tmp/giro-office-rh-requester-correction";
const RH_REQUEST_NAMESPACE = "3f68d246-0b54-4a10-9415-a8845a767fb5";
const USER_NAMESPACE = "giro-office:migration:v2:castelo-contabilidade";

export function requestIdForLegacyRhRequest(legacyId) {
  return uuidV5FromUuidNamespace(RH_REQUEST_NAMESPACE, `rh.requests:${legacyId}`);
}

export function userIdForLegacyAdminUser(legacyId) {
  return uuidV5FromStringNamespace(USER_NAMESPACE, `user:${legacyId}`);
}

export function buildRequesterCorrectionPlan({
  legacyRequests,
  legacyCollaborators,
  currentRequests,
  currentUsers,
}) {
  const collaboratorsByLegacyId = new Map(legacyCollaborators.map((row) => [String(row.id), row]));
  const currentRequestsById = new Map(currentRequests.map((row) => [row.id, row]));
  const currentUsersById = new Map(currentUsers.map((row) => [row.id, row]));

  const ok = [];
  const corrections = [];
  const skipped = [];

  for (const legacyRequest of legacyRequests) {
    const legacyRequestId = String(legacyRequest.id);
    const legacyRequesterCollaboratorId = String(legacyRequest.requerente ?? "");
    const requestId = requestIdForLegacyRhRequest(legacyRequestId);
    const currentRequest = currentRequestsById.get(requestId);

    if (!currentRequest) {
      skipped.push({
        reason: "missing-current-request",
        legacyRequestId,
        requestId,
        title: legacyRequest.titulo ?? null,
      });
      continue;
    }

    const collaborator = collaboratorsByLegacyId.get(legacyRequesterCollaboratorId);
    if (!collaborator) {
      skipped.push({
        reason: "missing-legacy-collaborator",
        legacyRequestId,
        requestId,
        legacyRequesterCollaboratorId,
        title: legacyRequest.titulo ?? null,
      });
      continue;
    }

    const legacyRequesterUserId = String(collaborator.user_id ?? "");
    const expectedRequesterUserId = userIdForLegacyAdminUser(legacyRequesterUserId);
    const expectedRequester = currentUsersById.get(expectedRequesterUserId);

    if (!expectedRequester) {
      skipped.push({
        reason: "missing-current-user",
        legacyRequestId,
        requestId,
        legacyRequesterCollaboratorId,
        legacyRequesterUserId,
        expectedRequesterUserId,
        legacyRequesterName: collaborator.nome ?? null,
        title: legacyRequest.titulo ?? null,
      });
      continue;
    }

    const currentRequester = currentUsersById.get(currentRequest.requester_user_id);
    const entry = {
      legacyRequestId,
      requestId,
      title: currentRequest.title ?? legacyRequest.titulo ?? null,
      legacyRequesterCollaboratorId,
      legacyRequesterUserId,
      legacyRequesterName: collaborator.nome ?? null,
      currentRequesterUserId: currentRequest.requester_user_id,
      currentRequesterName: currentRequester?.name ?? currentRequester?.full_name ?? null,
      currentRequesterLogin: currentRequester?.login ?? null,
      expectedRequesterUserId,
      expectedRequesterName: expectedRequester.name ?? expectedRequester.full_name ?? null,
      expectedRequesterLogin: expectedRequester.login ?? null,
    };

    if (currentRequest.requester_user_id === expectedRequesterUserId) {
      ok.push(entry);
    } else {
      corrections.push(entry);
    }
  }

  return {
    summary: {
      legacyRequests: legacyRequests.length,
      currentRequests: currentRequests.length,
      currentUsers: currentUsers.length,
      ok: ok.length,
      corrections: corrections.length,
      skipped: skipped.length,
      skippedByReason: countBy(skipped, "reason"),
    },
    ok,
    corrections,
    skipped,
  };
}

export function parseLegacyInsertDump(sql) {
  const rows = [];

  for (const block of extractInsertBlocks(sql)) {
    const columns = [...block.columnsSql.matchAll(/\x60([^\x60]+)\x60/g)].map(
      (columnMatch) => columnMatch[1],
    );
    for (const values of parseSqlValueTuples(block.valuesSql)) {
      const row = {};
      columns.forEach((column, index) => {
        row[column] = values[index] ?? null;
      });
      rows.push(row);
    }
  }

  return rows;
}

function extractInsertBlocks(sql) {
  const headerRegex = /INSERT INTO\s+\x60[^\x60]+\x60\s+\(([^)]+)\)\s+VALUES\s*/gi;
  const blocks = [];

  for (const match of sql.matchAll(headerRegex)) {
    let index = match.index + match[0].length;
    let inString = false;
    let escaping = false;

    while (index < sql.length) {
      const char = sql[index];
      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === String.fromCharCode(39)) {
          inString = false;
        }
      } else if (char === String.fromCharCode(39)) {
        inString = true;
      } else if (char === ";") {
        blocks.push({
          columnsSql: match[1],
          valuesSql: sql.slice(match.index + match[0].length, index),
        });
        break;
      }
      index += 1;
    }
  }

  return blocks;
}

function parseSqlValueTuples(valuesSql) {
  const rows = [];
  let currentRow = null;
  let currentValue = "";
  let inString = false;
  let escaping = false;
  let tupleDepth = 0;

  const pushValue = () => {
    if (!currentRow) return;
    currentRow.push(normalizeSqlValue(currentValue));
    currentValue = "";
  };

  for (const char of valuesSql) {
    if (inString) {
      if (escaping) {
        currentValue += char;
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "'") {
        inString = false;
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === "(") {
      if (tupleDepth === 0) {
        currentRow = [];
        currentValue = "";
      } else {
        currentValue += char;
      }
      tupleDepth += 1;
      continue;
    }

    if (char === ")") {
      tupleDepth -= 1;
      if (tupleDepth === 0) {
        pushValue();
        rows.push(currentRow);
        currentRow = null;
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === "," && tupleDepth === 1) {
      pushValue();
      continue;
    }

    if (tupleDepth > 0) {
      currentValue += char;
    }
  }

  return rows;
}

function normalizeSqlValue(value) {
  const trimmed = value.trim();
  if (/^null$/i.test(trimmed)) return null;
  return trimmed;
}

function uuidV5FromUuidNamespace(namespace, value) {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = crypto
    .createHash("sha1")
    .update(Buffer.concat([namespaceBytes, Buffer.from(String(value))]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1;
    return counts;
  }, {});
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const legacyRequests = await readLegacyTable(args.legacyDir, "tb_rh.solicitacoes.sql");
  const legacyCollaborators = await readLegacyTable(args.legacyDir, "tb_rh.colaboradores.sql");
  const client = await connectPg(args.envFile);

  try {
    const currentRequests = (
      await client.query(
        'select id, title, requester_user_id from public."rh.requests" order by created_at asc, id asc',
      )
    ).rows;
    const currentUsers = (
      await client.query("select id, name, login, full_name, status from public.users")
    ).rows;
    const plan = buildRequesterCorrectionPlan({
      legacyRequests,
      legacyCollaborators,
      currentRequests,
      currentUsers,
    });

    await writeReport(args.outputDir, plan);
    printSummary(plan, args);

    if (!args.apply) {
      return;
    }

    await applyCorrections(client, plan.corrections);
    const after = await verifyApplied(client, plan.corrections);
    await writeFile(
      path.join(args.outputDir, "verify-after.json"),
      `${JSON.stringify(after, null, 2)}\n`,
    );
    console.log(`Applied corrections: ${plan.corrections.length}`);
    console.log(`Verification mismatches after apply: ${after.mismatches.length}`);
    if (after.mismatches.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

async function readLegacyTable(legacyDir, filename) {
  return parseLegacyInsertDump(await readFile(path.join(legacyDir, filename), "utf8"));
}

function parseArgs(argv) {
  const args = {
    apply: false,
    envFile: DEFAULT_ENV_FILE,
    legacyDir: DEFAULT_LEGACY_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--env-file") {
      index += 1;
      args.envFile = requireValue(argv, index, arg);
    } else if (arg === "--legacy-dir") {
      index += 1;
      args.legacyDir = requireValue(argv, index, arg);
    } else if (arg === "--output-dir") {
      index += 1;
      args.outputDir = requireValue(argv, index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

async function connectPg(envFile) {
  const env = await readEnvFile(envFile);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL not found in ${envFile}`);
  }

  const pgModule = await import("../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js");
  const pg = pgModule.default ?? pgModule;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

async function readEnvFile(envFile) {
  const content = await readFile(envFile, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

async function writeReport(outputDir, plan) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "summary.json"),
    `${JSON.stringify(plan.summary, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "corrections.json"),
    `${JSON.stringify(plan.corrections, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "skipped.json"),
    `${JSON.stringify(plan.skipped, null, 2)}\n`,
  );
  await writeFile(path.join(outputDir, "ok.json"), `${JSON.stringify(plan.ok, null, 2)}\n`);
  await writeFile(path.join(outputDir, "apply.sql"), renderApplySql(plan.corrections));
}

function renderApplySql(corrections) {
  if (corrections.length === 0) return "-- No corrections required.\n";

  const values = corrections
    .map(
      (row) =>
        `  (${sqlString(row.requestId)}, ${sqlString(row.expectedRequesterUserId)}, ${sqlString(
          row.currentRequesterUserId,
        )})`,
    )
    .join(",\n");

  return `begin;

with corrections(id, expected_requester_user_id, previous_requester_user_id) as (
values
${values}
)
update public."rh.requests" request
set requester_user_id = corrections.expected_requester_user_id
from corrections
where request.id = corrections.id
  and request.requester_user_id = corrections.previous_requester_user_id;

commit;
`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function printSummary(plan, args) {
  console.log(JSON.stringify(plan.summary, null, 2));
  console.log(`Report written to ${args.outputDir}`);
  console.log(args.apply ? "Mode: apply" : "Mode: dry-run");
}

async function applyCorrections(client, corrections) {
  if (corrections.length === 0) return { updated: 0 };

  const { valuesSql, params } = buildCorrectionValues(corrections, [
    "requestId",
    "expectedRequesterUserId",
    "currentRequesterUserId",
  ]);

  await client.query("begin");
  try {
    const result = await client.query(
      `with corrections(id, expected_requester_user_id, previous_requester_user_id) as (
values
${valuesSql}
)
update public."rh.requests" request
set requester_user_id = corrections.expected_requester_user_id
from corrections
where request.id = corrections.id
  and request.requester_user_id = corrections.previous_requester_user_id`,
      params,
    );
    if (result.rowCount !== corrections.length) {
      throw new Error(`Expected to update ${corrections.length} rows, updated ${result.rowCount}`);
    }
    await client.query("commit");
    return { updated: result.rowCount };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function verifyApplied(client, corrections) {
  if (corrections.length === 0) {
    return {
      checked: 0,
      mismatches: [],
    };
  }

  const { valuesSql, params } = buildCorrectionValues(corrections, [
    "requestId",
    "expectedRequesterUserId",
  ]);
  const result = await client.query(
    `with expected(id, expected_requester_user_id) as (
values
${valuesSql}
)
select
  expected.id::text as "requestId",
  expected.expected_requester_user_id::text as "expectedRequesterUserId",
  request.requester_user_id::text as "actualRequesterUserId"
from expected
left join public."rh.requests" request on request.id = expected.id
where request.id is null
  or request.requester_user_id is distinct from expected.expected_requester_user_id`,
    params,
  );

  return {
    checked: corrections.length,
    mismatches: result.rows,
  };
}

function buildCorrectionValues(corrections, fields) {
  const params = [];
  const valuesSql = corrections
    .map((correction) => {
      const placeholders = fields.map((field) => {
        params.push(correction[field]);
        return `$${params.length}::uuid`;
      });
      return `  (${placeholders.join(", ")})`;
    })
    .join(",\n");

  return { valuesSql, params };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
