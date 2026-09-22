# Client-service — paridade restante no Worker

Data: 2026-09-22
Escopo implementado: `workers/client-service/**`

## Resultado

O Worker passou a cobrir as rotas e contratos restantes do `services/client-service`, mantendo PostgreSQL via Prisma/Hyperdrive e Supabase Storage privado. Não foi introduzido D1 nem URL de produção hardcoded.

## TDD

O RED foi escrito antes da implementação:

- PA, verticais, autorização por módulo, rota comercial interna e reporting inicialmente responderam `404`.
- A suíte de Storage inicialmente falhou porque o adapter ainda não existia.

Depois da implementação, a suíte do Worker ficou verde: 3 arquivos, 13 testes aprovados.

## Paridade entregue

- CRUD/listagem: tenant por `organization_id`, paginação, busca, status simples, `ref=integracao`, `ref=deps`, envelopes e erros.
- Integração: lookup por `CNPJ_SERVICE`/`CNPJ_SERVICE_URL`, criação/atualização com normalização documental e níveis de módulo.
- Históricos: criação/edição/listagem/detalhe/pendências, multipart, limite de 10 MB, MIME e assinatura compartilhada, caminho privado, download/remove no adapter e signed URL de 300 segundos.
- PA: criação, detalhe e atualização.
- Verticais: distrato transacional com paralisação de tarefas, Financeiro e Regularize.
- Internos: atualização de competência, projeção comercial idempotente por evento e catálogo/extract de reporting com grant canônico HMAC, tenant do grant e snapshot Repeatable Read.
- Segurança: claims de módulo, organização, permissionamento, sessão/CSRF encaminhados, validação de cookie via `USER_SERVICE` e falha fechada quando a configuração de sessão está ausente.
- Bindings: `AUDIT_SERVICE` e `USER_SERVICE` declarados no Wrangler; Storage, CNPJ e reporting usam bindings/segredos/env, sem endpoint fixo.

## Validação

| Verificação | Resultado |
|---|---|
| `pnpm --filter @workspace/client-worker test` | PASS — 13/13 |
| `pnpm --filter @workspace/client-worker typecheck` | PASS |
| `pnpm --filter @workspace/client-worker build` | PASS |
| `pnpm --filter @workspace/client-worker check` | PASS, com avisos existentes de `noExplicitAny` no service adapter |
| `prisma validate --schema prisma/schema.prisma` | PASS |
| `pnpm graphify:context:services` antes da edição | PASS; candidatos do client-service identificados |
| `pnpm graphify:update:services` após a edição | PASS; grafo de services atualizado |
| `wrangler deploy --dry-run` | PASS; bindings `AUDIT_SERVICE` e `USER_SERVICE` visíveis |
| `git diff --check` | PASS para o escopo do client |

## Gaps reais de configuração

1. A configuração raiz não possui `DATABASE_URL`; por isso o `prisma:generate` global falhou com `PrismaConfigEnvError`, bloqueando `pnpm test`, `pnpm typecheck` e `pnpm build` completos antes de executar os pacotes dependentes. Nenhum valor fictício foi criado.
2. O Wrangler ainda não tem um ID autorizado de Hyperdrive. O runtime aceita `HYPERDRIVE`, mas a provisão do ID PostgreSQL precisa ocorrer fora deste escopo.
3. Lookup de CNPJ exige `CNPJ_SERVICE` ou `CNPJ_SERVICE_URL`; sem um deles a rota retorna `503` por desenho.
4. Upload/signed URL exige `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e bucket `CLIENT_HISTORY_BUCKET` privado; sem isso Storage retorna `503` ou rejeita bucket público.
5. Reporting interno exige `REPORTS_INTERNAL_TOKEN` e `REPORTS_GRANT_SECRET`.
6. Sessão baseada em cookie exige `USER_SERVICE_INTERNAL_TOKEN`; sem esse segredo a mutação falha fechado com `503` após validar CSRF.

## Commits e limites

O código do client foi efetivamente incorporado no commit `7013c6ec` durante uma corrida concorrente de commits; esse commit também contém um relatório de `project-worker` criado pelo outro fluxo. O relatório deste serviço é separado neste commit posterior. Não houve deploy nem push.

Permanece uma alteração preexistente do usuário em `app/next-env.d.ts`, sem edição. Alterações externas em `project-worker` e o relatório de outro serviço foram preservadas e não foram tratados como parte desta entrega.
