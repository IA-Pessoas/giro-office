-- Recalcula os agregados dos parcelamentos migrados com parcelas pagas = 0 (#1378).
-- Reparo pontual, nao e migration. Leia docs/migration/backfill-installment-paid-count.md antes de rodar.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/backfill-installment-paid-count.sql            -- dry-run (padrao)
--   psql "$DATABASE_URL" -X -v apply=1 -f infra/prisma/repairs/backfill-installment-paid-count.sql -- aplica
--
-- Mesma formula de recalculateAggregates (services/parcelamento-service/src/services/
-- installmentService.ts e workers/parcelamento-service/src/services.ts), que o app roda a cada
-- edicao de competencia: pagas = soma de how_many_paid (decisao do dono, 24/09/2026), vencidas,
-- restantes, saldo e status Liquidado derivados dela. So toca parcelamento com pagas = 0 e soma
-- maior que zero. Idempotente.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
\if :apply
  LOCK TABLE "parcelamento.installments", "parcelamento.installmentsCompetencies"
    IN SHARE ROW EXCLUSIVE MODE;
\endif

CREATE TEMP TABLE installment_recalc ON COMMIT DROP AS
WITH sums AS (
  SELECT i.id, sum(c.how_many_paid)::int AS paid, sum(c.how_many_overdue)::int AS overdue_raw
  FROM "parcelamento.installments" i
  JOIN "parcelamento.installmentsCompetencies" c
    ON c.installment_id = i.id AND c.organization_id = i.organization_id
  WHERE i.paid_installments_count = 0
  GROUP BY i.id
  HAVING sum(c.how_many_paid) > 0
)
SELECT i.id, i.organization_id, i.client_id, s.paid, i.agreed_installments_count AS agreed,
       greatest(s.overdue_raw - s.paid, 0) AS overdue,
       greatest(i.agreed_installments_count - s.paid, 0) AS remaining,
       greatest(i.agreed_installments_count - s.paid, 0) * i.current_month_installment_amount
         AS outstanding,
       i.status AS old_status,
       -- Soma acima das acordadas: o app aceita, mas sugere how_many_paid acumulado. Conferir.
       s.paid > i.agreed_installments_count AS exceeds_agreed
FROM sums s
JOIN "parcelamento.installments" i ON i.id = s.id;

\echo '== Resumo (excede acordadas? | liquida? | parcelamentos)'
SELECT exceeds_agreed, remaining = 0 AS settles, count(*) FROM installment_recalc
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== Parcelamentos (id | cliente | pagas | acordadas | restantes | vencidas | saldo | excede?)'
SELECT id, client_id, paid, agreed, remaining, overdue, outstanding, exceeds_agreed
FROM installment_recalc ORDER BY exceeds_agreed DESC, organization_id, client_id;

UPDATE "parcelamento.installments" i SET
  paid_installments_count = r.paid,
  overdue_installments_count = r.overdue,
  remaining_installments_count = r.remaining,
  outstanding_balance = r.outstanding,
  status = CASE
    WHEN r.remaining = 0 THEN 'Liquidado'
    WHEN i.status = 'Liquidado' THEN 'Ativo'
    ELSE i.status
  END,
  completion_date = CASE
    WHEN r.remaining = 0 THEN coalesce(i.completion_date, now())
    WHEN i.status = 'Liquidado' THEN NULL
    ELSE i.completion_date
  END
FROM installment_recalc r
WHERE r.id = i.id;

\if :apply
  COMMIT;
  \echo '== APLICADO'
\else
  ROLLBACK;
  \echo '== DRY-RUN: nada foi gravado. Rode com -v apply=1 para aplicar.'
\endif
