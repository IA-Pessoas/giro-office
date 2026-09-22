# Project-service — ciclo TDD de paridade restante

Data: 2026-09-22
Commit de código: `a1533e294` (`feat(project-worker): close remainder parity gaps`)

## Escopo e descoberta

Foram lidos `docs/superpowers/plans/2026-09-21-cloudflare-migration.md`,
`.superpowers/sdd/2026-09-21-cloudflare-migration/task-service-remainder-brief.md` e o
contexto Graphify de services antes da implementação. O grafo foi atualizado depois;
ficou com 9.305 nós e 16.952 arestas. A visualização HTML foi omitida pelo limite do
Graphify, sem bloquear a análise.

O commit de código contém somente:

- `workers/project-service/prisma/schema.prisma`
- `workers/project-service/src/app.ts`
- `workers/project-service/src/app.test.ts`
- `workers/project-service/src/projectReporting.ts`
- `workers/project-service/wrangler.jsonc`

Não houve deploy nem push. `app/next-env.d.ts` permaneceu como alteração preexistente
fora do escopo.

## Paridade coberta

| Contrato | Resultado no Worker |
| --- | --- |
| Disponibilidade | `GET /health` e `GET /ready` preservados. |
| CRUD | `GET /project/list`, `GET/POST/PUT/DELETE /project`, com schemas Zod, datas, sponsor, escopo de organização e envelopes de erro/sucesso. DELETE aceita `project_id` na query quando o corpo JSON está vazio. |
| Criação concorrente | Precheck e insert ficam no mesmo `$transaction` `Serializable`; `P2002` e `P2034` viram `409`. O audit só ocorre após o commit. |
| Métricas | `GET /project/metrics` mantém agrupamentos de status e filtros de tenant. |
| Progresso | `POST /project/progress` lê projeto e `groupBy` de tarefas, calcula percentual e executa todas as mutações derivadas no mesmo snapshot `RepeatableRead`; cliente `service_unique` e auditoria permanecem pós-commit. |
| Detalhe/UI | `DETAIL_SELECT` inclui `Client.name/company_name/fantasy_name/cpf_cnpj`, `Task.name/observations`, `department` e `taskModel` com departamento; a resposta expõe também `task.model` compatível com a UI. |
| Reporting | `GET /internal/reporting/catalog` e `POST /internal/reporting/extract` preservam grants HMAC, hash/TTL, paginação e snapshot. O Worker usa allowlist local do catálogo incluindo `client_id` e `sponsor_id`, com filtros e campos verificados no handler. |
| Auth/CSRF/sessão | Fluxo existente de headers encaminhados, JWT, claims de módulo/owner, cookie `cw.session`, CSRF e validação via `USER_SERVICE` foi preservado. |
| Tenant/erros | Consultas usam `organization_id`; autorização de recurso ocorre após escopo. JSON inválido, auth, autorização, inexistência, dependência, conflito e indisponibilidade de banco mantêm códigos HTTP/envelopes esperados. |
| Persistência/bindings | PostgreSQL/Supabase e `@prisma/adapter-pg` permanecem. Não foi introduzido D1, URL de banco ou credencial Hyperdrive. |

## Schema Prisma

`workers/project-service/prisma/schema.prisma` foi alinhado ao schema canônico para o
fluxo de detalhe: `Client` usa `clients.pf` e inclui `name` e os campos de resumo;
`Task` inclui `name`, `model_id`, `department_id`, `observations` e as relações
`department`/`taskModel`; `Department` e `TaskModel` têm as relações necessárias para
os selects aninhados. O Worker e `infra/prisma/schema.prisma` passaram `prisma validate`.

O schema canônico não declara uma unique física para
`(organization_id, name, client_id)` em `Project`. Nenhuma migration foi criada sem
autorização. A proteção implementada é a transação serializável e o mapeamento de
conflitos; a criação de uma constraint/index físico continua sendo um gap de schema a
ser decidido/provisionado separadamente.

## TDD

Antes da implementação, o ciclo RED foi observado com 19 testes: 13 passando e 6
falhando nos contratos novos de 503 sem banco, schema/relações canônicas, conflito de
criação, DELETE JSON vazio, progresso transacional e reporting com `client_id`.

Depois das fatias verticais e da regressão de detalhe/UI (incluindo `sponsor_id`), a
suíte do Worker ficou GREEN: 20/20 testes.

## Validação executada

- `pnpm --filter @workspace/project-worker test` — PASS, 20/20.
- `pnpm --filter @workspace/project-worker typecheck` — PASS.
- `pnpm --filter @workspace/project-worker build` — PASS.
- `pnpm --filter @workspace/project-worker check` — PASS.
- `pnpm --filter @workspace/project-worker exec prisma validate --schema prisma/schema.prisma` — PASS.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma` — PASS.
- `pnpm graphify:update:services` — PASS; grafo atualizado, HTML omitido pelo limite de nós.
- `pnpm exec wrangler deploy --dry-run` em `workers/project-service` — PASS, sem publicação.
- `git diff --check` — PASS.
- Hook do commit — PASS; supply-chain scan sem findings.

O Wrangler dry-run mostrou somente `AUDIT_SERVICE` e `USER_SERVICE`. Não foi feito
deploy ou push.

## Gaps operacionais reais

- **Hyperdrive não configurado:** `wrangler.jsonc` não contém binding, pois nenhum ID ou
  credencial foi inventado. O Worker mantém fallback explícito para `DATABASE_URL` e
  responde `503` quando não existe `HYPERDRIVE.connectionString` nem `DATABASE_URL`.
  Produção/CI ainda precisam provisionar o binding Hyperdrive ou o secret autorizado
  antes de executar PostgreSQL no Worker.
- **Constraint de projeto:** o schema canônico não fornece unique física para a
  identidade de projeto; a transação `Serializable` cobre a corrida no código, mas a
  constraint/index definitivo permanece dependência operacional sem migration neste
  ciclo.
- **Queue:** não há rota, job ou contrato do project-service que exija Queue; portanto
  nenhum binding Queue foi inventado e não há gap aplicável nesta paridade.
- **Secrets:** `JWT_SECRET`, tokens internos, grants e tokens dos Service Bindings
  continuam dependências de ambiente; não foram embutidos no código ou no Wrangler.
