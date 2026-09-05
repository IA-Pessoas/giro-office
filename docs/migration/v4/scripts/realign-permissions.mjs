#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "./lib/mapping-contract.mjs";
import {
  buildPermissionRealignment,
  MODULE_COLUMNS,
  REALIGNMENT_GLOBAL_PERMISSION,
  REALIGNMENT_USER_TYPE,
} from "./lib/permission-realignment.mjs";
import { iterateSqlRows } from "./lib/sql-dump-parser.mjs";
import { uuidV5 } from "./lib/uuid-v5.mjs";

const DEFAULT_SOURCE_DIR = "/home/bruno/Documents/03.08.2026";
const DEFAULT_REPORT_PATH = new URL("../reports/permission-realignment.json", import.meta.url);
const FIXED_MODULES = Object.freeze([
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "triagem",
]);

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.tenant !== CASTELO_ORGANIZATION_ID) {
    throw new Error("O script aceita somente o tenant Castelo.");
  }
  const sourceDir = options.sourceDir ?? process.env.MIGRATION_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH.pathname;
  const sourceUsers = await readRows(sourceDir, "tb_admin.usuarios");
  const departments = await readRows(sourceDir, "tb_admin.departamentos");
  const moduleRowsByModule = Object.fromEntries(
    await Promise.all(
      FIXED_MODULES.map(async (module) => [
        module,
        await readRows(sourceDir, `tb_admin.permissoes_${module}`),
      ]),
    ),
  );
  const dynamicRows = await readRows(sourceDir, "tb_admin.permissoes");

  const client = await createPostgresClient(process.env.MIGRATION_DATABASE_URL);
  try {
    const destinationUsers = await readDestinationUsers(client, options.tenant);
    const realignment = buildPermissionRealignment({
      users: sourceUsers,
      departments,
      moduleRowsByModule,
      dynamicRows,
    });
    const destinationById = new Map(destinationUsers.map((user) => [user.id, user]));
    const actions = realignment
      .map((entry) => ({
        ...entry,
        destinationUserId: uuidV5(
          REQUIRED_IDENTITY_NAMESPACE,
          `tb_admin.usuarios:${entry.legacyUserId}`,
        ),
      }))
      .map((entry) => ({ ...entry, destination: destinationById.get(entry.destinationUserId) }))
      .filter((entry) => entry.destination !== undefined);

    const report = {
      schemaVersion: "giro-office.permission-realignment/1",
      mode: options.apply ? "apply" : "dry-run",
      writesPerformed: false,
      tenant: options.tenant,
      sourceDir,
      sourceCounts: {
        users: sourceUsers.length,
        departments: departments.length,
        dynamicPermissionRows: dynamicRows.length,
        fixedPermissionRows: FIXED_MODULES.reduce(
          (total, module) => total + moduleRowsByModule[module].length,
          0,
        ),
      },
      destinationCounts: {
        usersInTenant: destinationUsers.length,
        matchedLegacyUsers: actions.length,
        unmatchedLegacyUsers: realignment.length - actions.length,
      },
      actions: actions.length,
      invalidStatuses: actions.filter((entry) => entry.invalidStatus).length,
      conflicts: actions.reduce((total, entry) => total + entry.conflicts.length, 0),
      moduleColumns: MODULE_COLUMNS,
      globalUserProfile: {
        type: REALIGNMENT_USER_TYPE,
        permission: REALIGNMENT_GLOBAL_PERMISSION,
        first_owner_flag: false,
      },
      updatedAt: new Date().toISOString(),
    };

    if (options.apply) {
      if (process.env.MIGRATION_PERMISSION_REALIGNMENT_CONFIRM !== "1") {
        throw new Error(
          "Para aplicar, defina MIGRATION_PERMISSION_REALIGNMENT_CONFIRM=1 explicitamente.",
        );
      }
      const result = await applyRealignment(client, actions, options.tenant);
      report.writesPerformed = true;
      report.userWrites = result.userWrites;
      report.permissionWrites = result.permissionWrites;
    }

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

async function applyRealignment(client, actions, organizationId) {
  let userWrites = 0;
  let permissionWrites = 0;
  await client.query("BEGIN");
  try {
    for (const action of actions) {
      const userValues = [
        REALIGNMENT_USER_TYPE,
        REALIGNMENT_GLOBAL_PERMISSION,
        action.status,
        false,
        action.destinationUserId,
        organizationId,
      ];
      const userResult = await client.query(
        `UPDATE "users"
         SET "type" = $1,
             "permission" = $2,
             "status" = COALESCE($3, "status"),
             "first_owner_flag" = $4
         WHERE "id" = $5 AND "organization_id" = $6`,
        userValues,
      );
      if (userResult.rowCount !== 1) throw new Error("Usuário de destino não encontrado.");
      userWrites += 1;

      const permissionColumns = ["user_id", ...MODULE_COLUMNS, "organization_id"];
      const permissionValues = [
        action.destinationUserId,
        ...MODULE_COLUMNS.map((column) => action.modules[column]),
        organizationId,
      ];
      const assignments = MODULE_COLUMNS.map((column) => `"${column}" = EXCLUDED."${column}"`).join(
        ", ",
      );
      const permissionResult = await client.query(
        `INSERT INTO "permissions" ("id", ${permissionColumns.map((column) => `"${column}"`).join(", ")})
         VALUES ($1, ${permissionValues.map((_, index) => `$${index + 2}`).join(", ")})
         ON CONFLICT ("user_id", "organization_id") DO UPDATE SET ${assignments}`,
        [randomUUID(), ...permissionValues],
      );
      if (permissionResult.rowCount !== 1) throw new Error("Permissão não foi atualizada.");
      permissionWrites += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return { userWrites, permissionWrites };
}

async function readDestinationUsers(client, organizationId) {
  const result = await client.query(
    `SELECT "id", "organization_id" FROM "users" WHERE "organization_id" = $1`,
    [organizationId],
  );
  return result.rows ?? [];
}

async function readRows(sourceDir, sourceTable) {
  const rows = [];
  for await (const row of iterateSqlRows(path.join(sourceDir, `${sourceTable}.sql`)))
    rows.push(row);
  return rows;
}

async function createPostgresClient(connectionString) {
  if (typeof connectionString !== "string" || connectionString.trim().length === 0) {
    throw new Error("MIGRATION_DATABASE_URL é obrigatório.");
  }
  const requireFromInfra = createRequire(
    new URL("../../../../infra/package.json", import.meta.url),
  );
  const modulePath = requireFromInfra.resolve("pg");
  const pg = await import(pathToFileURL(modulePath).href);
  const Client = pg.Client ?? pg.default?.Client;
  if (typeof Client !== "function") throw new Error("MIGRATION_POSTGRES_CLIENT_UNAVAILABLE");
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

function parseArguments(args) {
  const options = {
    apply: args.includes("--apply"),
    tenant: CASTELO_ORGANIZATION_ID,
    sourceDir: null,
    reportPath: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--tenant") options.tenant = args[++index];
    else if (arg === "--source-dir") options.sourceDir = args[++index];
    else if (arg === "--report") options.reportPath = args[++index];
    else if (arg !== "--apply" && arg !== "--dry-run")
      throw new Error(`Argumento inválido: ${arg}`);
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
