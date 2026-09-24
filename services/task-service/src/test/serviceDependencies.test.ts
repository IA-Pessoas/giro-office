import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Singletons de módulo: ler env, abrir pool ou montar recorder no import.
const SINGLETON_MODULES = [
  "../prisma/index.js",
  "../integrations/audit.js",
  "../integrations/projectProgress.js",
  "../config/env.js",
];

const servicesDir = new URL("../services/", import.meta.url);
const serviceFiles = readdirSync(servicesDir).filter(
  (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
);

function runtimeImports(source: string): string[] {
  const imports = source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gms);
  return [...imports].filter(([, typeOnly]) => !typeOnly).map(([, , path]) => path);
}

describe("serviços do task-service", () => {
  it.each(serviceFiles)("%s recebe Prisma e integrações por injeção", (file) => {
    const source = readFileSync(new URL(file, servicesDir), "utf8");
    const singletons = runtimeImports(source).filter((path) => SINGLETON_MODULES.includes(path));
    expect(singletons).toEqual([]);
  });
});
