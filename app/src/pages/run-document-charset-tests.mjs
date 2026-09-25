import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "_document.tsx"), "utf8");

assert.ok(source.includes('lang="pt-BR"'), "missing lang=pt-BR");
assert.ok(
  /charSet=["']utf-8["']/i.test(source) || /charset=["']utf-8["']/i.test(source),
  "missing explicit utf-8 charset meta",
);

console.log("document charset tests passed");
