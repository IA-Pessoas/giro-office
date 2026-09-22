# Ciclo TDD — paridade restante do contabil-service

Data: 2026-09-22
Escopo autorizado: `workers/contabil-service/**` e este relatório
Referências: plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` e o brief de service remainder disponível no workspace.

## Limites e método

- Graphify foi usado primeiro: `pnpm graphify:context:services -- "...paridade restante do contabil-service..."`, seguido de atualização do grafo após a edição.
- O serviço canônico em `services/contabil-service` foi usado somente como referência de contrato/comportamento; nenhum arquivo em `services/**` foi alterado.
- Não foram tocados Commercial, gateway, UI/app-next, outros Workers, lockfile ou `app/next-env.d.ts`.
- A alteração preexistente em `app/next-env.d.ts` e alterações preexistentes fora do escopo foram preservadas; não houve deploy, push, force-push, migração ou alteração remota.

## Correções TDD

Cada achado novo teve teste RED antes da implementação mínima GREEN.

### Timestamps e dados físicos

- Os modelos Worker `TriageMonthly`, `TriageBankStatement` e `TriageClosing` agora declaram `created_at` com `@default(now())` e `updated_at` com `@updatedAt`, alinhados ao schema/migrations físicas PostgreSQL, onde ambos são `NOT NULL`.
- Os creates/upserts enviam argumentos reais com os dois timestamps; updates e archive/restore também atualizam `updated_at` explicitamente.
- O teste `envia timestamps obrigatórios nos creates e upserts físicos da triagem` inspeciona os argumentos dos mocks de Prisma, não apenas o resultado serializado.

### Reporting

- A implementação Worker foi alinhada ao `InternalReportingService` canônico: query passa por `executeReportingQuery`, com allowlist de fonte/campos, filtros, grupos, ordenação, agregações, limites e paginação.
- A carga é buscada sempre com `where.organization_id`, e query usa snapshot `RepeatableRead` antes da execução.
- O teste `aplica filtro impossível no reporting em vez de devolver a página bruta` comprova que uma competência inexistente retorna `rows: []`, em vez de ignorar o filtro. O contrato de campos publicados e aliases continua validado pelo schema/grant HMAC.

### Autorização

- Bearer, cookie e auth encaminhada continuam passando pelo mesmo autenticador/CSRF/sessão; as rotas `/contabil` agora exigem `claims.modules.contabil` compatível antes de executar o serviço.
- `requireContabilWrite` exige simultaneamente permissão global de escrita e módulo contábil `>= 2`; permissão global alta não concede bypass quando `contabil = 0`.
- Os services de controles e fechamento também aplicam a proteção de módulo nas operações de escrita, evitando bypass por chamada direta.
- O teste parametrizado cobre os três transportes com `permission = 3` e `modules.contabil = 0`, esperando `403` sem invocar o service.

### RLS, tenant e concorrência

- A criação de mensal fiscal/triagem abre transação `Serializable`, executa `SET LOCAL ROLE "giro_user_runtime"` e `set_config('app.organization_id', ..., true)` antes de qualquer consulta a `triageCompetence`/configuração.
- Leitura, catálogo/snapshot, lock e create usam o mesmo transaction client e `organization_id`; reconsulta de corrida também restabelece o contexto RLS antes da leitura.
- O teste `estabelece RLS antes de consultar a competência fiscal na mesma transação` verifica ordem dos eventos e opção `Serializable`.

### Auditoria

- O recorder Worker deixou de ser best-effort silencioso. Binding/token ausentes resultam em `503`; HTTP não-2xx, falha de transporte e timeout produzem erro observável.
- Há timeout via `AbortSignal.timeout`, retry limitado para falhas transitórias (`408/425/429/5xx` e transporte), backoff injetável nos testes, `504` para timeout e logs estruturados de retry/falha.
- Os quatro testes de `audit.test.ts` cobrem retry HTTP, exaustão `503`, timeout `504` e configuração ausente.

### Guard de banco

O guard existente foi preservado: sem binding `HYPERDRIVE.connectionString` e sem `DATABASE_URL`, o Worker responde `503` explícito antes de criar Prisma; nenhum DSN, ID de produção ou secret foi inventado. Há teste de rota para esse caso.

## Validações

- `pnpm --filter @workspace/contabil-worker test` — GREEN, 4 arquivos e 22 testes.
- `pnpm --filter @workspace/contabil-worker typecheck` — GREEN.
- `pnpm --filter @workspace/contabil-worker build` — GREEN.
- `pnpm --filter @workspace/contabil-worker check` — GREEN.
- `pnpm --filter @workspace/contabil-worker exec prisma validate --schema prisma/schema.prisma` — GREEN.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma` — GREEN.
- `pnpm graphify:update:services` — GREEN; grafo local atualizado sem versionar `services/graphify-out/`.
- `pnpm exec wrangler deploy --dry-run --config workers/contabil-service/wrangler.jsonc` — GREEN, bundle 6368.01 KiB / 1991.34 KiB gzip; nenhum deploy executado.
- `git diff --check` — executado no gate final sobre o escopo Worker/relatório e verificação separada do arquivo preexistente app-next.

Warnings de `resolutions` em `services/src/package.json` e aviso de atualização do Prisma são externos a este escopo e não foram alterados.

## Gaps operacionais

- `workers/contabil-service/wrangler.jsonc` declara `AUDIT_SERVICE`, `TRIAGEM_SERVICE` e `USER_SERVICE`, mas não declara `HYPERDRIVE`. O runtime mantém o guard 503; Hyperdrive precisa ser provisionado antes de qualquer execução real com PostgreSQL.
- `DATABASE_URL`, `JWT_SECRET`, tokens de service bindings, tokens de auditoria e secrets de reporting não são configurados no arquivo Wrangler. Devem ser provisionados pelo ambiente/secret manager, sem valores fictícios.
- Não houve validação contra PostgreSQL/Supabase/Hyperdrive/bindings remotos, smoke autenticado de preview ou deploy. Os testes usam doubles locais de Hono/Prisma/Service Binding.

## Commit

O código e este relatório estão registrados no commit local desta entrega, sem push e sem deploy.

## Revalidação rota a rota (ciclo 2, base 2d4ebe02)

Graphify: `pnpm graphify:context:services -- "paridade contabil-service worker"` retornou "sem grafo local em services/graphify-out/graph.json" no worktree; foi usada descoberta manual (`rg`, leitura de `services/contabil-service/src/{app,routes,middlewares,schemas,services}`, `services/gateway/src/{config/serviceRegistry,security/policies,proxy/httpProxy}.ts`, `shared/src/auth/policy.ts` e `workers/gateway/src/auth.ts`). `graphify:update:services` não se aplica (grafo inexistente no escopo).

### Inventário

Todas as rotas usam envelope `createSuccessResponse`, erros via `serializeError` (`{ success: false, error, code }`) e nenhuma é paginada (paginação só existe no reporting, via `limit`). "Auth" = autenticação encaminhada/Bearer/cookie + CSRF/sessão; "leitura"/"escrita" = policy do gateway Node reproduzida no Worker.

| Método | Path | Node (gateway + serviço) | Worker | Status |
| --- | --- | --- | --- | --- |
| GET | `/health`, `/ready` | 200 sem auth | 200; `/ready` faz `SELECT 1` (503 sem banco) | ok (readiness mais estrita) |
| GET | `/contabil/controls/list` | leitura contabil ≥ 1, `competence` | idem | fechada (owner) |
| GET | `/contabil/controls` | leitura, `client_id`+`competence` | idem | fechada (owner) |
| POST | `/contabil/controls` | escrita contabil ≥ 2, 201/200 | idem | fechada |
| POST | `/contabil/controls/year` | escrita, `confirmed` | idem | fechada |
| DELETE | `/contabil/controls` | escrita, body competência | idem | fechada |
| POST | `/contabil/controls/restore` | escrita | idem | fechada |
| PATCH | `/contabil/controls/:id` | escrita, `field`/`value` | idem | fechada |
| PATCH | `/contabil/controls/:id/items` | escrita | idem | fechada |
| POST/PUT/DELETE | `/contabil/relationships[/:id]` | escrita, 201 no POST | idem | fechada |
| GET | `/contabil/relationships/client/:clientId` | leitura | idem | fechada (owner) |
| POST/PUT/DELETE | `/contabil/responsibles[/:id]` | escrita, 201 no POST | idem | fechada |
| GET | `/contabil/responsibles/client/:clientId` | leitura | idem | fechada (owner) |
| GET/PUT/DELETE | `/triagem/closing` | policy contabil/triagem ≥ 1; escrita exige `modules.contabil ≥ 2` no service | idem | fechada (policy + mensagem de status) |
| GET | `/triagem/editability` | policy contabil/triagem ≥ 1 | idem | fechada (policy) |
| GET/POST | `/triagem/monthly` | policy; RLS/Serializable no create | idem | fechada (policy) |
| PATCH | `/triagem/monthly/:id/item`, `/items` | policy; `canEdit` por módulo ou responsável | idem | fechada (policy + `justification`) |
| GET/PUT/DELETE | `/triagem/statements` | policy; tenant do cliente | idem | fechada (policy + mensagem `bank_id`) |
| GET | `/internal/reporting/catalog` | token + grant HMAC | idem | fechada (503 sem secrets) |
| POST | `/internal/reporting/extract` | token + grant HMAC, allowlist, `RepeatableRead` | idem | fechada (503 sem secrets) |

### Lacunas reais encontradas e fechadas com TDD

Cada item teve teste RED observado antes do GREEN (commit `fix(contabil-worker): align module auth and validation with Node contract`).

1. **Permissão contábil efetiva.** O gateway Node registra `contabil-service` com `permissionModule: "contabil"`: encaminha `permission = 3` para owner e `modules.contabil` para os demais, e a policy libera owner sem olhar módulos. O Worker exigia `claims.permission` global ≥ 2 **e** `modules.contabil` ≥ 2, e o gateway Worker encaminha a permissão global. Resultado: owner com `contabil = 0` recebia 403 em leitura e escrita, e usuário com `contabil = 2` e permissão global 1 não conseguia escrever. Agora `contabilPermission(auth)` (owner = 3, ator de plataforma = 0, demais `modules.contabil`) é usado no middleware `/contabil`, em `requireContabilWrite`, nos inputs dos serviços de controle e no `permission` gravado na auditoria, como no Node. Os checks internos do control service voltaram a `permission ≥ 2`, como no Node. O bloqueio anterior (permissão global 3 com `contabil = 0`, não owner → 403) continua valendo. Testes: `usa a permissão efetiva do módulo contábil como o gateway Node encaminha` e `autoriza escrita de controles pela permissão contábil efetiva, sem exigir claims.modules`.
2. **Policy de `/triagem`.** No Node o gateway exige owner ou `contabil`/`triagem` ≥ 1 (`triagemModulePolicy`). O gateway Worker não avalia policies, e o Worker contábil aceitava qualquer autenticado. Adicionado `requireTriagemModule`. Teste: `exige módulo contabil ou triagem nas rotas /triagem como a policy do gateway Node`.
3. **Mensagens de validação.** `parseWithZod` devolve a primeira mensagem no campo `error`. Alinhados: `status de fechamento inválido.`, `bank_id é obrigatório.` e `justification` sem `min(1)`: string vazia chega ao service e recebe o mesmo 400 do Node. Teste: `mantém as mensagens de validação da triagem do serviço Node`.
4. **Reporting sem secrets.** Sem `REPORTS_INTERNAL_TOKEN` ou `REPORTS_GRANT_SECRET` o Worker respondia 403 (erro de acesso enganoso); o Node nem subia. Agora responde 503 explícito. Teste parametrizado: `falha explícita com 503 quando %s não está configurado`.

### Validações (ciclo 2)

Setup: `pnpm install --frozen-lockfile` saiu com `ERR_PNPM_IGNORED_BUILDS` (política do pnpm para postinstall), mas linkou as dependências sem alterar o lockfile; `git status` ficou limpo. `pnpm --filter @workspace/runtime build` foi necessário para gerar o `dist` do runtime no worktree novo.

- `pnpm --filter @workspace/contabil-worker test`: GREEN, 4 arquivos e 28 testes (baseline 22; 6 novos).
- `pnpm --filter @workspace/contabil-worker typecheck`: GREEN.
- `pnpm --filter @workspace/contabil-worker build`: GREEN.
- `pnpm --filter @workspace/contabil-worker check`: GREEN (18 arquivos).
- `pnpm --filter @workspace/contabil-worker exec prisma validate --schema prisma/schema.prisma`: válido.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma`: válido.
- `pnpm exec wrangler deploy --dry-run --config workers/contabil-service/wrangler.jsonc`: GREEN, 6368.89 KiB / gzip 1991.50 KiB, bindings `AUDIT_SERVICE`, `TRIAGEM_SERVICE`, `USER_SERVICE`; sem deploy.
- `git diff --check`: limpo.
- Hook pre-commit (supply-chain test + integrity scan de 3441 arquivos): 0 findings.

### Riscos de staging remanescentes (fora do escopo deste Worker)

- **Roteamento `/triagem`:** no Node, `/triagem/{monthly,statements,closing,editability}` vai para o contabil-service (`triagem-legacy-service`) e só `overview`/`competencies`/`catalogs`/`external-links`/`urgent-requests` vão para o triagem-service. O gateway Worker manda todo `/triagem` para `TRIAGEM_SERVICE`, então essas rotas do Worker contábil ficam inalcançáveis pelo gateway até o escopo Gateway rotear por subpath.
- **Policies no gateway Worker:** ele não aplica `canAccessRoute` e encaminha a permissão global em vez da permissão por módulo. O Worker contábil compensa localmente; outros Workers podem ter a mesma divergência.
- **Continua do ciclo 1:** `HYPERDRIVE` não declarado no `wrangler.jsonc` (guard 503 mantido). Secrets (`DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, tokens de audit/user/triagem/reporting) precisam ser provisionados no ambiente. Não houve validação contra PostgreSQL/Hyperdrive reais nem smoke autenticado.
- Grant de reporting decodificado com `atob` (latin1): só aceita grants ASCII. Os grants atuais são ASCII (UUIDs, nomes de campo, request id); só ajustar se o emissor passar a incluir texto UTF-8.
