import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

// Roda o relatorio real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(
  new URL("../../repairs/report-invalid-documents.sql", import.meta.url),
  "utf8",
);
const CONTAINER = `invalid-documents-test-${process.pid}`;
const hasDocker = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

// Mesmos casos do teste de getDocumentIssue em app/src/modules/clients/run-clients-tests.mjs.
const FIXTURE = `
CREATE TABLE clients (id text PRIMARY KEY, organization_id text, cpf_cnpj text);
CREATE TABLE "certificate.pj" (id text PRIMARY KEY, organization_id text, cnpj text, responsible text);
INSERT INTO clients VALUES
  ('cpf-ok', 'org', '529.982.247-25'), ('cnpj-ok', 'org', '11.222.333/0001-81'),
  ('alnum-ok', 'org', '12.ABC.345/01DE-35'), ('empty', 'org', ''),
  ('masked', 'org', '******'), ('short', 'org', '3231794528'),
  ('cpf-dv', 'org', '529.982.247-26'), ('cnpj-dv', 'org', '11.222.333/0001-82'),
  ('zeros', 'org', '000.000.000-00');
INSERT INTO "certificate.pj" VALUES
  ('c1', 'org', '11222333000181', '******'), ('c2', 'org', '11222333000181', 'Maria');
`;

function psql(sql) {
  return spawnSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8" },
  );
}

before(() => {
  if (!hasDocker) return;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", CONTAINER, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17",
  ]);
  for (let i = 0; i < 60; i++) {
    if (psql("SELECT 1").status === 0) {
      const fixture = psql(FIXTURE);
      assert.equal(fixture.status, 0, fixture.stderr);
      return;
    }
    execFileSync("sleep", ["1"]);
  }
  throw new Error("Postgres de teste nao subiu");
});

after(() => {
  if (hasDocker) spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
});

test("relata so documentos invalidos, com o mesmo motivo da UI", { skip: !hasDocker }, () => {
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout
    .split("\n")
    .filter((line) => !line.startsWith("==") && line.split("|").length === 6)
    .map((line) => {
      const [table, column, id, , , issue] = line.split("|");
      return `${table}.${column}:${id}:${issue}`;
    })
    .sort();
  assert.deepEqual(rows, [
    '"certificate.pj".responsible:c1:Documento mascarado',
    "clients.cpf_cnpj:cnpj-dv:Dígito verificador inválido",
    "clients.cpf_cnpj:cpf-dv:Dígito verificador inválido",
    "clients.cpf_cnpj:masked:Documento mascarado",
    "clients.cpf_cnpj:short:Tamanho inválido",
    "clients.cpf_cnpj:zeros:Dígito verificador inválido",
  ]);
});
