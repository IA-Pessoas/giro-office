# Paridade restante do contabil-service

Data: 2026-09-22
Escopo: `workers/contabil-service/**` e este relatório
Base: plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` e `task-service-remainder-brief.md`

## Limites respeitados

- Nenhum arquivo em `services/**`, gateway, UI, outro Worker, lockfile ou `app/next-env.d.ts` foi alterado por esta entrega.
- Não houve deploy, push, force-push, alteração de histórico publicado ou migração executada.
- A alteração suja preexistente em `app/next-env.d.ts` foi preservada fora do commit.
- O grafo de `services/` foi somente atualizado como artefato local do Graphify; não faz parte do commit.

## Paridade implementada

O Worker Hono agora cobre os mesmos caminhos públicos e internos do serviço contábil:

| Área | Rotas entregues | Garantias principais |
| --- | --- | --- |
| Controles | ano, arquivar/restaurar competência, criar, listar, detalhe, atualizar campo e concluir itens | filtro de carteira por competência e tenant, ordenação por nome legal, restauração e transação de arquivamento/restauração |
| Relacionamento/responsáveis | CRUD completo | isolamento por `organization_id`, duplicidade como `409`, auditoria e envelopes/status HTTP preservados |
| Fechamento | GET/PUT/DELETE de `/triagem/closing` | claims de módulo contábil, estados permitidos, tenant e arquivamento |
| Triagem documental | editabilidade, mensal, item, atualização em lote e extratos | claims de módulo ou atribuição, validação de campos/status, cliente no tenant, catálogo/snapshot, advisory lock PostgreSQL e `Serializable` nas mutações concorrentes |
| Reporting | catálogo e extração interna | token interno, grant HMAC canônico, hash do corpo, request id, TTL, campos publicados, filtros/paginação e snapshot `RepeatableRead` |
| Integrações | auditoria, resumo da Triagem e sessão do User Worker | Service Bindings sem URL de serviço configurável, propagação de identidade/tenant/claims e degradação explícita quando o resumo/auditoria não está disponível |

O schema local do Worker inclui os modelos contábeis e de triagem usados por esses caminhos, com índices únicos de tenant/cliente/competência para suportar concorrência e idempotência.

## TDD

1. RED inicial: `remainder.routes.test.ts` encontrou `404` nas rotas ainda não montadas (4 casos).
2. GREEN inicial: as rotas foram montadas com serviços injetáveis; os 7 testes existentes passaram.
3. RED de reporting: o teste assinado mostrou que a rota paginava fora do serviço e não abria o snapshot transacional.
4. GREEN de reporting: a query passou a entrar no serviço; o teste valida grant, tenant e `RepeatableRead`.
5. RED de serviço: dois testes reproduziram aceite de cliente fora do tenant e justificativa fora do catálogo.
6. GREEN final: validação de tenant, catálogo/snapshot, locks e normalização foram adicionados.

Resultado final: 3 arquivos de teste, 11 testes passando.

## Validações executadas

- `pnpm --filter @workspace/contabil-worker test` — passou, 3 arquivos / 11 testes.
- `pnpm --filter @workspace/contabil-worker typecheck` — passou.
- `pnpm --filter @workspace/contabil-worker check` — passou.
- `pnpm --filter @workspace/contabil-worker build` — passou.
- `pnpm --filter @workspace/contabil-worker exec prisma validate --schema prisma/schema.prisma` — passou.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma` — passou.
- `pnpm graphify:context:services -- "...paridade restante do contabil-service..."` — executado antes da edição.
- `pnpm graphify:update:services` — passou; grafo de services atualizado localmente.
- `pnpm exec wrangler deploy --dry-run --config workers/contabil-service/wrangler.jsonc` — passou; bundle de 6353,86 KiB / 1988,23 KiB gzip.
- `git diff --check -- workers/contabil-service` — passou.
- `git diff --check -- app/next-env.d.ts` — passou; arquivo não foi incluído.

Os comandos exibem apenas o warning preexistente de `resolutions` em `services/src/package.json`; não alterei esse arquivo.

## Gaps operacionais declarados

- O dry-run confirmou apenas os bindings `AUDIT_SERVICE`, `TRIAGEM_SERVICE` e `USER_SERVICE`. Não há `HYPERDRIVE` declarado no `wrangler.jsonc`; em produção o binding precisa ser provisionado e o Worker exige `HYPERDRIVE.connectionString`. `DATABASE_URL` fica apenas como fallback explícito para desenvolvimento/CI.
- Os secrets não estão no arquivo de configuração: `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `AUDIT_SERVICE_TOKEN`, `TRIAGEM_INTERNAL_TOKEN`, `USER_SERVICE_INTERNAL_TOKEN`, `REPORTS_INTERNAL_TOKEN` e `REPORTS_GRANT_SECRET`. Devem ser provisionados pelo ambiente/secret manager antes da publicação.
- Não foi feita validação contra PostgreSQL/Supabase real, Hyperdrive real ou bindings remotos. Os testes usam doubles de Hono/Prisma/Service Binding.
- Não foi feita validação de produção, smoke autenticado, migração ou deploy. Portanto, a entrega comprova contrato e comportamento local do Worker, não disponibilidade operacional dos bindings.

## Commit

O código do Worker e este relatório são registrados em commits locais, sem push ou deploy.
