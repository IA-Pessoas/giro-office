-- Carga dos feriados nacionais de 2026 e 2027 em todas as organizacoes (#1381).
-- Reparo pontual, nao e migration.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/seed-holidays-2026-2027.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/seed-holidays-2026-2027.sql -- aplica
--
-- Decisao do dono (24/09/2026): os 10 feriados nacionais por lei, mais Carnaval (segunda e terca) e
-- Corpus Christi como folga. Estaduais e municipais o RH cadastra na tela. Datas moveis a partir da
-- Pascoa (05/04/2026 e 28/03/2027). A data fica a meia-noite UTC, como o holidayService grava, e o
-- dia que ja tem feriado na organizacao e pulado (o servico recusa dois feriados no mesmo dia).
-- Idempotente.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
\if :apply
  LOCK TABLE "rh.holidays" IN SHARE ROW EXCLUSIVE MODE;
\endif

CREATE TEMP TABLE holiday_calendar (day date, name text) ON COMMIT DROP;
INSERT INTO holiday_calendar VALUES
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-02-16', 'Carnaval'),
  ('2026-02-17', 'Carnaval'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-06-04', 'Corpus Christi'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Confraternização Universal'),
  ('2027-02-08', 'Carnaval'),
  ('2027-02-09', 'Carnaval'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-05-27', 'Corpus Christi'),
  ('2027-09-07', 'Independência do Brasil'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República'),
  ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  ('2027-12-25', 'Natal');

CREATE TEMP TABLE holiday_inserts ON COMMIT DROP AS
SELECT o.id AS organization_id, h.day, h.name
FROM organizations o
CROSS JOIN holiday_calendar h
WHERE NOT EXISTS (
  SELECT 1 FROM "rh.holidays" x
  WHERE x.organization_id = o.id AND x.date >= h.day AND x.date < h.day + 1
);

\echo '== Feriados a cadastrar por organizacao (organizacao | datas)'
SELECT organization_id, count(*) FROM holiday_inserts GROUP BY 1 ORDER BY 1;

\echo '== Dias pulados por ja terem feriado (organizacao | data | feriado existente)'
SELECT o.id, h.day, x.name
FROM organizations o
CROSS JOIN holiday_calendar h
JOIN "rh.holidays" x ON x.organization_id = o.id AND x.date >= h.day AND x.date < h.day + 1
ORDER BY 1, 2;

INSERT INTO "rh.holidays" (id, name, date, organization_id)
SELECT gen_random_uuid()::text, name, day::timestamp, organization_id FROM holiday_inserts;

\if :apply
  COMMIT;
  \echo '== APLICADO'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 para aplicar.'
\endif
