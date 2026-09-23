import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Table = { fields: string[]; updatedAt: string[] };

function tablesOf(schemaPath: string): Map<string, Table> {
  const source = readFileSync(new URL(schemaPath, import.meta.url), "utf8");
  const tables = new Map<string, Table>();
  for (const [, name, body] of source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gmu)) {
    tables.set(/@@map\("([^"]+)"\)/u.exec(body)?.[1] ?? name, {
      fields: [...body.matchAll(/^ {2}(\w+)\s/gmu)].map(([, field]) => field),
      updatedAt: [...body.matchAll(/^ {2}(\w+)\s+DateTime\S*\s[^\n]*@updatedAt/gmu)].map(
        ([, field]) => field,
      ),
    });
  }
  return tables;
}

describe("Worker Prisma schema", () => {
  // @updatedAt e preenchido pelo Prisma, nao pelo banco: sem ele no schema do Worker,
  // o insert deixa a coluna NOT NULL vazia (foi o que derrubou o login em producao).
  it("declares every @updatedAt column the canonical schema has for its tables", () => {
    const canonical = tablesOf("../../../infra/prisma/schema.prisma");
    const missing = [...tablesOf("../prisma/schema.prisma")].flatMap(([table, worker]) =>
      (canonical.get(table)?.updatedAt ?? [])
        .filter((column) => !worker.fields.includes(column))
        .map((column) => `${table}.${column}`),
    );

    expect(missing).toEqual([]);
  });
});
