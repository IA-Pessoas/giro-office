-- Limpeza dos registros QA criados no teste E2E de produção de 23/09/2026.
-- Relatório: reports/qa-e2e-prod-2026-09-23.md
--
-- Uso (sempre rode o dry-run primeiro; ele termina em ROLLBACK):
--   psql "$DATABASE_URL" -f scripts/qa/cleanup-e2e-prod-2026-09-23.sql
-- Aplicar de verdade:
--   psql "$DATABASE_URL" -v apply=1 -f scripts/qa/cleanup-e2e-prod-2026-09-23.sql
-- Incluir também os resíduos de testes anteriores ("QA E2E CLIENT PF/PJ 20260922"):
--   acrescente -v residue=1 (combina com apply=1 ou não)
--
-- Tudo roda numa transação só. Qualquer guarda que falhar (nome não QA,
-- contagem inesperada, FK não mapeada) aborta sem alterar nada.
-- Logs de auditoria (logs, audit_requests) são mantidos de propósito.

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif
\if :{?residue}
\else
  \set residue 0
\endif

BEGIN;

CREATE TEMP TABLE qa_ids (kind text NOT NULL, id text NOT NULL) ON COMMIT DROP;

INSERT INTO qa_ids (kind, id) VALUES
  ('client',        '98474fd6-ebe6-4c65-974f-d1949ac14cdd'), -- QA_Cliente_PJ
  ('client',        '8be82f7e-0c67-423c-b028-28deb823b4ee'), -- QA_Cliente_Dup
  ('client',        '5853497f-63d4-494f-a9ee-891941d3a989'), -- QA_Cliente_Integracao
  ('client_pf',     '755b238a-b3bb-4e74-9e0b-493668d5b90b'), -- QA_Socio_PF
  ('task',          'f8e4f9c3-1f4c-40c2-9833-58e5b69f364c'), -- QA_Tarefa_Projeto
  ('project',       'f871fd1e-e49f-4550-a800-edaa0c2698d3'), -- QA_Projeto_Editado
  ('task_billing',  'a8b24b27-3dfb-44ce-be18-acf2663aa015'),
  ('prospecting',   'e9c5a5c9-7a99-401f-873d-17b6e51289f3'),
  ('proposal_cfg',  '4174a296-bf78-47de-bb17-ce53cd452cba'),
  ('process',       '6f3c52de-3ea2-42d6-912a-7bb238ec4cc1'),
  ('license',       '458f582e-616c-427f-9775-8cc102ca5bf0'),
  ('installment',   'c58145a6-4a70-46d7-abed-cd1f9fb6d59e'), -- QA_ACORDO_1 (cliente residual ec63cc98)
  ('catalog_item',  'f86464d8-c8b1-4655-869e-b5fd7f5a88b0'), -- QA_JUST
  ('stock',         '6ff24cb9-befd-40ff-b788-65ad9d2345e2'), -- QA_Item_Estoque
  ('rh_category',   '712fc7df-0786-44ef-8383-520b50913212'), -- QA_Categoria
  ('report_job',    'ce197944-8fab-4620-a341-0a9a95ab36a1');

\if :residue
INSERT INTO qa_ids (kind, id) VALUES
  ('client', '17c47bc9-7302-4f96-b552-856b03658e73'), -- QA E2E CLIENT PF 20260922
  ('client', 'ec63cc98-2cb3-430b-a08b-74d15292d1ae'); -- QA E2E CLIENT PJ 20260922 EDITADO
\endif

-- Guardas: só segue se os alvos são de fato registros de teste.
DO $$
DECLARE
  expected int := (SELECT count(*) FROM qa_ids WHERE kind = 'client');
  found int;
BEGIN
  SELECT count(*) INTO found FROM "clients"
   WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'client')
     AND (name LIKE 'QA\_%' OR name LIKE 'QA E2E CLIENT%');
  IF found <> expected THEN
    RAISE EXCEPTION 'Guarda clientes: esperado %, encontrado % com nome QA', expected, found;
  END IF;

  IF EXISTS (SELECT 1 FROM "integracao.tasks"
              WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'task') AND name NOT LIKE 'QA\_%') THEN
    RAISE EXCEPTION 'Guarda tarefa: nome não é QA_';
  END IF;
  IF EXISTS (SELECT 1 FROM "integracao.projects"
              WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'project') AND name NOT LIKE 'QA\_%') THEN
    RAISE EXCEPTION 'Guarda projeto: nome não é QA_';
  END IF;
  IF EXISTS (SELECT 1 FROM "clients.pf"
              WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'client_pf') AND name NOT LIKE 'QA\_%') THEN
    RAISE EXCEPTION 'Guarda PF: nome não é QA_';
  END IF;
  IF EXISTS (SELECT 1 FROM "stock"
              WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'stock') AND name NOT LIKE 'QA\_%') THEN
    RAISE EXCEPTION 'Guarda estoque: nome não é QA_';
  END IF;
  IF EXISTS (SELECT 1 FROM "rh.request_categories"
              WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'rh_category') AND name NOT LIKE 'QA\_%') THEN
    RAISE EXCEPTION 'Guarda categoria RH: nome não é QA_';
  END IF;
  -- Tarefas/projetos de clientes QA precisam ser todos QA (evita apagar algo criado por outra pessoa).
  IF EXISTS (SELECT 1 FROM "integracao.tasks"
              WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client')
                AND name NOT LIKE 'QA\_%' AND name NOT LIKE 'QA E2E%') THEN
    RAISE EXCEPTION 'Existe tarefa não-QA ligada a cliente QA; revisar antes de apagar';
  END IF;
END $$;

-- Tarefas e projetos: tudo que é dos clientes QA mais os IDs explícitos.
INSERT INTO qa_ids (kind, id)
  SELECT 'task', id::text FROM "integracao.tasks"
   WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client')
     AND id::text NOT IN (SELECT id FROM qa_ids WHERE kind = 'task');
INSERT INTO qa_ids (kind, id)
  SELECT 'project', id::text FROM "integracao.projects"
   WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client')
     AND id::text NOT IN (SELECT id FROM qa_ids WHERE kind = 'project');
INSERT INTO qa_ids (kind, id)
  SELECT 'competence', id::text FROM "triagem.competences"
   WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
INSERT INTO qa_ids (kind, id)
  SELECT 'guidance', id::text FROM "regularize.proceduralGuidances"
   WHERE client_pj_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client')
      OR client_pf_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client_pf')
      OR process_id::text IN (SELECT id FROM qa_ids WHERE kind = 'process');

SELECT kind, count(*) AS alvos FROM qa_ids GROUP BY kind ORDER BY kind;

-- 1. Dependentes de tarefa
DELETE FROM "notification.task_operational" WHERE task_id::text IN (SELECT id FROM qa_ids WHERE kind = 'task');
DELETE FROM "integracao.commercial_task_billing_projection_events" WHERE task_id::text IN (SELECT id FROM qa_ids WHERE kind = 'task');
DELETE FROM "commercial.outbox_events"
 WHERE aggregate_id::text IN (SELECT id FROM qa_ids WHERE kind IN ('task', 'task_billing', 'prospecting', 'client'));
DELETE FROM "commercial.task_billing" WHERE task_id::text IN (SELECT id FROM qa_ids WHERE kind = 'task');
DELETE FROM "integracao.task_completion_requests" WHERE task_id::text IN (SELECT id FROM qa_ids WHERE kind = 'task');
DELETE FROM "integracao.task_attachments" WHERE task_id::text IN (SELECT id FROM qa_ids WHERE kind = 'task');
DELETE FROM "integracao.task_postponements" WHERE task_id::text IN (SELECT id FROM qa_ids WHERE kind = 'task');
DELETE FROM "agenda"
 WHERE task_id::text IN (SELECT id FROM qa_ids WHERE kind = 'task')
    OR client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');

-- 2. Regularize (licença/processo/orientação podem apontar para tarefa)
DELETE FROM "regularize.license"
 WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'license')
    OR client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "regularize.proceduralGuidanceChecklistItems" WHERE guidance_id::text IN (SELECT id FROM qa_ids WHERE kind = 'guidance');
DELETE FROM "regularize.proceduralGuidances" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'guidance');
DELETE FROM "regularize.process"
 WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'process')
    OR client_pj_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client')
    OR client_pf_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client_pf');
DELETE FROM "regularize.partners"
 WHERE pj_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client')
    OR pf_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client_pf');
DELETE FROM "regularize.passwordsRegularize" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "regularize.municipalTaxes" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "clients.pf" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'client_pf');

-- 3. Tarefas e projetos
DELETE FROM "integracao.tasks" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'task');
DELETE FROM "integracao.project_plan_hirings" WHERE project_id::text IN (SELECT id FROM qa_ids WHERE kind = 'project');
DELETE FROM "integracao.project_wizard_confirmations" WHERE project_id::text IN (SELECT id FROM qa_ids WHERE kind = 'project');
DELETE FROM "integracao.projects" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'project');

-- 4. Triagem (competências dos clientes QA)
DELETE FROM "triagem.competence_catalog_snapshots" WHERE competence_id::text IN (SELECT id FROM qa_ids WHERE kind = 'competence');
DELETE FROM "triagem.competence_history" WHERE competence_id::text IN (SELECT id FROM qa_ids WHERE kind = 'competence');
DELETE FROM "triagem.outbox_events" WHERE competence_id::text IN (SELECT id FROM qa_ids WHERE kind = 'competence');
DELETE FROM "triagem.external_links" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "triagem.urgent_requests" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "triagem.competences" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'competence');
DELETE FROM "triagem.monthly" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "triagem.bank_statements" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "triagem.closings" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "triagem.configs" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "triagem.responsibles" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');

-- 5. Demais filhos de cliente
DELETE FROM "parcelamento.installmentsCompetencies"
 WHERE installment_id IN (SELECT id FROM "parcelamento.installments"
                           WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'installment')
                              OR client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client'));
DELETE FROM "parcelamento.installments"
 WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'installment')
    OR client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "parcelamento.panorama" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "contabil.control" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "contabil.responsibles" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "contabil.relationship" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "pessoal.ldd" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "pessoal.passwords" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "pessoal.obrigations" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "pessoal.situations" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "pessoal.payroll" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "commercial.prospecting" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "commercial.prospecting_close_events" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "commercial.email_notifications" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "client.commercial_projection_events" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "clientes.clouds" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "notes" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "agenda.recurring" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "clients.pa" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "clients.history" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "clients.historyPending" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "clients.clientsGroup" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "clients.documentTermination" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');
DELETE FROM "clients.termination" WHERE client_id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');

-- 6. Clientes
DELETE FROM "clients" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'client');

-- 7. Registros sem cliente
DELETE FROM "proposal.config" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'proposal_cfg'); -- já excluído pela UI; no-op esperado
DELETE FROM "stock.entries" WHERE stock_id::text IN (SELECT id FROM qa_ids WHERE kind = 'stock');
DELETE FROM "stock.exits" WHERE stock_id::text IN (SELECT id FROM qa_ids WHERE kind = 'stock');
DELETE FROM "stock" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'stock');
DELETE FROM "rh.request_categories" c
 WHERE c.id::text IN (SELECT id FROM qa_ids WHERE kind = 'rh_category')
   AND NOT EXISTS (SELECT 1 FROM "rh.requests" r WHERE r.category_id = c.id);
-- O item de catálogo só sai se nenhuma competência de outro cliente o capturou em snapshot.
DELETE FROM "triagem.catalog_items" c
 WHERE c.id::text IN (SELECT id FROM qa_ids WHERE kind = 'catalog_item')
   AND NOT EXISTS (SELECT 1 FROM "triagem.competence_catalog_snapshots" s WHERE s.catalog_item_id = c.id);
DELETE FROM "reports.snapshot_rows"
 WHERE snapshot_id IN (SELECT id FROM "reports.snapshots" WHERE report_job_id::text IN (SELECT id FROM qa_ids WHERE kind = 'report_job'));
DELETE FROM "reports.snapshot_blocks"
 WHERE snapshot_id IN (SELECT id FROM "reports.snapshots" WHERE report_job_id::text IN (SELECT id FROM qa_ids WHERE kind = 'report_job'));
DELETE FROM "reports.snapshots" WHERE report_job_id::text IN (SELECT id FROM qa_ids WHERE kind = 'report_job');
DELETE FROM "reports.audit_events" WHERE report_job_id::text IN (SELECT id FROM qa_ids WHERE kind = 'report_job');
DELETE FROM "reports.jobs" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'report_job');

-- Verificação final: tudo deve voltar 0.
SELECT 'clients' AS tabela, count(*) FROM "clients" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'client')
UNION ALL SELECT 'clients.pf', count(*) FROM "clients.pf" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'client_pf')
UNION ALL SELECT 'integracao.tasks', count(*) FROM "integracao.tasks" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'task')
UNION ALL SELECT 'integracao.projects', count(*) FROM "integracao.projects" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'project')
UNION ALL SELECT 'parcelamento.installments', count(*) FROM "parcelamento.installments" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'installment')
UNION ALL SELECT 'stock', count(*) FROM "stock" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'stock')
UNION ALL SELECT 'reports.jobs', count(*) FROM "reports.jobs" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'report_job')
UNION ALL SELECT 'rh.request_categories (fica se houver solicitação)', count(*) FROM "rh.request_categories" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'rh_category')
UNION ALL SELECT 'triagem.catalog_items (fica se outro cliente capturou)', count(*) FROM "triagem.catalog_items" WHERE id::text IN (SELECT id FROM qa_ids WHERE kind = 'catalog_item');

\if :apply
  COMMIT;
  \echo 'APLICADO: limpeza QA commitada.'
\else
  ROLLBACK;
  \echo 'DRY-RUN: nada foi alterado. Rode com -v apply=1 para aplicar.'
\endif
