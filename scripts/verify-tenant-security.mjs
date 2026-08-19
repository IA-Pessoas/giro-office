#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const INVENTORY_URL = new URL("../infra/prisma/tenant-ownership.json", import.meta.url);
const CLASSIFICATIONS = new Set(["tenant", "global", "system"]);

export const CATALOG_QUERY = `
SELECT n.nspname || '.' || c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema');
`;

export function validateInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    throw new TypeError("inventory deve conter ao menos uma tabela.");
  }

  const tables = new Set();
  for (const entry of inventory) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("inventory contém uma entrada inválida.");
    }
    if (typeof entry.table !== "string" || entry.table.length === 0 || tables.has(entry.table)) {
      throw new TypeError("table deve ser uma string única e não vazia.");
    }
    if (!CLASSIFICATIONS.has(entry.classification)) {
      throw new TypeError("classification deve ser tenant, global ou system.");
    }
    if (
      !Array.isArray(entry.owningServices) ||
      entry.owningServices.length === 0 ||
      entry.owningServices.some((service) => typeof service !== "string" || service.length === 0)
    ) {
      throw new TypeError("owningServices deve conter pelo menos um serviço.");
    }
    tables.add(entry.table);
  }

  return inventory;
}

export function auditCatalog(inventory, catalogRows) {
  validateInventory(inventory);
  if (!Array.isArray(catalogRows)) throw new TypeError("catálogo PostgreSQL inválido.");

  const catalog = new Map(
    catalogRows.map((row) => [
      row.table_name,
      {
        forceRowSecurityEnabled: row.relforcerowsecurity === true,
        rowSecurityEnabled: row.relrowsecurity === true,
      },
    ]),
  );
  const getCatalogEntry = (table) => catalog.get(`public.${table}`) ?? catalog.get(table);
  const missingTables = inventory.filter(({ table }) => getCatalogEntry(table) === undefined);
  if (missingTables.length > 0) {
    throw new Error(`Tabelas do inventário ausentes no catálogo: ${missingTables.map(({ table }) => table).join(", ")}.`);
  }

  return {
    catalogTableCount: catalog.size,
    inventoryTableCount: inventory.length,
    tables: inventory
      .map(({ table, classification, owningServices }) => ({
        table,
        classification,
        owningServices,
        ...getCatalogEntry(table),
      }))
      .sort((left, right) => left.table.localeCompare(right.table)),
  };
}

export async function runCli({ argv = process.argv.slice(2), dependencies = {} } = {}) {
  const databaseUrl = parseDatabaseUrl(argv);
  const runtime = {
    createReadOnlyClient,
    loadInventory,
    withReadOnlyTransaction,
    ...dependencies,
  };
  const inventory = await runtime.loadInventory();
  const client = await runtime.createReadOnlyClient(databaseUrl);
  const catalogRows = await runtime.withReadOnlyTransaction(client, async (transaction) => {
    const result = await transaction.query(CATALOG_QUERY);
    return result.rows;
  });
  return auditCatalog(inventory, catalogRows);
}

async function loadInventory() {
  const inventory = JSON.parse(await readFile(INVENTORY_URL, "utf8"));
  return validateInventory(inventory);
}

function parseDatabaseUrl(argv) {
  if (argv.length !== 2 || argv[0] !== "--database-url" || argv[1].length === 0) {
    throw new Error("--database-url é obrigatório.");
  }
  return argv[1];
}

async function createReadOnlyClient(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol) || url.hostname.length === 0) {
    throw new Error("--database-url deve ser uma URL PostgreSQL válida.");
  }

  const require = createRequire(new URL("../services/src/package.json", import.meta.url));
  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

async function withReadOnlyTransaction(client, callback) {
  let started = false;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    started = true;
    const result = await callback(client);
    await client.query("COMMIT");
    started = false;
    return result;
  } catch (error) {
    if (started) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  runCli()
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(
        error.message === "--database-url é obrigatório."
          ? `${error.message}\n`
          : "Falha ao verificar a segurança de tenant.\n",
      );
      process.exitCode = 1;
    });
}
