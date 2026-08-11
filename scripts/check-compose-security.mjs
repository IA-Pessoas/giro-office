#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serviceRegistry } from "./service-registry.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const ALLOWED_HOST_PORT_SERVICES = new Set(["reverse-proxy", "web", "gateway"]);

function stripComment(line) {
  const hashIndex = line.indexOf("#");
  return hashIndex === -1 ? line : line.slice(0, hashIndex);
}

function getIndent(line) {
  const match = /^ */.exec(line);
  return match ? match[0].length : 0;
}

function parseScalarBoolean(value) {
  const normalized = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

export function parseComposeSecurityMetadata(contents) {
  const services = new Map();
  const networks = new Map();
  let topLevelSection = null;
  let currentService = null;
  let currentNetwork = null;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (line.trim().length === 0) {
      continue;
    }

    const indent = getIndent(line);
    const trimmed = line.trim();

    if (indent === 0) {
      const topLevelMatch = /^([A-Za-z0-9_.-]+):/.exec(trimmed);
      topLevelSection = topLevelMatch?.[1] ?? null;
      currentService = null;
      currentNetwork = null;
      continue;
    }

    if (topLevelSection === "services") {
      if (indent === 2) {
        const serviceMatch = /^([A-Za-z0-9_.-]+):/.exec(trimmed);
        if (serviceMatch) {
          currentService = serviceMatch[1];
          if (!services.has(currentService)) {
            services.set(currentService, { hasPorts: false });
          }
        }
        continue;
      }

      if (indent === 4 && currentService) {
        const propertyMatch = /^([A-Za-z0-9_.-]+):/.exec(trimmed);
        if (propertyMatch?.[1] === "ports") {
          services.get(currentService).hasPorts = true;
        }
      }
    }

    if (topLevelSection === "networks") {
      if (indent === 2) {
        const networkMatch = /^([A-Za-z0-9_.-]+):/.exec(trimmed);
        if (networkMatch) {
          currentNetwork = networkMatch[1];
          if (!networks.has(currentNetwork)) {
            networks.set(currentNetwork, { internal: undefined });
          }
        }
        continue;
      }

      if (indent === 4 && currentNetwork) {
        const propertyMatch = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(trimmed);
        if (propertyMatch?.[1] === "internal") {
          networks.get(currentNetwork).internal = parseScalarBoolean(propertyMatch[2]);
        }
      }
    }
  }

  return { services, networks };
}

function resolvedNetworkNames(service) {
  if (Array.isArray(service.networks)) return service.networks;
  return Object.keys(service.networks ?? {});
}

export function checkResolvedProductionSecurity(config) {
  const errors = [];
  const services = config.services ?? {};

  for (const [serviceName, service] of Object.entries(services)) {
    if ((service.ports ?? []).length > 0) {
      errors.push(`production service "${serviceName}" must not publish host ports.`);
    }

    if (serviceName !== "web" && resolvedNetworkNames(service).includes("public-edge")) {
      errors.push(`production service "${serviceName}" must not join public-edge.`);
    }
  }

  if (!resolvedNetworkNames(services.web ?? {}).includes("public-edge")) {
    errors.push('production service "web" must join public-edge.');
  }

  if (config.networks?.backend?.internal !== true) {
    errors.push('production network "backend" must remain internal.');
  }

  const publicEdge = config.networks?.["public-edge"];
  if (!publicEdge || publicEdge.external !== true || publicEdge.name !== "public-edge") {
    errors.push('production network "public-edge" must be external and named public-edge.');
  }

  return { errors };
}

async function getDefaultComposeFiles() {
  const rootEntries = await readdir(rootDir);
  return rootEntries
    .filter((entry) => /^docker-compose\.vps(?:\.slot-[A-Za-z0-9-]+)?\.yml$/.test(entry))
    .map((entry) => path.join(rootDir, entry))
    .filter((file) => existsSync(file))
    .sort();
}

export async function checkComposeSecurity({ composeFiles, registry = serviceRegistry } = {}) {
  const files = composeFiles ?? (await getDefaultComposeFiles());
  const workspaceServices = new Set(registry.map((service) => service.name));
  const errors = [];

  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const metadata = parseComposeSecurityMetadata(contents);
    const displayPath = path.relative(rootDir, file) || file;

    for (const [serviceName, service] of metadata.services) {
      if (!service.hasPorts) {
        continue;
      }

      if (!ALLOWED_HOST_PORT_SERVICES.has(serviceName)) {
        errors.push(`${displayPath}: service "${serviceName}" must not declare host ports.`);
      }

      if (workspaceServices.has(serviceName) && serviceName !== "gateway") {
        errors.push(
          `${displayPath}: workspace service "${serviceName}" must use expose, not ports.`,
        );
      }
    }

    const backendNetwork = metadata.networks.get("backend");
    if (backendNetwork && backendNetwork.internal !== true) {
      errors.push(`${displayPath}: network "backend" must set internal: true.`);
    }
  }

  return { checkedFiles: files, errors };
}

async function main() {
  const result = await checkComposeSecurity();
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`compose-security: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`compose-security: checked ${result.checkedFiles.length} compose file(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
