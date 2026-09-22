# Relatório — restante de Pessoal no Worker

## Escopo

Implementado somente em `workers/pessoal-service/**`, comparando:

- `services/pessoal-service/src/routes/groupAssignment.routes.ts`
- `services/pessoal-service/src/routes/groupAssignmentOutbox.routes.ts`
- `services/pessoal-service/src/routes/unionNotification.routes.ts`
- `services/pessoal-service/src/services/groupAssignmentService.ts`
- `services/pessoal-service/src/services/unionNotificationService.ts`

Os serviços Node, gateway, UI e `app/next-env.d.ts` não foram alterados.

## Rotas migradas

- `GET /pessoal/group-assignments/eligible`
- `POST /pessoal/group-assignments/previews`
- `GET /pessoal/group-assignments/previews/:preview_id`
- `POST /pessoal/group-assignments/apply`
- `POST /internal/pessoal/group-assignments/audit-outbox/reconcile`
- `POST /internal/pessoal/union-notifications/run`

O Worker reutiliza os schemas Zod existentes, mantém envelopes, permissões 1/2, escopo por organização, `Idempotency-Key`, fingerprint, TTL, revalidação de folha/grupo, locks transacionais, outbox de auditoria e deduplicação de notificações por organização/usuário/sindicato/título/data.

## Prisma mínimo

O schema local recebeu somente os campos/modelos necessários para as tabelas já existentes no schema compartilhado:

- `Client.name` e `User.status`;
- `Permission`;
- `PessoalGroupAssignmentPreview`, `PessoalGroupAssignmentPreviewDetail`, `PessoalGroupAssignmentConfirmation` e `PessoalAuditOutboxEvent`;
- `PessoalNotification`;
- relações/índices necessários para preview, confirmação, folha e outbox.

Não foi criada migration, tabela paralela ou schema D1.

## TDD

RED observado antes do código:

```text
pnpm exec vitest run src/remainder.routes.test.ts src/remainderServices.test.ts
4 rotas falharam com 404; a suíte de serviços falhou porque remainderServices.js ainda não existia.
```

GREEN após a implementação mínima:

```text
pnpm exec vitest run src/remainder.routes.test.ts src/remainderServices.test.ts
2 arquivos, 8 testes passaram
```

Depois do refactor de imports/formatação, a suíte completa passou com 17 testes.

## Validação

Executado no Worker:

```text
pnpm --filter @workspace/pessoal-worker test       PASS — 3 arquivos, 17 testes
pnpm --filter @workspace/pessoal-worker typecheck  PASS
pnpm --filter @workspace/pessoal-worker build      PASS
pnpm --filter @workspace/pessoal-worker check      PASS — Biome
pnpm exec wrangler deploy --dry-run                PASS — 6390.31 KiB, gzip 1992.79 KiB
```

O dry-run foi executado a partir de `workers/pessoal-service`; executá-lo na raiz do monorepo produz apenas o erro de detecção de aplicação do Wrangler. Nenhum deploy foi publicado.

Também foram conferidos os gates de supply chain: `app/postcss.config.js` com 94 bytes e `lint-staged.config.mjs` com 766 bytes.

Os comandos exibiram o warning preexistente sobre `resolutions` em `services/src/package.json`; não bloqueou os gates do Worker.

## Lacunas

- Não houve teste contra PostgreSQL/Supabase de staging ou clone, nem smoke com binding real `AUDIT_SERVICE`.
- Não houve preview endpoint, smoke funcional autenticado ou verificação de logs de produção; o dry-run comprova somente empacotamento/bindings.
- Sem `AUDIT_SERVICE`, a auditoria do apply permanece pendente na outbox; o Worker não marca auditoria como processada silenciosamente.
- A execução agendada/Queue do reconcile e da notificação não foi criada nesta unidade; as rotas internas com token foram portadas conforme o contrato solicitado.

## Commits

- `a0f0ec04 feat(pessoal-worker): migrate assignment and internal notifications`
- O relatório será registrado no commit documental seguinte, sem incluir alterações alheias do workspace.

Alterações preexistentes em RH, TI, User e `app/next-env.d.ts` permaneceram fora dos commits desta tarefa.
