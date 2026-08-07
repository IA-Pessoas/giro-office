import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readPkg(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), "utf8"));
}

test("app package.json does not reintroduce removed unused dependencies", () => {
  const appPkg = readPkg("app/package.json");
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
});

test("infra package.json does not declare unused express", () => {
  const infraPkg = readPkg("infra/package.json");
  assert.equal(infraPkg.devDependencies?.express, undefined, "infra ainda declara express");
  assert.equal(infraPkg.dependencies?.express, undefined, "infra ainda declara express");
});

test("user-service does not declare unused multer", () => {
  const userPkg = readPkg("services/user-service/package.json");
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
});

test("services without jwt usage do not declare jsonwebtoken", () => {
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
    const pkg = readPkg(`services/${name}/package.json`);
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
});

test("contabil-service keeps jsonwebtoken only in devDependencies", () => {
  const contabilPkg = readPkg("services/contabil-service/package.json");
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
});
