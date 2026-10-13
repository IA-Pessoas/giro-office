# commercial-service

Serviço responsável pelo catálogo de propostas e pela operação de prospecção do módulo Comercial.

## Operação local

- Porta padrão: `3045` (`COMMERCIAL_SERVICE_PORT`).
- Banco e autenticação: `DATABASE_URL`, `JWT_SECRET`.
- Anexos privados de prospecção: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
  `COMMERCIAL_PROSPECTING_ATTACHMENT_BUCKET` (padrão `CommercialProspectingPrivate`). Em produção,
  URL e chave de serviço são obrigatórias; o bucket deve permanecer privado.
- Auditoria: `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN`.
- Projeção de Cliente: `CLIENT_SERVICE_URL`, `CLIENT_SERVICE_INTERNAL_TOKEN`.
- Contrato de fechamento e projeção de Tarefa: `TASK_SERVICE_URL`, `TASK_SERVICE_INTERNAL_TOKEN`.
- Adaptador de e-mail: `COMMERCIAL_EMAIL_ADAPTER_URL`, `COMMERCIAL_EMAIL_ADAPTER_TOKEN`,
  `COMMERCIAL_EMAIL_FROM` e `COMMERCIAL_EMAIL_ADAPTER_TIMEOUT_MS`. Em produção, URL HTTPS, token
  interno e remetente válido são obrigatórios; sem adaptador configurado o worker falha de modo
  reprocessável. Consulte [o contrato e o runbook do adaptador](docs/commercial-email-adapter.md).
- Worker da outbox: `COMMERCIAL_OUTBOX_WORKER_POLL_INTERVAL_MS`, `COMMERCIAL_OUTBOX_WORKER_MAX_ATTEMPTS` e `COMMERCIAL_OUTBOX_WORKER_RETRY_BASE_MS`.
- CORS e documentação: `SERVICE_ALLOWED_ORIGINS`, `ENABLE_API_DOCS`.

```bash
pnpm --filter @workspace/commercial-service prisma:generate
pnpm --filter @workspace/commercial-service dev
pnpm --filter @workspace/commercial-service test
```

## Contrato público

O gateway publica o serviço sob `/commercial` e exige a permissão de módulo `comercial`.
Leitura exige nível 1; criação, edição, exclusão e arquivamento exigem nível 2.

- `GET /commercial/proposal-configs`
- `GET /commercial/proposal-configs/:id`
- `POST /commercial/proposal-configs`
- `PATCH /commercial/proposal-configs/:id`
- `DELETE /commercial/proposal-configs/:id` (exclusão condicionada à ausência de referências)
- `GET /commercial/prospecting/clients`
- `GET /commercial/prospecting`
- `GET /commercial/prospecting/:id`
- `POST /commercial/prospecting`
- `PATCH /commercial/prospecting/:id`
- `GET /commercial/prospecting/:id/history`
- `GET /commercial/prospecting/:id/attachment` (URL assinada de curta duração)
- `PUT /commercial/prospecting/:id/attachment` (multipart `file`, somente enquanto Paralisado)
- `DELETE /commercial/prospecting/:id` (arquivamento lógico idempotente)
- `GET /commercial/outbox/status`
- `GET /commercial/task-billing`
- `PUT /commercial/task-billing/:taskId`

Cada consulta filtra `proposal.config` por `organization_id` derivado do contexto autenticado.
O serviço não cria propostas transacionais nem altera o catálogo de Clientes.
As prospecções pertencem à organização autenticada, referenciam um Cliente existente e usam somente os status legados aprovados. Solução, mês de referência, data do status e campos da reunião são persistidos; prospecções antigas sem esses dados precisam ser preenchidas ao editar. O status `Paralisado` exige motivo. Anexos são privados e mantêm o arquivo anterior quando uma edição não envia novo arquivo. O histórico registra autor, data e valores alterados, sempre escopado à organização. O arquivamento é lógico, preserva o histórico e não libera novo cadastro para o mesmo Cliente. Alterações e arquivamentos geram auditoria no recurso `commercial.prospecting`.

As transições são gravadas com a prospecção na outbox na mesma transação. O worker projeta o Cliente pelo contrato interno `POST /internal/commercial/prospecting-transition` do `client-service`. Nas mudanças de situação, também envia o evento ao `POST /internal/commercial/prospecting-transition` do `task-service` para aplicar os efeitos legados nas tarefas; o cadastro inicial não altera tarefas. O fechamento continua usando `POST /internal/commercial/prospecting-close`. Todas as entregas usam token interno, tenant e correlação de auditoria; o endpoint de status expõe contagens e a última falha para suporte.

As decisões de cobrança de tarefa pertencem ao Comercial e são gravadas em `commercial.task_billing` junto com um evento outbox. O worker entrega `POST /internal/commercial/task-billing` ao `task-service`; falhas mantêm o evento reprocessável e não alteram a decisão registrada no Comercial.
