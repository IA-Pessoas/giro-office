import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appPkg = JSON.parse(readFileSync(join(root, "app/package.json"), "utf8"));

const forbiddenAppDeps = [
  "@emotion/react",
  "@emotion/styled",
  "styled-components",
  "@types/styled-components",
  "js-cookie",
  "react-to-print",
  "icons",
];

for (const name of forbiddenAppDeps) {
  assert.equal(
    appPkg.dependencies?.[name],
    undefined,
    `app/package.json ainda declara dependency morta: ${name}`,
  );
  assert.equal(
    appPkg.devDependencies?.[name],
    undefined,
    `app/package.json ainda declara devDependency morta: ${name}`,
  );
}

const infraPkg = JSON.parse(readFileSync(join(root, "infra/package.json"), "utf8"));
assert.equal(infraPkg.devDependencies?.express, undefined, "infra ainda declara express");
assert.equal(infraPkg.dependencies?.express, undefined, "infra ainda declara express");

console.log("ok - unused dep candidates absent");
