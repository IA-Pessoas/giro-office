import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const manifestModule = await import(
  pathToFileURL(path.join(__dirname, "all-services-smoke.manifest.mjs")).href
);

const { manifest, specFiles } = manifestModule;

function extractSpecOperations(specPath, service) {
  const source = fs.readFileSync(specPath, "utf8");
  const operations = [];
  let currentPath = null;

  for (const line of source.split(/\r?\n/)) {
    const pathMatch = line.match(/^\s*"([^"]+)":\s*{$/);
    if (pathMatch && pathMatch[1].startsWith("/")) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^\s*(get|post|put|patch|delete):\s*{$/i);
    if (methodMatch && currentPath) {
      operations.push({
        service,
        method: methodMatch[1].toUpperCase(),
        path: currentPath,
      });
    }
  }

  return operations;
}

function asKey(entry) {
  return `${entry.service}|${entry.method}|${entry.path}`;
}

const specOperations = Object.entries(specFiles).flatMap(([service, relativeSpecPath]) =>
  extractSpecOperations(path.join(rootDir, relativeSpecPath), service),
);

const manifestOperations = manifest.filter((entry) => entry.specOperation !== false);

const specKeys = new Set(specOperations.map(asKey));
const manifestKeys = new Set(manifestOperations.map(asKey));

const missing = [...specKeys].filter((key) => !manifestKeys.has(key));
const extra = [...manifestKeys].filter((key) => !specKeys.has(key));

if (missing.length > 0 || extra.length > 0) {
  if (missing.length > 0) {
    console.error("Missing manifest operations:");
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
  }

  if (extra.length > 0) {
    console.error("Manifest operations not found in spec.ts:");
    for (const key of extra) {
      console.error(`  - ${key}`);
    }
  }

  process.exit(1);
}

console.log(`Smoke manifest coverage OK: ${manifestOperations.length}/${specOperations.length} operations mapped.`);
