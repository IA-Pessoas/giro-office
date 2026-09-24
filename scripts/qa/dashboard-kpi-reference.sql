-- Consultas de referencia dos KPIs do dashboard (#1384). Somente leitura.
-- Procedimento e regras de cada KPI: docs/migration/dashboard-kpis.md.
--
--   psql "$DATABASE_URL" -X -v org=<organization_id> -f scripts/qa/dashboard-kpi-reference.sql
--
-- Cada linha traz o caminho do campo em GET /api/dashboard/stats (data.<caminho>) e o valor que ele
-- deve ter. As consultas sao escritas de novo, uma por KPI, sem reaproveitar o SQL do
-- dashboardStatsService, para que um erro de agregacao la apareca como divergencia aqui.
\set ON_ERROR_STOP on

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog, public;

WITH org AS (SELECT :'org'::text AS id),
active_clients AS (
  SELECT c.* FROM clients c, org
  WHERE c.organization_id = org.id AND lower(c.status) = 'ativo' AND c.deletion_date IS NULL
),
open_tasks AS (
  SELECT t.* FROM "integracao.tasks" t, org
  WHERE t.organization_id = org.id
    AND lower(coalesce(t.status, '')) NOT IN ('concluida', 'concluido', 'concluída', 'concluído',
                                             'fechado', 'migrado')
    AND lower(coalesce(t.status, '')) NOT LIKE '%não contratado%'
    AND lower(coalesce(t.status, '')) NOT LIKE '%nao contratado%'
),
done_tasks AS (
  SELECT t.* FROM "integracao.tasks" t, org
  WHERE t.organization_id = org.id
    AND lower(coalesce(t.status, '')) IN ('concluida', 'concluido', 'concluída', 'concluído', 'fechado')
),
projects AS (
  SELECT lower(coalesce(p.status, '')) AS status FROM "integracao.projects" p, org
  WHERE p.organization_id = org.id
),
certificates AS (
  SELECT was_paid, payment_date, payment_amount FROM "certificate.pj", org
  WHERE organization_id = org.id
  UNION ALL
  SELECT was_paid, payment_date, payment_amount FROM "certificate.pf", org
  WHERE organization_id = org.id
),
prospects AS (
  SELECT p.* FROM "commercial.prospecting" p, org
  WHERE p.organization_id = org.id AND p.archived_at IS NULL
),
billing AS (
  SELECT b.hiring_status FROM "commercial.task_billing" b, org WHERE b.organization_id = org.id
)
SELECT kpi, value FROM (
  SELECT 1 AS n, 'totalClients' AS kpi, (SELECT count(*) FROM active_clients)::text AS value
  UNION ALL SELECT 2, 'clientsByService.contabil', (SELECT count(*) FROM active_clients WHERE contabil)::text
  UNION ALL SELECT 3, 'clientsByService.fiscal', (SELECT count(*) FROM active_clients WHERE fiscal)::text
  UNION ALL SELECT 4, 'clientsByService.pessoal', (SELECT count(*) FROM active_clients WHERE pessoal)::text
  UNION ALL SELECT 5, 'clientsByService.infoproduto', (SELECT count(*) FROM active_clients WHERE infoproduto)::text
  UNION ALL SELECT 6, 'clientsByService.consultoria', (SELECT count(*) FROM active_clients WHERE consultoria)::text
  UNION ALL SELECT 7, 'clientsByService.castelo_med', (SELECT count(*) FROM active_clients WHERE castelo_med)::text
  UNION ALL SELECT 10, 'tasks.pending', (SELECT count(*) FROM open_tasks)::text
  UNION ALL SELECT 11, 'tasks.today', (SELECT count(*) FROM open_tasks WHERE prevision_date::date = current_date)::text
  UNION ALL SELECT 12, 'tasks.completedToday', (SELECT count(*) FROM done_tasks WHERE end_date::date = current_date)::text
  UNION ALL SELECT 13, 'tasks.urgent', (SELECT count(*) FROM open_tasks
      WHERE prevision_date::date < current_date
         OR lower(coalesce(urgency, '')) IN ('alta', 'alto', 'urgente', 'crítica', 'critica', 'crítico', 'critico'))::text
  UNION ALL SELECT 20, 'projects.active', (SELECT count(*) FROM projects WHERE status NOT IN ('fechado', 'inativo',
      'distrato', 'recusado pelo cliente', 'rejeitado pela castelo', 'não contratado', 'nao contratado'))::text
  UNION ALL SELECT 21, 'projects.completed', (SELECT count(*) FROM projects WHERE status IN ('fechado', 'concluído', 'concluido'))::text
  UNION ALL SELECT 22, 'projects.inProgress', (SELECT count(*) FROM projects WHERE status IN ('paralisado', 'em andamento', 'andamento'))::text
  UNION ALL SELECT 23, 'projects.delayed', (SELECT count(*) FROM projects WHERE status = 'paralisado')::text
  UNION ALL SELECT 24, 'projects.waiting', (SELECT count(*) FROM projects WHERE status IN ('análise/agendamento', 'analise/agendamento', 'envio de proposta'))::text
  UNION ALL SELECT 30, 'notifications.total', ((SELECT count(*) FROM "notification.certificate", org WHERE organization_id = org.id)
      + (SELECT count(*) FROM "notification.pessoal", org WHERE organization_id = org.id)
      + (SELECT count(*) FROM "notification.regularize", org WHERE organization_id = org.id))::text
  UNION ALL SELECT 31, 'notifications.pending', ((SELECT count(*) FROM "notification.certificate", org WHERE organization_id = org.id)
      + (SELECT count(*) FROM "notification.pessoal", org WHERE organization_id = org.id AND NOT read)
      + (SELECT count(*) FROM "notification.regularize", org WHERE organization_id = org.id AND NOT read))::text
  UNION ALL SELECT 40, 'financial.unpaidCertificates', (SELECT count(*) FROM certificates WHERE was_paid IS NOT TRUE)::text
  UNION ALL SELECT 41, 'financial.paidCertificateReceipts', (SELECT coalesce(sum(payment_amount), 0) FROM certificates
      WHERE was_paid AND payment_date >= date_trunc('month', current_date)
        AND payment_date < date_trunc('month', current_date) + interval '1 month')::text
  UNION ALL SELECT 42, 'financial.monthlyPaidCertificateReceipts[' || to_char(m, 'YYYY-MM') || ']',
      (SELECT coalesce(sum(payment_amount), 0) FROM certificates
       WHERE was_paid AND payment_date >= m AND payment_date < m + interval '1 month')::text
    FROM generate_series(date_trunc('month', current_date) - interval '6 months',
                         date_trunc('month', current_date), interval '1 month') m
  UNION ALL SELECT 50, 'commercial.activeProspects', (SELECT count(*) FROM prospects
      WHERE status NOT IN ('Fechado', 'Recusado pelo Cliente'))::text
  UNION ALL SELECT 51, 'commercial.closedThisMonth', (SELECT count(*) FROM prospects
      WHERE status = 'Fechado' AND status_date >= date_trunc('month', current_date))::text
  UNION ALL SELECT 52, 'commercial.billing.pending', (SELECT count(*) FROM billing WHERE hiring_status = 'A Realizar')::text
  UNION ALL SELECT 53, 'commercial.billing.contracted', (SELECT count(*) FROM billing WHERE hiring_status = 'Contratado')::text
  UNION ALL SELECT 54, 'commercial.billing.notContracted', (SELECT count(*) FROM billing WHERE hiring_status = 'Não Contratado')::text
  UNION ALL SELECT 55, 'commercial.byStatus[' || s || ']', (SELECT count(*) FROM prospects WHERE status = s)::text
    FROM unnest(ARRAY['Análise Financeira', 'Análise/Agendamento', 'Envio de Proposta', 'Paralisado',
                      'Recusado pelo Cliente', 'Fechado']) s
  UNION ALL SELECT 60, 'departments[' || d.name || '].openTasks',
      (SELECT count(*) FROM open_tasks t WHERE t.department_id = d.id)::text
    FROM departments d, org WHERE d.organization_id = org.id
  UNION ALL SELECT 61, 'departments[' || d.name || '].completedTasks',
      (SELECT count(*) FROM done_tasks t WHERE t.department_id = d.id)::text
    FROM departments d, org WHERE d.organization_id = org.id
  UNION ALL SELECT 62, 'departments[' || d.name || '].urgentTasks',
      (SELECT count(*) FROM open_tasks t WHERE t.department_id = d.id
         AND (t.prevision_date::date < current_date
              OR lower(coalesce(t.urgency, '')) IN ('alta', 'alto', 'urgente', 'crítica', 'critica', 'crítico', 'critico')))::text
    FROM departments d, org WHERE d.organization_id = org.id
) kpis
ORDER BY n, kpi;

ROLLBACK;
