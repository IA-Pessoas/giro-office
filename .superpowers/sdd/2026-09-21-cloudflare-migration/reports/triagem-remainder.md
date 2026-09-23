# Ciclo TDD — paridade restante do triagem-service

Data: 2026-09-22
Branch: `agent-triagem-remainder` (a partir de `2d4ebe02`, `cloudflare-migration`)
Escopo autorizado: `workers/triagem-service/**` e este relatório
Referências: plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` e brief `task-service-remainder-brief.md`, lidos do workspace principal porque não estão versionados nesta base.

## Limites e método

- Graphify: o grafo `services/graphify-out/` não existe no worktree. O contexto foi obtido com `pnpm graphify:context:services -- "paridade triagem-service worker"`, executado no workspace principal, que é só leitura e tem o grafo no mesmo commit `2d4ebe02`. Em seguida os arquivos foram lidos diretamente.
- O serviço canônico `services/triagem-service` serviu só de referência. Nenhum arquivo em `services/**`, gateway, runtime, shared, UI, lockfile, migrations, `app/next-env.d.ts` ou outros Workers foi alterado. Os modelos de triagem do contábil (`TriageMonthly` e outros) não foram tocados.
- Setup: `pnpm install --frozen-lockfile` sem alterar o lockfile. Ele terminou com o aviso `ERR_PNPM_IGNORED_BUILDS` de scripts de build ignorados, e `git status` ficou limpo. Para os testes resolverem, foram executados `pnpm --filter @workspace/shared build`, `pnpm --filter @workspace/runtime build` e `prisma:generate` do `@workspace/triagem-service`. Esse último usou um `DATABASE_URL` local apenas para a geração, sem conexão nem versionamento.
- Os configs sensíveis estão íntegros: `app/postcss.config.js` tem 94 bytes e `lint-staged.config.mjs` tem 766 bytes. Nada suspeito foi encontrado.

## Inventário de rotas: Node × Worker

Auth em todas as rotas `/triagem/*`: auth encaminhada pelo gateway (`x-internal-service-token` junto com `x-auth-user-id` e `x-auth-organization-id`) ou `Authorization: Bearer`. A permissão por módulo (`triagem`, com fallback para `permission` global) e o contexto de organização/RLS (`SET LOCAL ROLE giro_user_runtime` e `app.organization_id`) são aplicados dentro dos services canônicos. O envelope é `createSuccessResponse`. Os erros saem de `serializeError`, com `requestId`.

| Método | Path | Validação | Paginação | Status antes | Status agora |
|---|---|---|---|---|---|
| GET | `/health` | — | — | ok | ok (+ `x-request-id`) |
| GET | `/ready` | — | — | parcial (500 sem DB) | fechada (503 explícito sem HYPERDRIVE/DATABASE_URL) |
| GET | `/triagem/catalogs` | `listTriageCatalogQuerySchema` | — | lacuna (reimplementação local sem RLS e sem `client_id`/`competence`/snapshot) | fechada (service canônico) |
| POST | `/triagem/catalogs` | `createTriageCatalogBodySchema` | — | lacuna (sem RLS, lock, validação HTTPS, mensagens) | fechada |
| PATCH | `/triagem/catalogs/:id` | `updateTriageCatalogBodySchema` | — | lacuna (idem) | fechada |
| PATCH | `/triagem/catalogs/:id/archive` | params | — | lacuna (idem) | fechada |
| GET | `/triagem/overview` | `listTriageOverviewQuerySchema` | `page`/`page_size` | ok | ok |
| GET/POST | `/triagem/external-links` | schemas Node | — | ok | ok |
| PUT | `/triagem/external-links/:id` | schemas Node | — | ok | ok |
| PATCH | `/triagem/external-links/:id/archive` | params | — | ok | ok |
| GET/POST | `/triagem/competencies` | schemas Node | — | ok | ok |
| PATCH | `/triagem/competencies/:id/archive` | params | — | ok | ok |
| GET | `/triagem/competencies/:id/history` | schemas Node | `page`/`page_size` | ok | ok |
| GET/POST | `/triagem/urgent-requests` | schemas Node | — | ok | ok |
| PUT | `/triagem/urgent-requests/:id` | schemas Node | — | ok | ok |
| PATCH | `/triagem/urgent-requests/:id/close` | `closeTriageUrgentRequestBodySchema` | — | ok | ok |
| PATCH | `/triagem/urgent-requests/:id/reopen` | params | — | ok | ok |
| POST | `/internal/triagem/audit/reconcile` | auth, depois token interno (401/403) | — | lacuna (sem dispatcher: nunca despachava ao audit-service) | fechada (dispatch via `AUDIT_SERVICE`; 503 sem binding/token) |
| GET | `/docs` (OpenAPI, só com `ENABLE_API_DOCS`) | — | — | ausente | lacuna aceita (ferramenta de dev; não portada) |

Lacunas transversais fechadas:

- **Auth:** o Worker aceitava o cookie de sessão `cw.session` sem CSRF nem validação de sessão, e o Node não aceita cookie. Agora a auth é só Bearer ou encaminhada, e a mensagem para header ausente é a do Node (`Token de autenticação não informado.`).
- **Módulos:** o Worker normalizava módulos ausentes para `triagem = 0` e bloqueava quem tinha `x-auth-permission`. Agora `modules` fica ausente quando o gateway não o envia, e o service cai para a permissão global, como no `requestContext` Node. Um header de módulos com JSON inválido ou não-objeto também é tratado como ausente.
- **JSON inválido:** passou de 500 para 400.
- **`x-request-id`:** agora é propagado ou gerado na resposta e no corpo de erro, como o `requestContext` Node.

## Correções TDD

Os testes RED foram escritos em `src/remainder.routes.test.ts` (8 testes) e `src/wrangler.test.ts` (1 teste). Os 9 falharam antes da implementação, com 500 em vez de 200/400/503, 403 em vez de 200, mensagem 401 divergente e binding ausente. Depois vieram as mudanças mínimas até GREEN:

1. **Catálogo canônico:** o `localService` foi removido, e as quatro rotas usam `TriageCatalogService` de `services/triagem-service` com a assinatura `(input, auth)` do Node. O teste usa um Prisma falso e verifica a ordem de `SET LOCAL ROLE` e `set_config`, o filtro por `client_id`/`competence` e o 403 `Permissão insuficiente para alterar a Triagem.` sem chamar `create`.
2. **Fallback de permissão global:** auth encaminhada com `x-auth-permission: 2` e sem módulos devolve 200, e o DTO sai sem `organization_id`.
3. **Somente Bearer:** sem header devolve 401 com a mensagem Node; só com cookie devolve 401; um Bearer válido devolve 200.
4. **JSON inválido e request-id:** JSON inválido devolve 400, com `x-request-id` ecoado no header e no corpo; `/health` gera um UUID.
5. **Guard de banco:** `/ready` e as rotas devolvem 503 sem `HYPERDRIVE`/`DATABASE_URL`, sem DSN inventado.
6. **Reconciliação e dispatch:** o INSERT idempotente na outbox (`ON CONFLICT (event_key) DO NOTHING`) roda, e o evento é enviado a `https://audit-service/internal/audit/requests` com `x-internal-service-token = AUDIT_SERVICE_TOKEN` e payload idêntico ao do dispatcher Node. O resultado é `{reconciled, dispatched: 1, pending: 0}`.
7. **Falha do audit-service (500):** o evento continua pendente (`dispatched: 0, pending: 1`) e `attempts` é incrementado pelo service. A próxima reconciliação tenta de novo.
8. **Sem binding/token de auditoria:** 503 `Auditoria externa não configurada.` antes de qualquer SQL.
9. **Wrangler:** foi declarado `services: [{ binding: "AUDIT_SERVICE", service: "giro-audit-service" }]`.

Os testes antigos de `app.test.ts` foram ajustados à assinatura Node do catálogo. O caso de 403 com service mockado saiu, porque a permissão agora é aplicada no service canônico e está coberta no item 1.

## Schema físico

Os modelos `Triage*` de `workers/triagem-service/prisma/schema.prisma` têm as mesmas colunas e tipos que `infra/prisma/schema.prisma`. Só diferem índices, nomes `map:` de constraints e `onDelete`, que não afetam as queries do Worker. Não há migration nova.

## Validações

- `pnpm --filter @workspace/triagem-worker test` — GREEN, 3 arquivos e 13 testes.
- `pnpm --filter @workspace/triagem-worker typecheck` — GREEN.
- `pnpm --filter @workspace/triagem-worker build` — GREEN.
- `pnpm --filter @workspace/triagem-worker check` — GREEN (13 arquivos), depois de `biome check --write` para formatação.
- `pnpm --filter @workspace/triagem-worker exec prisma validate --schema prisma/schema.prisma` — válido.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma` (com `DATABASE_URL` local só para o config) — válido.
- `pnpm exec wrangler deploy --dry-run --config workers/triagem-service/wrangler.jsonc --outdir <scratchpad>` — GREEN: 8384.51 KiB, 2342.99 KiB gzip, binding `env.AUDIT_SERVICE (giro-audit-service)`. Nenhum deploy.
- `git diff --check` — limpo.
- Hook de pre-commit (varredura supply-chain e lint-staged) — passou, sem `--no-verify`.
- `pnpm graphify:update:services` — não executado, porque o grafo não existe no escopo do worktree. O grafo do workspace principal indexa o checkout principal, e não este worktree.

## Lacunas reais e riscos de staging

- **Hyperdrive:** `wrangler.jsonc` não declara `HYPERDRIVE`. Sem ele (ou sem o secret `DATABASE_URL`), o Worker responde 503 explícito. É preciso provisionar antes de qualquer smoke real.
- **Secrets:** `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` e `AUDIT_SERVICE_TOKEN` precisam vir do secret manager. Nenhum valor foi colocado no Wrangler.
- **Disparo da reconciliação:** no Node, a reconciliação é uma rota interna chamada por agente externo; não há cron no serviço. O Worker mantém a rota e não adiciona cron nem Queue. Se staging depender de reconciliação periódica, falta definir quem chama a rota ou migrar para scheduled/Queue (o plano cita outbox/dispatch por Queue).
- **Contrato do audit-service:** o dispatch depende de o Worker `giro-audit-service` aceitar `POST /internal/audit/requests` com o mesmo token. A rota existe em `workers/audit-service`; a validação ponta a ponta com bindings reais não foi feita.
- **Sem retry interno:** o dispatcher tem timeout de 5 s e não faz retry. A outbox é o mecanismo de retry (evento pendente com `attempts` incrementado).
- **OpenAPI `/docs`:** não portado. É ferramenta de dev opcional no Node.
- **Tokens de plataforma:** Bearer com `auth_kind=platform` é rejeitado pelo runtime compartilhado. O Node aceitaria o token e depois falharia no service com 400 por contexto incompleto. A resposta muda de 400 para 401, ainda como negação.
- **Sem validação real:** não houve teste contra PostgreSQL/Supabase/Hyperdrive nem smoke autenticado de preview. Os testes usam dublês de Prisma e de Service Binding.

## Commits

- Código: `4d25c757` — `feat(triagem-worker): close service remainder parity`.
- Relatório: commit `docs(triagem-worker): ...` separado, logo depois do de código.

Sem push e sem deploy.
