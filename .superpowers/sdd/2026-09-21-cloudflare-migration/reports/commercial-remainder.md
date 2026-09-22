# Commercial-service — paridade restante no Worker

Data: 2026-09-22

## Escopo e limites

O código alterado ficou restrito a `workers/commercial-service/**`. O relatório é o
único artefato fora desse diretório autorizado. Não houve alteração em `services/**`,
gateway, UI, outros Workers, lockfile ou `app/next-env.d.ts`. Também não houve deploy
nem push.

O plano de migração e `task-service-remainder-brief.md` foram lidos antes da edição.
Graphify foi usado primeiro com `pnpm graphify:context:services`; depois da edição,
`pnpm graphify:update:services` terminou com 9.305 nós, 16.952 arestas e 375
comunidades. A visualização HTML foi omitida pelo limite de 5.000 nós. O grafo serviu
como navegação; a comparação final foi feita contra os arquivos canônicos reais.

## TDD e implementação

O RED foi executado antes dos módulos de implementação:

```text
pnpm --filter @workspace/commercial-worker exec vitest run \
  src/remainder.routes.test.ts src/commercialServices.test.ts src/outbox.test.ts
```

O RED falhou por módulos ainda inexistentes (`commercialService`/`outbox`) e por
rotas de paridade retornando `404` no Worker que só possuía a pilotagem de
`proposal-configs`. Depois foram adicionados os testes de entrega por binding e a
implementação mínima.

O GREEN final do pacote é 5 arquivos, 10 testes aprovados, cobrindo:

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
`commercial.outbox_events` e `emails`, sem D1 ou migration nova.

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
- **Email:** o adapter de email do serviço legado não é uma rota comercial e não foi
  falsificado no Worker. O adapter, `COMMERCIAL_EMAIL_ADAPTER_TOKEN/FROM` e a fila de
  notificações continuam dependências operacionais a provisionar.

## Validação

Passaram:

```text
pnpm --filter @workspace/commercial-worker test                 # 5 files, 10 tests
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
- `pnpm typecheck`: bloqueado pelo mesmo `DATABASE_URL` ausente antes do compilador.
- `pnpm build`: bloqueado pelo mesmo prebuild de Prisma em `fiscal-service`.
- `pnpm check`: falhou em arquivo de transformação grande, fixtures de política de
  credenciais e alterações já presentes em `workers/contabil-service/**`; o check
  específico do commercial Worker passou.

Não foi usado placeholder de credencial, `--no-verify`, D1, deploy ou push.

## Gaps operacionais declarados

- **Queue:** não há binding Queue nem consumidor configurado. Existe handler
  `scheduled`, mas o `wrangler.jsonc` não declara cron; processamento automático em
  produção ainda precisa de Queue/cron autorizado.
- **Origem do scheduler:** entregas disparadas pelo handler `scheduled` exigem
  `INTERNAL_REQUEST_ORIGIN` configurada; nenhuma origem foi inventada no código.
- **Secrets:** tokens de gateway, sessão, client/task/audit e adapter de email estão
  apenas tipados/consumidos; não foram criados secrets nem valores inventados.
- **Hyperdrive:** o Worker aceita `HYPERDRIVE` e fallback `DATABASE_URL`, mas nenhum
  binding/ID de produção foi inventado. O dry-run não prova conexão PostgreSQL/Supabase.
- **Bindings e QA externo:** os nomes de Service Binding foram validados pelo dry-run,
  mas entrega real, idempotência nos Workers destino, sessão autenticada e smoke de
  produção dependem de ambientes provisionados.
- **Reporting/Storage/email:** permanecem fora do contrato de rotas canônico ou
  dependentes de infraestrutura não provisionada, conforme indicado acima.
