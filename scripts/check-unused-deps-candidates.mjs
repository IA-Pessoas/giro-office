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

const userPkg = JSON.parse(
  readFileSync(join(root, "services/user-service/package.json"), "utf8"),
);
assert.equal(userPkg.dependencies?.multer, undefined, "user-service ainda declara multer");
assert.equal(userPkg.devDependencies?.multer, undefined, "user-service ainda declara multer");
assert.equal(
  userPkg.dependencies?.["@types/multer"],
  undefined,
  "user-service ainda declara @types/multer",
);
assert.equal(
  userPkg.devDependencies?.["@types/multer"],
  undefined,
  "user-service ainda declara @types/multer",
);

const servicesWithoutJwt = [
  "fiscal-service",
  "organization-service",
  "project-service",
  "regularize-service",
  "rh-service",
  "pessoal-service",
  "parcelamento-service",
];

for (const name of servicesWithoutJwt) {
  const pkg = JSON.parse(readFileSync(join(root, "services", name, "package.json"), "utf8"));
  assert.equal(
    pkg.dependencies?.jsonwebtoken,
    undefined,
    `${name} ainda declara jsonwebtoken em dependencies`,
  );
  assert.equal(
    pkg.devDependencies?.jsonwebtoken,
    undefined,
    `${name} ainda declara jsonwebtoken em devDependencies`,
  );
}

const contabilPkg = JSON.parse(
  readFileSync(join(root, "services/contabil-service/package.json"), "utf8"),
);
assert.equal(
  contabilPkg.dependencies?.jsonwebtoken,
  undefined,
  "contabil-service jwt deve estar em devDependencies",
);
assert.equal(
  typeof contabilPkg.devDependencies?.jsonwebtoken,
  "string",
  "contabil-service deve manter jsonwebtoken em devDependencies",
);

console.log("ok - unused dep candidates absent");
