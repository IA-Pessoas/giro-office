# commercial-service

Serviço responsável pelo catálogo de propostas e pela operação de prospecção do módulo Comercial.

## Operação local

- Porta padrão: `3045` (`COMMERCIAL_SERVICE_PORT`).
- Banco e autenticação: `DATABASE_URL`, `JWT_SECRET`.
- Auditoria: `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN`.
- Projeção de Cliente: `CLIENT_SERVICE_URL`, `CLIENT_SERVICE_INTERNAL_TOKEN`.
- Projeção de Tarefa: `TASK_SERVICE_URL`, `TASK_SERVICE_INTERNAL_TOKEN`.
- Worker da outbox: `COMMERCIAL_OUTBOX_WORKER_POLL_INTERVAL_MS`, `COMMERCIAL_OUTBOX_WORKER_MAX_ATTEMPTS` e `COMMERCIAL_OUTBOX_WORKER_RETRY_BASE_MS`.
- CORS e documentação: `SERVICE_ALLOWED_ORIGINS`, `ENABLE_API_DOCS`.

```bash
pnpm --filter @workspace/commercial-service prisma:generate
pnpm --filter @workspace/commercial-service dev
pnpm --filter @workspace/commercial-service test
```

## Contrato público

O gateway publica o serviço sob `/commercial` e exige a permissão de módulo `comercial`.
Leitura exige nível 1; criação e edição exigem nível 2.

- `GET /commercial/proposal-configs`
- `GET /commercial/proposal-configs/:id`
- `POST /commercial/proposal-configs`
- `PATCH /commercial/proposal-configs/:id`
- `GET /commercial/prospecting/clients`
- `GET /commercial/prospecting`
- `GET /commercial/prospecting/:id`
- `POST /commercial/prospecting`
- `PATCH /commercial/prospecting/:id`
- `GET /commercial/outbox/status`
- `GET /commercial/task-billing`
- `PUT /commercial/task-billing/:taskId`

Cada consulta filtra `proposal.config` por `organization_id` derivado do contexto autenticado.
O serviço não cria propostas transacionais nem altera o catálogo de Clientes.
As prospecções pertencem à organização autenticada, referenciam um Cliente existente e usam somente os status legados aprovados. Alterações geram auditoria no recurso `commercial.prospecting`.

As transições são gravadas com a prospecção na outbox na mesma transação. O worker entrega o contrato interno `POST /internal/commercial/prospecting-transition` do `client-service` com token interno, tenant e correlação de auditoria; o endpoint de status expõe contagens e a última falha para suporte.

As decisões de cobrança de tarefa pertencem ao Comercial e são gravadas em `commercial.task_billing` junto com um evento outbox. O worker entrega `POST /internal/commercial/task-billing` ao `task-service`; falhas mantêm o evento reprocessável e não alteram a decisão registrada no Comercial.
