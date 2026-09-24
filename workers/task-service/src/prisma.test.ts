import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "./generated/prisma/client.js";

const DELEGATE_CALL =
  /\.([a-z][A-Za-z]+)\.(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\(/gu;

function delegatesUsedBy(dir: URL): Set<string> {
  const used = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    for (const [, delegate] of readFileSync(new URL(file, dir), "utf8").matchAll(DELEGATE_CALL)) {
      used.add(delegate);
    }
  }
  return used;
}

describe("schema Prisma do task Worker", () => {
  it("tem todo model que os serviços do task-service Node acessam", () => {
    const models = new Set(
      Object.values(Prisma.ModelName).map((name) => name[0].toLowerCase() + name.slice(1)),
    );
    const services = new URL("../../../services/task-service/src/services/", import.meta.url);
    const missing = [...delegatesUsedBy(services)].filter((delegate) => !models.has(delegate));

    expect(missing).toEqual([]);
  });
});
