# Commercial-service — paridade restante no Worker

Data: 2026-09-22

## Revalidação desta execução

As rotas do Node foram comparadas novamente com o Worker: configurações de proposta, prospecção de clientes, tarefas de faturamento e estado do outbox estão presentes com os contratos de autenticação, tenant, permissões, paginação, envelopes e erros. A paridade de código já estava fechada nos commits `31d7f5eb`, `f9b2196a` e `4c09ed5c`; não houve alteração de código Commercial nesta rodada.

Validações: testes completos com 9 arquivos e 26 testes, typecheck, build, check, `prisma validate` e `wrangler deploy --dry-run` aprovados. Este arquivo é a atualização separada do relatório.

A lacuna permanece explícita: não há binding Queue configurado para entrega do outbox e não se deve simular sucesso. Cron, retry, lease, idempotência, auditoria e os guards existentes foram revalidados localmente; Hyperdrive/DATABASE_URL, adaptador de email e smoke autenticado em staging/produção ainda precisam de configuração e validação reais.

## Terceiro ciclo TDD — re-review

O RED foi executado antes das correções do re-review:

```text
pnpm --filter @workspace/commercial-worker exec vitest run \
  src/commercialEmail.test.ts src/app.test.ts
```

Falhou em três pontos: claim concorrente sem CAS explícito por geração, URL HTTP
aceita em produção e request-id gerado apenas no header de resposta. O GREEN passou
com 9 testes focados e a suíte completa passou com 9 arquivos e 26 testes.

- O claim existente agora inclui `attempts` no compare-and-set por `id/event_id` e
  lease; o complete/fail já exige o mesmo token. O teste concorrente usa dois
  `notify()` e prova `sends=1`.
- `createCommercialEmailAdapter()` rejeita URL não-HTTPS por padrão e só permite
  HTTP explícito em `NODE_ENV=test|development`. Nenhum secret ou endpoint foi
  inventado.
- O middleware normaliza `x-request-id` uma vez no início, guarda o valor no
  contexto, usa-o nas mutações/eventos outbox e devolve o mesmo header; auditoria,
  bindings e email continuam recebendo a mesma correlação.

## Segundo ciclo TDD — correções dos achados

O RED deste ciclo foi executado antes da implementação:

```text
pnpm --filter @workspace/commercial-worker exec vitest run \
  src/outbox.fencing.test.ts src/commercialEmail.test.ts src/outboxDelivery.test.ts \
  src/commercialServices.test.ts src/wrangler.test.ts src/index.test.ts
```

Ele falhou pelos contratos ainda ausentes: módulo de email, cron, guard do
scheduler, fencing, envelope/headers de binding e mapeamento P2002/P2034. Depois
das correções, o GREEN ficou em 9 arquivos e 23 testes aprovados.

Foram implementados, somente no Worker Commercial:

- cron `*/1 * * * *` em `wrangler.jsonc`, handler `scheduled`, README e guards
  explícitos para HYPERDRIVE/DATABASE_URL, origem interna e bindings/tokens de
  client/task; não foi inventado Queue ID, secret ou URL;
- modelo `CommercialEmailNotification` no schema do Worker, já previsto no schema
  canônico, sem migration nova; adapter HTTP configurável e fluxo persistente
  `processing/sent/skipped/failed` com `attempts`, `message` e `last_error`;
- fechamento canônico condicionado a `service_unique === false` e cadastro não
  `Existente`; adapter ausente persiste `failed`, audita quando possível e relança
  erro observável; o status aparece em `/commercial/outbox/status`;
- fencing usando a coluna persistente existente `commercial.outbox_events.attempts`
  como geração do claim; conclusão/falha exigem `id + status + attempts`, e o teste
  concorrente prova que lease estale não sobrescreve o worker atual;
- P2002/P2034 e serialização/deadlock PostgreSQL como 409 em proposta, prospecção e
  billing;
- envelope de prospecção sem `organization_id`, validação estrita de
  `success === true`/`data` nas bindings e `x-request-id` propagado para
  client/task/audit/email.

O cron não mascara gaps externos: sem configuração de email o envio não é alegado;
sem Hyperdrive/Database o scheduler falha fechado; Queue continua sem binding.

## Escopo e limites

O código alterado ficou restrito a `workers/commercial-service/**`. O relatório é o
único artefato fora desse diretório autorizado. Não houve alteração em `services/**`,
gateway, UI, outros Workers, lockfile ou `app/next-env.d.ts`. Também não houve deploy
nem push.

O plano de migração e `task-service-remainder-brief.md` foram lidos antes da edição.
Graphify foi usado primeiro com `pnpm graphify:context:services`; depois da edição,
`pnpm graphify:update:services` terminou com 9.305 nós, 16.952 arestas e 370
comunidades. A visualização HTML foi omitida pelo limite de 5.000 nós. O grafo serviu
como navegação; a comparação final foi feita contra os arquivos canônicos reais.

## TDD e implementação do ciclo anterior

O RED foi executado antes dos módulos de implementação:

```text
pnpm --filter @workspace/commercial-worker exec vitest run \
  src/remainder.routes.test.ts src/commercialServices.test.ts src/outbox.test.ts
```

O RED falhou por módulos ainda inexistentes (`commercialService`/`outbox`) e por
rotas de paridade retornando `404` no Worker que só possuía a pilotagem de
`proposal-configs`. Depois foram adicionados os testes de entrega por binding e a
implementação mínima.

O baseline anterior do pacote era 5 arquivos e 10 testes; o segundo ciclo acima
adicionou os testes de regressão e elevou o resultado para 9 arquivos e 23 testes.
O conjunto cobre:

- todas as rotas comerciais canônicas e o contexto de organização;
- claims `comercial` para leitura nível 1 e escrita nível 2;
- CSRF antes da validação de sessão quando há cookie;
- tenant e criação transacional de prospecção + evento outbox;
- lease, retry, backoff, limite de tentativas e entrega por Service Binding;
- indisponibilidade explícita de PostgreSQL como `503`.

## Paridade de rotas e serviços

Foram preservados os envelopes de sucesso/erro, `x-request-id`, validação Zod,
status HTTP e escopo por `organization_id` para:

- `GET/POST /commercial/proposal-configs`;
- `GET/PATCH/DELETE /commercial/proposal-configs/:id`;
- `GET /commercial/prospecting/clients`;
- `GET/POST /commercial/prospecting`;
- `GET/PATCH/DELETE /commercial/prospecting/:id`;
- `GET /commercial/task-billing`;
- `PUT /commercial/task-billing/:taskId`;
- `GET /commercial/outbox/status`.

O schema Prisma do Worker mapeia PostgreSQL para `proposal.config`, `clients`,
  `commercial.prospecting`, `integracao.tasks`, `commercial.task_billing`,
`commercial.outbox_events`, `emails` e `commercial.email_notifications`, sem D1 ou
migration nova.

Prospecção mantém cliente no mesmo tenant, unicidade por organização/cliente,
transições válidas, terminal `Fechado`, arquivamento idempotente e auditoria. Billing
mantém a verificação da tarefa no tenant, conflito de ownership e upsert transacional.
Proposal mantém duplicidade, referências, auditoria de cadastro/alteração/exclusão e
os erros `404`/`409` canônicos.

O outbox grava o evento na mesma transação da mutação. O scheduler processa um evento
por vez com claim condicional, recupera leases expirados, incrementa tentativas,
reagenda com backoff limitado e marca `failed` após o limite. A entrega usa somente
Service Bindings para client/task/audit, com token interno por destino e caminhos
internos; não há URL de serviço configurada ou hardcoded para alcançar outro Worker.
A auditoria HTTP deriva a origem da requisição corrente.

Auth cobre token interno encaminhado pelo gateway, bearer/JWT, organização, claims de
módulo, owner/platform-admin, cookie de sessão, CSRF para mutações e validação de
sessão via `USER_SERVICE`. Sem `HYPERDRIVE.connectionString` ou `DATABASE_URL`, o
Worker falha fechado com `503`.

## Comparações solicitadas e limites preservados

- **Reporting:** o OpenAPI e as rotas canônicas do commercial-service não expõem
  reporting comercial. Nenhuma rota foi inventada; reporting continua uma lacuna de
  contrato futuro e não foi expandido fora do escopo.
- **Storage:** não há rota, serviço ou bucket Storage comercial canônico. Nenhuma
  integração foi inventada.
- **Paginação:** as listas canônicas são não paginadas; esse contrato foi preservado.
- **Erros:** parsing, autenticação, CSRF, tenant, conflitos, referências, payload
  inválido e indisponibilidade do banco passam pelo envelope compartilhado de erro.
- **Email:** o adapter mínimo preserva o registro canônico e não finge envio. URL,
  token e from continuam dependências operacionais a provisionar.

## Validação

Passaram:

```text
pnpm --filter @workspace/commercial-worker test                 # 9 files, 26 tests
pnpm --filter @workspace/commercial-worker typecheck
pnpm --filter @workspace/commercial-worker check
pnpm --filter @workspace/commercial-worker build
pnpm --filter @workspace/commercial-worker exec prisma validate --schema prisma/schema.prisma
pnpm graphify:update:services
pnpm exec wrangler deploy --config workers/commercial-service/wrangler.jsonc --dry-run
git diff --check
```

O dry-run do Wrangler mostrou somente `CLIENT_SERVICE`, `TASK_SERVICE` e
`AUDIT_SERVICE`; ele não publicou nada.

Os gates raiz foram executados, mas não são verdes por limites preexistentes do
workspace:

- `pnpm test`: 127/127 testes de scripts passaram; o Turbo parou na geração Prisma
  por `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`.
- `pnpm typecheck`: não chegou ao compilador; o gerador Prisma raiz ficou bloqueado
  pelo lock local durante a tentativa sem configuração de banco. Após verificar que
  não havia processo gerador ativo, o lock órfão gerado em `.turbo` foi removido; não
  houve alteração em arquivo versionado.
- `pnpm build`: bloqueado pelo mesmo prebuild de Prisma em `organization-service`.
- `pnpm check`: falhou em arquivo de transformação grande, fixtures de política de
  credenciais, `any` preexistente em client-service e formatação já presente em
  `workers/contabil-service/**`; o check específico do commercial Worker passou.

Não foi usado placeholder de credencial, `--no-verify`, D1, deploy ou push.

## Gaps operacionais declarados

- **Queue:** não há binding Queue, Queue ID ou consumidor configurado. O caminho
  automático desta entrega é o cron `*/1 * * * *` no handler `scheduled`; Queue
  permanece gap de provisionamento.
- **Origem do scheduler:** entregas disparadas pelo handler `scheduled` exigem
  `INTERNAL_REQUEST_ORIGIN` configurada; nenhuma origem foi inventada no código.
- **Secrets:** tokens de gateway, sessão, client/task/audit e adapter de email estão
  apenas tipados/consumidos; não foram criados secrets nem valores inventados.
- **Hyperdrive:** o Worker aceita `HYPERDRIVE` e fallback `DATABASE_URL`, mas nenhum
  binding/ID de produção foi inventado. O dry-run não prova conexão PostgreSQL/Supabase.
- **Bindings e QA externo:** os nomes de Service Binding foram validados pelo dry-run,
  mas entrega real, idempotência nos Workers destino, sessão autenticada e smoke de
  produção dependem de ambientes provisionados.
- **Reporting/Storage/email:** reporting e Storage permanecem fora do contrato de
  rotas canônico; email tem adapter observável, mas depende de infraestrutura externa
  não provisionada.
