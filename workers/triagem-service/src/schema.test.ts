import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tableByModel = (path: URL) => {
  const schema = readFileSync(path, "utf8");
  const tables = new Map<string, string>();
  for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    tables.set(model, body.match(/@@map\("([^"]+)"\)/)?.[1] ?? model);
  }
  return tables;
};

describe("triagem Worker prisma schema", () => {
  it("mapeia cada modelo para a mesma tabela física do schema canônico", () => {
    const worker = tableByModel(new URL("../prisma/schema.prisma", import.meta.url));
    const canonical = tableByModel(new URL("../../../infra/prisma/schema.prisma", import.meta.url));

    for (const [model, table] of worker) {
      expect({ model, table }).toEqual({ model, table: canonical.get(model) });
    }
  });
});
