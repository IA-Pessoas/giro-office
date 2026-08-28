import { Client } from "pg";

export const GLOBAL_LOGIN_DUPLICATES_QUERY = [
  "SELECT u.login",
  'FROM "users" AS u',
  "GROUP BY u.login",
  "HAVING COUNT(*) > 1",
  "ORDER BY u.login ASC",
].join("\n");

export const GLOBAL_LOGIN_COLLISIONS_QUERY = [
  "SELECT",
  '  u.login AS "login",',
  '  u.id AS "userId",',
  '  u.status AS "userStatus",',
  '  o.id AS "organizationId",',
  '  o.status::text AS "organizationStatus"',
  'FROM "users" AS u',
  'LEFT JOIN "organizations" AS o ON o.id = u.organization_id',
  "WHERE u.login = ANY($1::text[])",
  "ORDER BY u.login ASC, u.id ASC",
].join("\n");

const BEGIN_READ_ONLY = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY";

export async function runGlobalLoginCollisionPreflight({ client }) {
  let transactionStarted = false;
  try {
    await client.connect();
    await client.query(BEGIN_READ_ONLY);
    transactionStarted = true;

    const duplicateLogins = readDuplicateLogins(await client.query(GLOBAL_LOGIN_DUPLICATES_QUERY));
    const rows =
      duplicateLogins.length === 0
        ? []
        : readCollisionRows(
            await client.query({ text: GLOBAL_LOGIN_COLLISIONS_QUERY, values: [duplicateLogins] }),
          );
    const report = buildGlobalLoginCollisionReport(rows);

    await client.query("COMMIT");
    transactionStarted = false;
    return report;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        throw new Error("Falha ao encerrar o preflight somente leitura.", { cause: error });
      }
    }
    throw error;
  } finally {
    await client.end();
  }
}

export function buildGlobalLoginCollisionReport(rows) {
  const collisionsByLogin = new Map();
  for (const row of rows) {
    const users = collisionsByLogin.get(row.login) ?? [];
    users.push({
      organizationId: row.organizationId,
      organizationStatus: row.organizationStatus,
      userId: row.userId,
      userStatus: row.userStatus,
    });
    collisionsByLogin.set(row.login, users);
  }

  const collisions = [...collisionsByLogin].map(([login, users]) => ({ login, users }));
  const readyForMigration = collisions.length === 0;
  return {
    collisionCount: collisions.length,
    collisions,
    migrationStatus: readyForMigration ? "READY" : "BLOCKED_BY_GLOBAL_LOGIN_COLLISIONS",
    readyForMigration,
    transactionMode: "READ ONLY",
    writesPerformed: false,
  };
}

export async function runCli({
  env = process.env,
  stderr = process.stderr,
  stdout = process.stdout,
  createClient = createPostgresClient,
} = {}) {
  try {
    const databaseUrl = env.DATABASE_URL;
    if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
      throw new Error("DATABASE_URL ausente.");
    }

    const report = await runGlobalLoginCollisionPreflight({
      client: createClient({ databaseUrl }),
    });
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.readyForMigration ? 0 : 2;
  } catch {
    stderr.write("Falha técnica no preflight de colisões globais de login.\n");
    return 1;
  }
}

function createPostgresClient({ databaseUrl }) {
  return new Client({ connectionString: databaseUrl });
}

function readDuplicateLogins(result) {
  if (!Array.isArray(result?.rows)) throw new Error("Resposta de banco inválida.");
  return result.rows.map(({ login }) => requireText(login, "login"));
}

function readCollisionRows(result) {
  if (!Array.isArray(result?.rows)) throw new Error("Resposta de banco inválida.");
  return result.rows.map((row) => ({
    login: requireText(row.login, "login"),
    organizationId: optionalText(row.organizationId, "organizationId"),
    organizationStatus: optionalText(row.organizationStatus, "organizationStatus"),
    userId: requireText(row.userId, "userId"),
    userStatus: requireText(row.userStatus, "userStatus"),
  }));
}

function optionalText(value, label) {
  return value === null ? null : requireText(value, label);
}

function requireText(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} inválido na resposta de banco.`);
  }
  return value;
}

if (import.meta.filename === process.argv[1]) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
