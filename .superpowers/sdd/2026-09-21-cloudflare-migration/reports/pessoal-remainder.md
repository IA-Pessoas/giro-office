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

## Fix report — findings importantes da revisão

### Findings corrigidos

1. `reconcilePendingAuditEvents` agora reivindica cada evento com transição atômica `pending -> processing` dentro de uma transação. A chamada de auditoria ocorre enquanto a reivindicação está protegida; sucesso transiciona para `processed`, e falha faz rollback ou devolve o evento para `pending`. O contrato `{ processed, pending }` foi preservado.
2. As chamadas ao `AUDIT_SERVICE` agora usam `AbortController` com timeout de 5 segundos, propagam respostas HTTP não-2xx como erro explícito e distinguem falha de transporte (`502`) de timeout (`504`). O app reutiliza a mesma rotina e não engole mais exceções; falhas não concluem eventos da outbox.

### TDD

- RED antes da implementação: `pnpm exec vitest run src/remainderServices.test.ts` — 7 testes, 3 falhas: auditoria chamada duas vezes em execução concorrente; erro HTTP e timeout resolvidos silenciosamente como `false`.
- GREEN: 7 testes passaram, incluindo a concorrência, erro HTTP e timeout.
- Refactor: imports/formatação com Biome; suíte completa permaneceu verde.

### Validação

- `pnpm test` — PASS, 3 arquivos e 20 testes.
- `pnpm typecheck` — PASS.
- `pnpm build` — PASS.
- `pnpm check` — PASS, 13 arquivos verificados.
- `pnpm exec wrangler deploy --dry-run` — PASS, 6391.56 KiB (1993.09 KiB gzip); binding `AUDIT_SERVICE` detectado, sem publicação.
- Nenhum staging real foi simulado e nenhum scheduler foi criado; esses gaps permanecem para a fase de jobs.

### Commit e limites

- A correção técnica foi incorporada ao commit `89c644eb` durante uma corrida concorrente de commit nesta checkout, junto com uma alteração documental de TI feita por outro processo. O histórico não foi reescrito e os diffs ativos de TI/User e `app/next-env.d.ts` não foram incluídos no stage desta execução.
- O relatório deste fix é o único arquivo fora de `workers/pessoal-service/**` alterado intencionalmente nesta tarefa. Nenhum deploy ou push foi executado.

## Fix report — re-review: falha de auditoria pós-commit

### Finding corrigido

`GroupAssignmentService.apply` agora mantém a resposta de sucesso depois que a mutação, a confirmação idempotente e a linha da outbox já foram persistidas. Se o `AUDIT_SERVICE` falhar com erro HTTP, transporte ou timeout, o evento permanece `pending` e seu payload recebe `metadata.auditDelivery` com status, data e erro/contexto (`code`, `statusCode` e mensagem quando disponíveis). O evento nunca é marcado como `processed` nesse caminho.

O retry com o mesmo `Idempotency-Key` devolve o snapshot confirmado sem repetir a mutação nem chamar auditoria novamente. O reconcile interno não captura esses erros explícitos: continua propagando 502/504, com a linha pendente para nova tentativa.

### TDD

- RED: `pnpm exec vitest run src/remainderServices.test.ts` — 1 falha em 8 testes; a operação rejeitava `ServiceError` 502 depois do commit em vez de resolver com sucesso.
- GREEN: o mesmo comando — 1 arquivo, 8 testes passaram; o caso também verificou uma única atualização de folha, uma chamada ao `AUDIT_SERVICE`, snapshot idempotente no retry e outbox sem `processed`.

### Validação

- `pnpm --filter @workspace/pessoal-worker test` — PASS, 3 arquivos e 21 testes.
- `pnpm --filter @workspace/pessoal-worker typecheck` — PASS.
- `pnpm --filter @workspace/pessoal-worker build` — PASS.
- `pnpm --filter @workspace/pessoal-worker check` — PASS, 13 arquivos; sem fixes do Biome.
- `pnpm exec wrangler deploy --dry-run` — PASS, 6395.12 KiB (1994.09 KiB gzip); binding `AUDIT_SERVICE` detectado, sem publicação.
- Permaneceu apenas o warning preexistente de `resolutions` em `services/src/package.json`.

### Limites

- Alterados somente `workers/pessoal-service/**` e este relatório solicitado; `workers/user-service/**`, TI, Reports e `app/next-env.d.ts` permaneceram fora do escopo.
- Nenhum deploy ou push foi executado.
