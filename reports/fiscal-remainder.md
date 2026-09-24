# Fiscal-service: paridade remanescente

Data: 2026-09-22

## Escopo e regras aplicadas

Foram lidos o plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md`, o brief `.superpowers/sdd/2026-09-21-cloudflare-migration/task-service-remainder-brief.md`, as regras `.codex/config.toml`, `.codex/rules/default.rules.md` e `.codex/rules/agent-safety.rules.md`, além do brief Graphify de `services/`.

O escopo de código desta rodada ficou limitado a `workers/fiscal-service/**`. O relatório é o único artefato fora do Worker. Não foram alterados `services/**`, gateway, UI, outros Workers ou `app/next-env.d.ts`; alterações externas já presentes foram preservadas.

## Resultado da comparação

### Rotas e envelopes

| Superfície | Worker | Contrato/paridade verificada |
| --- | --- | --- |
| Saúde | `GET /health`, `GET /ready` | envelope de sucesso, identificação `fiscal-service`, headers de segurança e `x-request-id` |
| Documentação | `GET /openapi.json` quando `ENABLE_API_DOCS` e fora de produção | spec fiscal canônico; oculto em produção |
| ICMS | `/fiscal/icms`, `/fiscal/icms/list` com `GET`, `POST`, `PUT`, `DELETE` conforme a rota | schemas, status `201` na criação, envelope e erros canônicos |
| NCM | `/fiscal/ncm`, `/fiscal/ncm/list` com `GET`, `POST`, `PUT`, `DELETE` conforme a rota | schemas, códigos numéricos, envelope e erros canônicos |
| IPI | `/fiscal/ipi`, `/fiscal/ipi/list` com `GET`, `POST`, `PUT`, `DELETE` conforme a rota | schemas, envelope, status e erros canônicos |
| Busca | `GET /fiscal/ncm-search?ncmCode=...` | validação de código, tenant e resultado combinado |
| Reporting | `GET /internal/reporting/catalog`, `POST /internal/reporting/extract` | grant HMAC, catalog sources, campos permitidos, tenant do grant e envelope |

As listagens mantêm `page`, `page_size`, máximo de 100 e resposta `{ data, total, page, limit, hasMore }`. Os filtros aceitam os formatos repetido e separado por vírgula definidos pelos schemas canônicos.

### Serviços, transações e persistência

- NCM e IPI usam o port local dos serviços Node, preservando seleção, filtros por organização, mensagens, paginação, auditoria e tratamento de `Prisma`/not-found.
- ICMS reutiliza o serviço fiscal canônico com o adaptador de auditoria do Worker.
- A busca fiscal mantém uma chamada Prisma `$transaction` para NCM, ICMS e IPI.
- Reporting mantém `withReportingSnapshot`/consulta permitida e o limite `limit + 1` para `reachedLimit`.
- `withWorkerPrisma` escolhe `env.HYPERDRIVE.connectionString` ou `env.DATABASE_URL`, instancia `PrismaPg` e desconecta no `finally`.
- O schema local usa PostgreSQL e os mapas físicos `fiscal.icms`, `fiscal.ncm` e `fiscal.ipi`; não há D1, migração D1, URL interna hardcoded ou mudança no schema físico.

### Auth, CSRF, sessão, claims e tenant

O Worker valida token interno e claims encaminhados pelo gateway, JWT Bearer e permissões do módulo `fiscal`. Leitura exige módulo fiscal `>= 1`; escrita `>= 2`; exclusão exige permissão global `3`. `organization_id` é obrigatório e é passado para todas as leituras, buscas, gravações e extrações de reporting.

O gap fechado nesta rodada era o caminho de identidade encaminhada com cookie: antes, `forwardedAuth` retornava diretamente e pulava a validação da sessão. Agora o cookie `cw.session` é usado como token para `validateWorkerSession` no `USER_SERVICE`; mutações também exigem cookie/header CSRF válidos contra o `csrf_hash` dos claims. O caminho Bearer/cookie direto continua coberto.

Mutações fiscais exigem `AUDIT_SERVICE` e `AUDIT_SERVICE_TOKEN` antes de persistir. O `request-id`, CORS, headers de segurança, envelopes de sucesso e `serializeError` com status/código/request-id são preservados.

## TDD

Foi adicionada primeiro a especificação pública em `workers/fiscal-service/src/remainder.routes.test.ts` para identidade encaminhada com cookie:

```text
pnpm --filter @workspace/fiscal-worker exec vitest run src/remainder.routes.test.ts
RED: 1 falha em 17 testes; USER_SERVICE não era chamado (0 chamadas).
```

Depois foi feita a menor mudança em `workers/fiscal-service/src/auth.ts`: manter os claims encaminhados, mas executar `requireCookieSession` também nesse caminho e reaproveitar o token do cookie. O mesmo teste passou em GREEN com 17/17; a suíte final passou com 3 arquivos e 27/27 testes.

## Validação executada

Todos os comandos abaixo terminaram com código 0:

```text
pnpm --filter @workspace/fiscal-worker test
pnpm --filter @workspace/fiscal-worker typecheck
pnpm --filter @workspace/fiscal-worker build
pnpm --filter @workspace/fiscal-worker check
pnpm --filter @workspace/fiscal-worker exec prisma validate --schema prisma/schema.prisma
pnpm exec prisma validate --schema infra/prisma/schema.prisma
pnpm graphify:update:services
pnpm exec wrangler deploy --config workers/fiscal-service/wrangler.jsonc --dry-run
git diff --check
```

O contexto Graphify foi gerado antes da análise com `pnpm graphify:context:services -- "fiscal-service worker remainder parity: NCM ICMS IPI search pagination reporting integrations auth CSRF session claims tenant transactions Prisma bindings errors"`. A atualização posterior reconstruiu o grafo de `services/` com 9.305 nós e 16.952 arestas; os artefatos locais permaneceram fora do commit.

O dry-run do Wrangler empacotou 6.313,34 KiB (1.981,64 KiB gzip) e identificou os bindings `AUDIT_SERVICE` e `USER_SERVICE`. Não houve deploy nem push.

## Gaps e limites de aceitação

- `HYPERDRIVE` não foi inventado no `wrangler.jsonc`: falta um ID/autorização de produção. O código aceita o binding quando provisionado e mantém `DATABASE_URL` apenas como fallback local/operacional.
- JWT, token interno, tokens dos bindings, segredo de grant de reporting e demais secrets não foram criados nem publicados. A validação usou fixtures locais e bindings fake.
- Não foi executado smoke autenticado contra PostgreSQL/Supabase real, Hyperdrive, gateway, `USER_SERVICE`, `AUDIT_SERVICE` ou `reports-service`; portanto os testes comprovam contrato local, não conectividade de produção.
- O Node publica Swagger UI em `/docs`; o Worker publica somente `/openapi.json`. O helper existente depende de Express/`swagger-ui-express` e não foi levado para o runtime Hono.
- O recorder do Worker faz uma tentativa best-effort com timeout para auditoria; o recorder Node possui buffer/retry. A persistência e o bloqueio de configuração estão preservados, mas retry assíncrono exige uma decisão própria de `waitUntil`/fila no runtime Worker.
- `/ready` é um endpoint leve de contrato, não uma prova de conexão com banco; a prova real continua dependente de configuração e smoke externo.

Nenhum desses gaps foi mascarado como sucesso de produção.
