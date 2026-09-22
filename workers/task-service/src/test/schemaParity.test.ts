import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Table = { fields: string[]; updatedAt: string[]; requiredWithoutDefault: string[] };

const SCALARS = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

function tablesOf(schemaPath: string): Map<string, Table> {
  const source = readFileSync(new URL(schemaPath, import.meta.url), "utf8");
  const enums = new Set([...source.matchAll(/^enum (\w+) \{/gmu)].map(([, name]) => name));
  const tables = new Map<string, Table>();
  for (const [, name, body] of source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gmu)) {
    const lines = [...body.matchAll(/^ {2}(\w+)\s+(\w+)(\[\]|\?)?([^\n]*)$/gmu)];
    tables.set(/@@map\("([^"]+)"\)/u.exec(body)?.[1] ?? name, {
      fields: lines.map(([, field]) => field),
      updatedAt: [...body.matchAll(/^ {2}(\w+)\s+DateTime\S*\s[^\n]*@updatedAt/gmu)].map(
        ([, field]) => field,
      ),
      // Coluna NOT NULL sem default: o INSERT do Worker falha se o schema dele não a conhece.
      requiredWithoutDefault: lines
        .filter(
          ([, , type, modifier, rest]) =>
            (SCALARS.has(type) || enums.has(type)) &&
            !modifier &&
            !/@default|@updatedAt|@relation/u.test(rest),
        )
        .map(([, field]) => field),
    });
  }
  return tables;
}

describe("Worker Prisma schema", () => {
  const canonical = tablesOf("../../../../infra/prisma/schema.prisma");
  const worker = tablesOf("../../prisma/schema.prisma");

  // @updatedAt e preenchido pelo Prisma, nao pelo banco: sem ele no schema do Worker,
  // o insert deixa a coluna NOT NULL vazia (foi o que derrubou o login em producao).
  it("declares every @updatedAt column the canonical schema has for its tables", () => {
    const missing = [...worker].flatMap(([table, columns]) =>
      (canonical.get(table)?.updatedAt ?? [])
        .filter((column) => !columns.fields.includes(column))
        .map((column) => `${table}.${column}`),
    );

    expect(missing).toEqual([]);
  });

  it("declares every NOT NULL column without default the canonical schema has", () => {
    const missing = [...worker].flatMap(([table, columns]) =>
      (canonical.get(table)?.requiredWithoutDefault ?? [])
        .filter((column) => !columns.fields.includes(column))
        .map((column) => `${table}.${column}`),
    );

    expect(missing).toEqual([]);
  });

  it("maps only tables that exist in the canonical schema", () => {
    expect([...worker.keys()].filter((table) => !canonical.has(table))).toEqual([]);
  });
});
