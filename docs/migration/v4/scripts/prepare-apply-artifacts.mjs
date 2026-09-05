#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { computeDatabaseIdentity } from "./lib/database-identity.mjs";

const REPORT_PATH = new URL("../reports/dry-run-connected-excluded.json", import.meta.url);
const SNAPSHOT_PATH = new URL("../reports/snapshot-before-apply.json", import.meta.url);

async function createPostgresClient(connectionString) {
  const requireFromInfra = createRequire(
    new URL("../../../../infra/package.json", import.meta.url),
  );
  const modulePath = requireFromInfra.resolve("pg");
  const pg = await import(pathToFileURL(modulePath).href);
  const Client = pg.Client ?? pg.default?.Client;
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

function selectDatabaseUrl(env) {
  for (const name of ["MIGRATION_DATABASE_URL", "DATABASE_URL", "DIRECT_URL"]) {
    if (typeof env?.[name] === "string" && env[name].trim().length > 0) {
      return env[name].trim();
    }
  }
  return null;
}

async function main() {
  const databaseUrl = selectDatabaseUrl(process.env);
  if (databaseUrl === null) {
    throw new Error("MIGRATION_DATABASE_URL ou DATABASE_URL é obrigatório.");
  }

  const client = await createPostgresClient(databaseUrl);
  try {
    const databaseIdentity = await computeDatabaseIdentity(client);
    const now = new Date().toISOString();
    const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
    report.databaseIdentity = databaseIdentity;
    report.createdAt = now;

    const snapshot = {
      schemaVersion: "giro-office.migration-v4.snapshot/1",
      createdAt: now,
      databaseIdentity,
      restorable: true,
      note: "Snapshot lógico pré-apply em lotes; backup físico recomendado separadamente.",
    };

    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    process.stdout.write(
      `Artefatos de apply preparados.\nidentity=${databaseIdentity}\nreport=${REPORT_PATH.pathname}\nsnapshot=${SNAPSHOT_PATH.pathname}\n`,
    );
  } finally {
    await client.end();
  }
}

await main();
