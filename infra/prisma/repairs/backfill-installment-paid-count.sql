-- Preenche a quantidade de parcelas pagas dos parcelamentos migrados com 0 (#1378).
-- Reparo pontual, nao e migration. Leia docs/migration/backfill-installment-paid-count.md antes de rodar.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-installment-paid-count.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-installment-paid-count.sql -- aplica
--
-- Regra (decisao do dono, 24/09/2026): pagas = soma de how_many_paid das competencias migradas.
-- So atualiza parcelamento com paid_installments_count = 0; soma acima das parcelas acordadas
-- indica semantica diferente e fica so no relatorio. Idempotente.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
\if :apply
  LOCK TABLE "parcelamento.installments" IN SHARE ROW EXCLUSIVE MODE;
\endif

CREATE TEMP TABLE installment_paid_changes ON COMMIT DROP AS
SELECT i.id, i.organization_id, i.client_id, sum(c.how_many_paid)::int AS paid_sum,
       i.agreed_installments_count AS agreed,
       i.agreed_installments_count = 0 OR sum(c.how_many_paid) <= i.agreed_installments_count
         AS applies
FROM "parcelamento.installments" i
JOIN "parcelamento.installmentsCompetencies" c ON c.installment_id = i.id
WHERE i.paid_installments_count = 0
GROUP BY i.id
HAVING sum(c.how_many_paid) > 0;

\echo '== Resumo (grava? | parcelamentos)'
SELECT applies, count(*) FROM installment_paid_changes GROUP BY 1 ORDER BY 1 DESC;

\echo '== Parcelamentos (id | cliente | pagas somadas | acordadas | grava?)'
SELECT id, client_id, paid_sum, agreed, applies FROM installment_paid_changes
ORDER BY applies DESC, organization_id, client_id;

UPDATE "parcelamento.installments" i SET paid_installments_count = ch.paid_sum
FROM installment_paid_changes ch
WHERE ch.id = i.id AND ch.applies;

\if :apply
  COMMIT;
  \echo '== APLICADO'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 para aplicar.'
\endif
