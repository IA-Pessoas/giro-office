# Project-service remainder — paridade no Worker

Data: 2026-09-22
Commit de código: `060c7998f` (`feat(project-worker): complete project-service parity`)

## Escopo aplicado

Foi lido o plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` e o brief `.superpowers/sdd/2026-09-21-cloudflare-migration/task-service-remainder-brief.md`. O contexto Graphify de services foi gerado antes da implementação e atualizado depois (`9305` nós, `16952` arestas; visualização HTML omitida pelo limite do grafo).

O commit de código contém somente:

- `workers/project-service/prisma/schema.prisma`
- `workers/project-service/src/app.ts`
- `workers/project-service/src/app.test.ts`
- `workers/project-service/src/auth.ts`
- `workers/project-service/src/env.ts`
- `workers/project-service/wrangler.jsonc`

Não houve deploy nem push. Alterações paralelas em `workers/client-service/**` e `app/next-env.d.ts` permaneceram fora do commit.

## Paridade entregue

| Contrato | Implementação Worker |
| --- | --- |
| Disponibilidade | `GET /health` e `GET /ready` |
| CRUD | `POST/GET/PUT/DELETE /project` e `GET /project/list`, com schemas Zod, datas, sponsor, isolamento por `organization_id`, duplicidade, dependências e envelopes de sucesso/erro |
| Métricas | `GET /project/metrics`, com os mesmos agrupamentos de status de projeto/tarefa e escopo por organização |
| Progresso | `POST /project/progress`, agrupamento de tarefas, arredondamento, transação em 100%, inativação de cliente `service_unique` e auditoria |
| Reporting interno | `GET /internal/reporting/catalog` e `POST /internal/reporting/extract`, grants canônicos assinados por HMAC, hash do body, TTL, campos publicados, filtros, snapshot Repeatable Read e paginação `limit + 1` |
| Auth e claims | headers encaminhados pelo Gateway, bearer JWT HS256, `user_id`, organização, tipo, permission, módulos e claims de sessão; `integracao` aplica a matriz existente, com owner/admin conforme o contrato |
| Sessão/CSRF | cookie `cw.session`, cookie/header CSRF, hash encaminhado e validação via binding `USER_SERVICE`; falha de configuração retorna `503`, sessão inválida preserva `401/409` |
| Tenant | CRUD, métricas, tarefas, cliente, progresso e reporting filtram pela organização autenticada; autorização de recurso ocorre depois da busca escopada para preservar `404` de isolamento |
| Transações/auditoria | Prisma request-scoped via `withWorkerPrisma`/`PrismaPg`; criação e conclusão de progresso usam `$transaction`; auditoria usa `AUDIT_SERVICE` best-effort |
| Erros | JSON inválido `400`, autenticação `401`, autorização/grant `403`, recurso `404`, dependência `409`, sessão/binding indisponível `503`, com envelope compartilhado |
| Persistência | PostgreSQL/Supabase preservado; schema Worker inclui `Project`, `Client` e `Task` mínimos para os contratos; nenhum D1 ou URL de banco foi introduzido |

## TDD

Antes da implementação, a suíte ampliada foi executada em RED: 8 testes, 6 falhas, cobrindo as rotas CRUD completas, autorização de módulo, JSON/CSRF, sessão, métricas/progresso e reporting ainda ausentes.

Depois da implementação, a suíte do Worker ficou GREEN com 13 testes passando, incluindo a validação de que a sessão downstream recebe o token do cookie e a autorização do recurso só ocorre após o escopo da organização.

## Validação

- `pnpm --filter @workspace/project-worker test` — PASS, 13/13.
- `pnpm --filter @workspace/project-worker typecheck` — PASS.
- `pnpm --filter @workspace/project-worker build` — PASS.
- `pnpm --filter @workspace/project-worker check` — PASS.
- `pnpm --filter @workspace/project-worker exec prisma validate --schema prisma/schema.prisma` — PASS.
- `pnpm graphify:update:services` — PASS; grafo atualizado sem gerar HTML por exceder o limite de nós.
- `git diff --check` — PASS.
- `pnpm exec wrangler deploy --dry-run` em `workers/project-service` — PASS; upload calculado, sem publicação.
- Hook de commit — PASS, incluindo supply-chain scan sem findings.

O `pnpm check` raiz terminou com exit 0, mas exibiu warnings existentes/fora do escopo, incluindo fixtures de `${{ secrets.* }}`, o JSON de 4 MiB e arquivos alterados em `workers/client-service/**`.

Os gates raiz `pnpm test`, `pnpm typecheck` e `pnpm build` não completaram: o pipeline parou ao executar geração Prisma por `PrismaConfigEnvError` (`DATABASE_URL` ausente), respectivamente durante `@workspace/regularize-service#prisma:generate`, o pre-typecheck raiz e `@workspace/department-service#build`. Nenhum placeholder/credencial foi inventado para mascarar essa dependência.

## Gaps operacionais reais

- **Hyperdrive ausente:** o `wrangler.jsonc` não declara binding `HYPERDRIVE`; o dry-run mostrou apenas `AUDIT_SERVICE` e `USER_SERVICE`. O runtime aceita `HYPERDRIVE` ou `DATABASE_URL`, mas a configuração de produção ainda precisa de um binding Hyperdrive provisionado e autorizado antes de executar PostgreSQL no Worker.
- **Queue:** não há gap aplicável neste serviço. O contrato restante do project-service é síncrono; nenhuma rota ou job exige Queue.
- **Secrets:** `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET`, `AUDIT_SERVICE_TOKEN` e `USER_SERVICE_INTERNAL_TOKEN` precisam ser provisionados pelo ambiente. Eles não foram embutidos no código nem no `wrangler.jsonc`.
- **Storage:** não há operação de Storage no contrato do project-service comparado; nenhuma integração foi removida ou substituída.
