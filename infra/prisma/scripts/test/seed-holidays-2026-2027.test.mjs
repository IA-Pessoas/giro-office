import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { hasDocker, usePostgres } from "./pgHarness.mjs";

// Roda a carga real contra um Postgres descartavel em Docker. Sem Docker, pula.
const SQL = readFileSync(new URL("../../repairs/seed-holidays-2026-2027.sql", import.meta.url), "utf8");

const FIXTURE = `
DROP TABLE IF EXISTS "rh.holidays", organizations;
CREATE TABLE organizations (id text PRIMARY KEY, status text NOT NULL);
CREATE TABLE "rh.holidays" (
  id text PRIMARY KEY, name text NOT NULL, date timestamp NOT NULL, organization_id text NOT NULL
);
INSERT INTO organizations VALUES ('org-a', 'active'), ('org-b', 'trial'), ('org-x', 'cancelled');
-- org-a ja tem feriado municipal no dia de Tiradentes: nao duplica o dia.
INSERT INTO "rh.holidays" VALUES ('h1', 'Aniversario da cidade', '2026-04-21 00:00:00', 'org-a');
`;

const { psql, query } = usePostgres("holidays-test");

test("dry-run relata a carga sem gravar", { skip: !hasDocker }, () => {
  query(FIXTURE);
  const result = psql(SQL);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /org-a\|25/);
  assert.match(result.stdout, /org-b\|26/);
  assert.match(result.stdout, /DRY-RUN/);
  assert.equal(query(`SELECT count(*) FROM "rh.holidays"`), "1");
});

test("apply cadastra 26 datas por organizacao, sem duplicar o dia, e e idempotente", {
  skip: !hasDocker,
}, () => {
  query(FIXTURE);
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(`SELECT count(*) FROM "rh.holidays" WHERE organization_id = 'org-b'`), "26");
  assert.equal(query(`SELECT count(*) FROM "rh.holidays" WHERE organization_id = 'org-a'`), "26");
  assert.equal(
    query(`SELECT name FROM "rh.holidays" WHERE organization_id = 'org-a' AND date = '2026-04-21'`),
    "Aniversario da cidade",
  );
  assert.equal(
    query(`SELECT string_agg(to_char(date, 'YYYY-MM-DD'), ',' ORDER BY date) FROM "rh.holidays"
      WHERE organization_id = 'org-b' AND name IN ('Carnaval', 'Sexta-feira Santa', 'Corpus Christi')`),
    "2026-02-16,2026-02-17,2026-04-03,2026-06-04,2027-02-08,2027-02-09,2027-03-26,2027-05-27",
  );
  assert.equal(psql(SQL, ["apply=1"]).status, 0);
  assert.equal(query(`SELECT count(*) FROM "rh.holidays"`), "52");
  assert.equal(query(`SELECT count(*) FROM "rh.holidays" WHERE organization_id = 'org-x'`), "0");
});
