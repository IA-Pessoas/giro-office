import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function tablesOf(schemaPath: string): Map<string, string> {
  const source = readFileSync(new URL(schemaPath, import.meta.url), "utf8");
  const tables = new Map<string, string>();
  for (const [, name, body] of source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gmu)) {
    tables.set(name, /@@map\("([^"]+)"\)/u.exec(body)?.[1] ?? name);
  }
  return tables;
}

describe("Worker Prisma schema", () => {
  it("maps every model to the same table as the canonical schema", () => {
    const canonical = tablesOf("../../../infra/prisma/schema.prisma");
    const mismatched = [...tablesOf("../prisma/schema.prisma")]
      .filter(([model, table]) => canonical.has(model) && canonical.get(model) !== table)
      .map(([model, table]) => `${model}: ${table} != ${canonical.get(model)}`);

    expect(mismatched).toEqual([]);
  });
});
