import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getGraphifyScope } from "./graphify-scopes.mjs";

const GRAPHIFY_API_KEYS = ["GEMINI_API_KEY", "GOOGLE_API_KEY"];

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseDotenvContent(content) {
  const values = {};
  for (const rawLine of String(content).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = withoutExport.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = withoutExport.slice(0, separatorIndex).trim();
    const value = withoutExport.slice(separatorIndex + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      continue;
    }
    values[key] = stripQuotes(value);
  }
  return values;
}

function dotenvFilesForScope(scope, cwd) {
  return [".env", ".env.local", join(scope.path, ".env"), join(scope.path, ".env.local")].map(
    (relativePath) => ({
      relativePath: relativePath.replaceAll("\\", "/"),
      absolutePath: join(cwd, relativePath),
    }),
  );
}

export function buildGraphifyEnv(scopeName, { cwd = process.cwd(), baseEnv = process.env } = {}) {
  const scope = getGraphifyScope(scopeName);
  const env = { ...baseEnv };
  const explicitKeys = new Set(
    Object.keys(baseEnv).filter((key) => baseEnv[key] !== undefined && baseEnv[key] !== ""),
  );
  const loadedFiles = [];

  for (const file of dotenvFilesForScope(scope, cwd)) {
    if (!existsSync(file.absolutePath)) {
      continue;
    }
    const values = parseDotenvContent(readFileSync(file.absolutePath, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (!explicitKeys.has(key)) {
        env[key] = value;
      }
    }
    loadedFiles.push(file.relativePath);
  }

  return {
    env,
    loadedFiles,
    hasGeminiKey: GRAPHIFY_API_KEYS.some((key) => Boolean(env[key])),
  };
}

export function renderGraphifyApiKeyHint({ hasGeminiKey, loadedFiles }) {
  if (hasGeminiKey) {
    const suffix = loadedFiles.length > 0 ? ` via ${loadedFiles.join(", ")}` : " via ambiente";
    return `Graphify API key detectada${suffix}.`;
  }
  return [
    "Graphify sem GEMINI_API_KEY/GOOGLE_API_KEY no ambiente.",
    "Para extracao semantica, defina uma dessas variaveis no shell ou em .env.local.",
    "Atualizacoes AST com graphify:update:* continuam funcionando sem chave.",
  ].join("\n");
}
