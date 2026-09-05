#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envRoot = path.resolve(process.argv[2] ?? root);
const composePath = path.join(root, "docker-compose.vps.yml");
const poolConstructorPattern = /new\s+(?:PrismaPg|Pool)\s*\(/u;
const ignoredDirectories = new Set(["dist", "generated", "node_modules", "test", "tests"]);

function containsRuntimePool(directory) {
  if (!fs.existsSync(directory)) return false;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (
        !ignoredDirectories.has(entry.name) &&
        containsRuntimePool(path.join(directory, entry.name))
      ) {
        return true;
      }
      continue;
    }
    if (entry.isFile() && /\.[cm]?[jt]s$/u.test(entry.name)) {
      if (poolConstructorPattern.test(fs.readFileSync(path.join(directory, entry.name), "utf8"))) {
        return true;
      }
    }
  }
  return false;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} deve ser um inteiro positivo`);
  }
  return parsed;
}

function readPoolMax(envFile) {
  if (!fs.existsSync(envFile)) {
    throw new Error(`arquivo de ambiente ausente: ${path.basename(envFile)}`);
  }
  const match = fs.readFileSync(envFile, "utf8").match(/^DATABASE_POOL_MAX=(.*)$/mu);
  return match
    ? parsePositiveInteger(match[1].trim(), `${path.basename(envFile)}:DATABASE_POOL_MAX`)
    : 1;
}

try {
  const serviceDirectories = fs
    .readdirSync(path.join(root, "services"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => containsRuntimePool(path.join(root, "services", entry.name, "src")))
    .map((entry) => entry.name);
  const poolServices = new Set(serviceDirectories);
  const compose = fs.readFileSync(composePath, "utf8");
  const envNames = [...compose.matchAll(/- \.env\.vps\.([a-z0-9-]+)/gu)]
    .map((match) => match[1])
    .filter((name) => poolServices.has(name));

  if (envNames.length === 0) {
    throw new Error("nenhum processo com pool foi descoberto no Compose VPS");
  }

  const steadySlots = envNames.reduce(
    (total, name) => total + readPoolMax(path.join(envRoot, `.env.vps.${name}`)),
    0,
  );
  const poolerSize = parsePositiveInteger(process.env.DATABASE_POOLER_SIZE, "DATABASE_POOLER_SIZE");
  const rolloutSlots = steadySlots * 2;
  if (rolloutSlots > poolerSize) {
    throw new Error(`rollout requer ${rolloutSlots} slots, mas o pooler possui ${poolerSize}`);
  }

  process.stdout.write(
    `database-pool-budget steady=${steadySlots} rollout=${rolloutSlots} pooler=${poolerSize}\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
