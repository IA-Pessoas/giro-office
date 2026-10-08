# Ciclo TDD: paridade restante do parcelamento-service

Data: 2026-09-22
Escopo autorizado: `workers/parcelamento-service/**` e este relatório
Branch/worktree: `agent-parcelamento-remainder` (base `cloudflare-migration` @ `2d4ebe02`)
Referências: plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` (lido do repo principal) e `task-service-remainder-brief.md`.

## Limites e método

- O worktree nasceu em `main` (`72580459`), sem `workers/`. Como estava limpo e sem commits, criei a branch nova `agent-parcelamento-remainder` em `2d4ebe02`. Nenhuma branch existente foi trocada, resetada ou reescrita.
- Graphify: não havia grafo no worktree, então rodei `pnpm graphify:context:services -- "paridade parcelamento-service worker"` no repo principal (grafo @ `2d4ebe02`, só leitura). O contexto retornado foi genérico e o inventário saiu da leitura direta de `services/parcelamento-service/src/{app.ts,routes,schemas,services}`.
- O serviço Node serviu só de referência; nada em `services/**`, gateway, runtime, shared, UI, lockfile, migrations ou `app/next-env.d.ts` foi alterado.
- Antes do install, as configs executáveis foram conferidas: `app/postcss.config.js` com 94 bytes e `lint-staged.config.mjs` com 766. Nada suspeito. `pnpm install --frozen-lockfile` não alterou o lockfile.
- Não houve deploy, push, migration nem alteração remota.

## Inventário de rotas (Node × Worker)

| Método | Path | Auth / contexto | Validação | Resposta | Antes | Agora |
|---|---|---|---|---|---|---|
| GET | `/health` | público | — | `{success,data}` | ok | ok (+`x-request-id`) |
| GET | `/ready` | público | — | `SELECT 1` | ok | ok, com guard 503 sem banco |
| GET | `/parcelamento/installments` | org/user | `listInstallmentsQuerySchema` (strict, page/page_size ≤100) | página `{items,total,page,page_size,has_more}` | ok | ok |
| POST | `/parcelamento/installments` | org/user | `createInstallmentBodySchema` | 201, 404 cliente, 409 acordo/escopo | **lacuna** | **fechada** |
| GET | `/parcelamento/installments/:id` | org/user | uuid | 404 | ok | ok |
| PATCH | `/parcelamento/installments/:id` | org/user | `patchInstallmentBodySchema` (≥1 campo) | 200, recálculo condicional, 409 | **lacuna** | **fechada** |
| GET | `/parcelamento/installments/:installmentId/competencies` | org/user | uuid + paginação | página por `competence asc`, 404 pai | **lacuna** | **fechada** |
| POST | `/parcelamento/installments/:installmentId/competencies` | org/user | `createInstallmentCompetencyBodySchema` | 201, recálculo, 409 | **lacuna** | **fechada** |
| PATCH | `/parcelamento/installment-competencies/:id` | org/user | `patchInstallmentCompetencyBodySchema` | 200, recálculo do pai | **lacuna** | **fechada** |
| GET | `/parcelamento/panoramas` | org/user | `listPanoramasQuerySchema` | página | **lacuna** | **fechada** |
| POST | `/parcelamento/panoramas` | org/user | `createPanoramaBodySchema` (defaults false) | 201, 404 cliente/responsável, 409 | **lacuna** | **fechada** |
| GET | `/parcelamento/panoramas/:id` | org/user | uuid | 404 | **lacuna** | **fechada** |
| PATCH | `/parcelamento/panoramas/:id` | org/user | `patchPanoramaBodySchema` | 200 | **lacuna** | **fechada** |
| POST | `/parcelamento/panoramas/competences/:competence/generate` | org/user | body `{}` strict (vazio aceito) | `{created,existing,totalActiveClients}` | **lacuna** | **fechada** |
| GET | `/internal/reporting/catalog` | `x-internal-service-token` + grant HMAC | grant canônico, TTL ≤60s | catálogo | **lacuna** | **fechada** |
| POST | `/internal/reporting/extract` | token + grant (body_sha256, fields, request_id) | `internalReportingExtractBodySchema` | `{rows,reachedLimit}` | **lacuna** | **fechada** |
| GET | `/docs`, `/openapi.json` (se `ENABLE_API_DOCS`) | — | — | Swagger | ausente | não portado (ver lacunas) |

Os schemas Zod são importados do pacote Node (`@workspace/parcelamento-service/src/schemas/*`), de modo que o Worker valida exatamente as mesmas regras. Envelope e erros usam `createSuccessResponse`/`serializeError` do shared (`success:false`, `error`, `code`).

## Correções TDD

RED: `src/remainder.routes.test.ts` com 24 casos. Primeiro falhou por módulo ausente (`./reporting.js`). Depois do port do verificador de grant, todos os casos novos falharam por comportamento (rotas inexistentes), enquanto os 5 antigos seguiam verdes. GREEN: a suíte completa passou com 29 testes em 2 arquivos (5 antigos de regressão e 24 novos).

### Rotas e regras de domínio (`src/services.ts`)

- Port fiel de `InstallmentService`, `InstallmentCompetencyService`, `PanoramaService` e `InternalReportingService`: selects, remoção de `organization_id` do DTO, paginação (`getPaginationParams`/`createPage` do Node), mensagens de erro e o mapeamento de erros de `guard()`. `ServiceError` passa adiante, Prisma `P2002` vira 409 e o restante vira 500 com a mensagem do Node.
- Invariantes financeiras: o recálculo usa `paid = Σhow_many_paid`, `overdue = max(Σoverdue − paid, 0)`, `remaining = max(agreed − paid, 0)` e `outstanding = remaining × current_month_installment_amount`. `remaining = 0` leva a `Liquidado` com `completion_date`; um parcelamento já liquidado com saldo reabre como `Ativo`. Os testes cobrem PATCH com recálculo, liquidação por competência e recálculo do pai no PATCH de competência.
- Transações e unicidade: sem `agreement_number`, a checagem do escopo operacional e o create/update rodam em `$transaction(..., { isolationLevel: "Serializable" })`, como no Node. Com número de acordo, prevalece o unique `(organization_id, agreement_number)`.
- Idempotência: `generate` cria panoramas só para clientes `Ativo` que ainda não os têm, com `createMany({ skipDuplicates: true })` sobre o unique `(organization_id, client_id, competence)`.
- Tenant: todo `where` leva `organization_id` do contexto autenticado. Cliente e responsável são validados na organização (404).

### Auditoria (`src/audit.ts`)

- O payload é idêntico ao do `ParcelamentoAuditService` do Node (`ENTITY_CHANGE`, path derivado do referring, `department: "parcelamento"`, `metadata.requestId`, permission numérica). O envio vai para o binding `AUDIT_SERVICE` com `AUDIT_SERVICE_TOKEN`, header `x-request-id`, timeout de 2s e `AUDIT_ENABLED` com a mesma semântica.
- Binding/token ausente ou resposta não-2xx lançam `ServiceError`. O service registra `console.error({ event: "parcelamento.audit.failed", ... })` e **não** reverte a resposta, que é o contrato do Node: a mutação já está persistida, e responder 5xx induziria retries duplicados. Isso é deliberado, não é um mock de sucesso, e tem teste próprio.

### Autenticação, CSRF e sessão (`src/auth.ts`)

- A auth encaminhada pelo gateway (token interno) continua valendo e agora também propaga `session_id`, `session_version` e `csrf_hash`.
- Transporte por cookie `cw.session` (padrão do contabil): mutações exigem `x-csrf-token` igual ao cookie `cw.csrf` e ao `csrf_hash` do JWT, e toda requisição com cookie valida a sessão via `USER_SERVICE`. Sem binding ou token, a resposta é 503 explícito. Isso ficou obrigatório porque o piloto aceitava cookie e agora existem mutações.

### Reporting (`src/reporting.ts`)

- Verificação WebCrypto do grant (token interno, base64url canônico, HMAC-SHA256, operation/source/fields/request_id/body_sha256, janela de tempo), fechada por padrão quando `REPORTS_INTERNAL_TOKEN`/`REPORTS_GRANT_SECRET` faltam. O Node usava defaults fixos fora de produção; o Worker não inventa segredo.
- Consultas com `query` rodam em `withReportingSnapshot` (RepeatableRead) e `executeReportingQuery`, com allowlist do catálogo shared. Campo não publicado resulta em 403.

### Outros

- `x-request-id` é devolvido em toda resposta, inclusive em erros, como no `requestContext` do Node.
- Corpo vazio é tratado como `{}` e JSON inválido como 400, emulando `express.json()`.
- Guard de banco: sem `HYPERDRIVE.connectionString` e sem `DATABASE_URL`, a resposta é 503 antes de criar o Prisma.
- `prisma/schema.prisma` do Worker agora tem `InstallmentCompetencies`, `PanoramaParcelameto` e os modelos só de leitura `Client(id,status,organization_id)` e `User(id,organization_id)`, com os mesmos `@@map` e uniques do schema canônico. Não houve migration.
- `wrangler.jsonc` ganhou o binding `USER_SERVICE → giro-user-service`.

## Validações

| Comando | Resultado |
|---|---|
| `pnpm --filter @workspace/parcelamento-worker test` | GREEN: 2 arquivos, 29 testes |
| `pnpm --filter @workspace/parcelamento-worker typecheck` | GREEN (exige `pnpm --filter @workspace/shared build` e `@workspace/runtime build` antes, porque os tipos vêm de `dist/`, que não é versionado) |
| `pnpm --filter @workspace/parcelamento-worker build` | GREEN |
| `pnpm --filter @workspace/parcelamento-worker check` | GREEN (biome, 14 arquivos) |
| `pnpm --filter @workspace/parcelamento-worker exec prisma validate --schema prisma/schema.prisma` | GREEN |
| `pnpm exec prisma validate --schema infra/prisma/schema.prisma` | GREEN |
| `pnpm exec wrangler deploy --dry-run --config workers/parcelamento-service/wrangler.jsonc` | GREEN: 6307.41 KiB / gzip 1980.98 KiB; bindings `AUDIT_SERVICE`, `USER_SERVICE`; sem deploy |
| `git diff --cached --check` | GREEN |
| `pnpm graphify:update:services` | **não executado**: o grafo não existe no worktree, e atualizar o do repo principal refletiria outro checkout |
| hooks de pre-commit (supply-chain scan, lint-staged) | GREEN, sem `--no-verify` |

Avisos externos ao escopo: `resolutions` em `services/src/package.json` e `ERR_PNPM_IGNORED_BUILDS` no install (scripts de build ignorados pela política do pnpm).

## Lacunas reais e riscos de staging

1. **Hyperdrive não declarado** no `wrangler.jsonc`, como no contabil. O guard 503 segura, mas é preciso provisionar Hyperdrive (ou o secret `DATABASE_URL`) antes de qualquer tráfego real. Nenhum ID foi inventado.
2. **Secrets a provisionar**: `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `AUDIT_SERVICE_TOKEN`, `USER_SERVICE_INTERNAL_TOKEN`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` (e opcionalmente `AUDIT_ENABLED`). Sem os de reporting, `/internal/reporting/*` responde 403. Sem `AUDIT_*`, as mutações funcionam, mas a auditoria só aparece em log de erro.
3. **Permissão por módulo**: ~~o Node não aplica `modules.parcelamento` nem nível de escrita, e o gateway Node só resolve o `x-auth-permission` sem negar~~ — **afirmação errada, corrigida na "Revisão final"**: o gateway Node já nega por `modules.parcelamento` em modo `enforce`. O que falta é só a checagem local no Worker (defesa em profundidade).
4. **OpenAPI/Swagger** (`ENABLE_API_DOCS`) não foi portado: é documentação de dev, e a spec agregada continua no gateway Node.
5. **CORS/security headers** do Express não foram replicados no Worker, seguindo o padrão dos demais workers (o gateway é o ponto de borda).
6. **Query string com chave repetida**: o Express gera array e responde 400; o Worker usa o último valor. A diferença é marginal.
7. **Recálculo de agregados fora de transação**, como no Node. Competências concorrentes no mesmo parcelamento podem gravar agregados de uma leitura anterior (mesmo risco do Node).
8. Não houve validação contra PostgreSQL/Supabase/Hyperdrive nem smoke autenticado em preview. Os testes usam doubles de Prisma e Service Binding.

## Commits

- Código: `22640322` `feat(parcelamento-worker): complete service remainder parity`, só com `workers/parcelamento-service/**`.
- Relatório: commit `docs(parcelamento-worker): ...` separado, só com este arquivo.

## Revisão final (2026-09-22)

Worktree `cf-parcelamento-review`, branch `cf/parcelamento-review`, base `cloudflare-migration` @ `34958e27`. Escopo: `workers/parcelamento-service/**` e este relatório. Nada em `services/**`, gateway, UI, lockfile ou migrations foi tocado. Sem deploy e sem push.

Graphify: o worktree não tem `services/graphify-out/`, então `pnpm graphify:context:services` não tinha grafo para consultar. Descoberta manual com `rg` e leitura direta, como manda o fallback do CLAUDE.md. Configs executáveis conferidas antes do install: `app/postcss.config.js` 94 bytes, `lint-staged.config.mjs` 766 bytes.

### A. Chave repetida na query string — fechado

O comportamento do Node foi medido, não suposto: um teste descartável rodou o app Express com supertest e registrou status, mensagem e código exatos (arquivo removido em seguida; `services/**` continua intocado).

| Requisição | Node (Express 4 + qs) |
|---|---|
| `GET /parcelamento/installments?page=1&page=2` | 400 `{"success":false,"error":"Expected number, received nan","code":"BAD_REQUEST"}` |
| `?page_size=10&page_size=10` | 400, mesma mensagem |
| `?status=A&status=B` e `?search=x&search=x` | 400 `Expected string, received array` |
| `GET /parcelamento/installments/:id/competencies?page=1&page=2` | 400 `Expected number, received nan` |
| `GET /parcelamento/panoramas?competence=…&competence=…` | 400 `Expected string, received array` |
| `GET /parcelamento/installments/:id?x=1&x=2` | query ignorada (404/200 normal) |

Causa no Node: `express.json`/`qs` transforma chave repetida em array, o schema é `strict` com `z.coerce.number()`/`z.string()`, e `parseWithZod` devolve a primeira issue como `ServiceError(400)`.

No Worker, `queryOf` já montava array por chave repetida desde `ba2aed71` (o item 6 das lacunas acima é anterior a esse commit e estava desatualizado), mas o teste cobria só `page` em `installments` e não olhava a mensagem. O commit `5179d301` passa a fixar status, mensagem e código nas três listagens. RED comprovado simulando o `queryOf` antigo (último valor vence): 7 casos falharam com 200.

Diferenças residuais, aceitas e sem fix:

- Envelope de erro: o Worker acrescenta `requestId` ao corpo; o Node não (o `requestContext` do parcelamento não popula `request.requestId`, que é o campo lido por `createExpressErrorHandler`). É aditivo e foi decisão explícita de `ba2aed71`; os testes documentam.
- Sintaxe de colchetes do `qs` (`?status[]=A`, `?status[a]=A`): ambos respondem 400 `BAD_REQUEST`, com mensagem diferente (o Node vê array/objeto, o Worker vê chave desconhecida em schema `strict`). Sem impacto de contrato.

### B. Recálculo de totais dentro da transação — corrigido, DIVERGE do Node

RED (`src/recalc.race.test.ts`): um dublê de Prisma com semântica mínima de READ COMMITTED (escrita em transação só visível após commit, `FOR NO KEY UPDATE` bloqueando quem espera) intercala dois `POST /parcelamento/installments/:id/competencies` do mesmo parcelamento. Antes da correção, a requisição 1 lia as competências, a 2 gravava seu total e a 1 sobrescrevia com a leitura velha: **2 competências pagas gravadas como `paid_installments_count: 1`** (`remaining 9`, `outstanding 450`). Lost update clássico.

GREEN (`b0223889`): gravação da competência e recálculo passam a rodar no mesmo `$transaction(..., { isolationLevel: "ReadCommitted" })`, e o recálculo começa com `SELECT "id" FROM "parcelamento.installments" WHERE "id" = $1 AND "organization_id" = $2 FOR NO KEY UPDATE`. O `PATCH` de parcelamento recalcula em transação própria com o mesmo lock (a escrita dele já está commitada antes do recálculo, então a ordem continua correta). Resultado: `paid = 2`, `remaining = 8`, `outstanding = 400`.

Por que lock de linha e não `Serializable` com retry:

- Sem laço de retry e sem `P2034` virando 500 para o usuário: quem chega depois espera o commit do anterior em vez de abortar.
- READ COMMITTED é obrigatório aqui: cada comando pega snapshot novo, então, depois de adquirir o lock, a soma das competências já enxerga o que o escritor anterior commitou. Sob `RepeatableRead`/`Serializable` o snapshot seria anterior ao lock.
- `FOR NO KEY UPDATE` (e não `FOR UPDATE`) para não conflitar com o `FOR KEY SHARE` que o INSERT da competência toma na linha pai por FK — com `FOR UPDATE` duas requisições concorrentes poderiam deadlockar.
- Auditoria continua fora da transação: é chamada de rede e não deve segurar lock; e agora, se o recálculo falhar, a competência é revertida e nada é auditado (antes, no Node, a competência ficava gravada com total velho).

Envelopes, mensagens e códigos não mudaram: o `guard` continua mapeando `ServiceError` adiante, `P2002` para 409 e o resto para 500 com as mensagens do Node.

**Isto diverge do Node de propósito.** `services/parcelamento-service` tem o mesmo defeito (recálculo fora de transação, sem lock) e não foi alterado — fica registrado aqui como melhoria a portar para o Node se o serviço sobreviver à migração.

### C. `modules.parcelamento` — análise, sem implementação

Correção da lacuna 3 acima: **o Node já exige o módulo**. `services/gateway/src/config/serviceRegistry.ts:277` marca `permissionModule: "parcelamento"`, `services/gateway/src/security/policies.ts:185-186` aplica `modules.parcelamento >= 1` em `GET /parcelamento/*` e `>= 2` nos demais métodos, e `authorizationMode` é `enforce` por padrão (`services/gateway/src/config/env.ts:72`). Em `shared/src/auth/policy.ts`, ator de plataforma é negado e `type: "owner"` passa por cima do módulo. O proxy encaminha `x-auth-permission` já resolvido para o módulo (owner = 3; sem claim `modules`, BASIC = 1) e `x-auth-modules` quando o token traz os módulos. O Gateway Worker (branch `cf/gateway-audit`, ainda não integrada) aplica a mesma policy.

O que o parcelamento-service faz hoje, Node e Worker: **nada**. O Node só lê `x-auth-*` no `requestContext` e usa para auditoria. O Worker aceita a auth encaminhada pelo gateway (com token interno) e também JWT direto (`allowBearer: true`) ou cookie `cw.session` com CSRF + validação de sessão, mas nunca olha `modules.parcelamento`.

Como contabil e fiscal fazem: checagem local explícita. `workers/contabil-service/src/auth.ts:150` calcula a permissão efetiva (plataforma = 0, owner = 3, senão `modules.contabil`) e `requireContabilModule`/`requireContabilWrite` negam com 403 "Usuário não possui permissão para este domínio." / "Permissao insuficiente para alterar dados contabeis.". `workers/fiscal-service/src/auth.ts:164` faz o mesmo para leitura (≥1) e escrita (≥2).

Impacto de exigir no Worker parcelamento (defesa em profundidade):

- **Quem já entra pelo gateway não perde nada**, desde que a regra local espelhe a do gateway: owner = 3, ator de plataforma = 0, demais = `modules.parcelamento`, GET ≥ 1, demais métodos ≥ 2. Usuário sem o módulo já toma 403 no gateway hoje.
- **Owner sem `modules.parcelamento` explícito** é o risco real de regressão: se a checagem local olhasse só `claims.modules`, o owner perderia acesso. Precisa do fallback `type === "owner" → 3` (como o contabil).
- **Token legado sem claim `modules`**: o gateway manda `x-auth-permission: 1` e omite `x-auth-modules`. Hoje esse usuário já é negado no gateway (a policy exige módulo explícito, exceto owner), então a checagem local não tira acesso de ninguém — mas se a intenção for aceitar esses tokens, `x-auth-permission` é o único sinal disponível.
- **`/internal/reporting/*` tem de ficar fora do gate**: quem chama é o reports-service com grant HMAC assinado, sem `modules` e sem passar pelo gateway; a organização vem do grant.
- **Ator de plataforma** deve continuar negado, igual ao gateway.

O que ganha: hoje `workers/parcelamento-service/wrangler.jsonc` não tem `workers_dev: false` nem `routes` (o `rh-service` é o único com `workers_dev: false`). Publicado assim, o Worker fica acessível em `*.workers.dev` e aceita bearer/cookie direto, ou seja, um usuário autenticado **sem** `modules.parcelamento` consegue ler e escrever parcelamento driblando a policy do gateway. É o argumento mais forte para o gate local — e o mais barato seria fechar também a exposição pública.

Opções para o usuário decidir (nenhuma implementada):

1. **Não implementar**: paridade literal com o Node, que também não checa no serviço. Mantém o furo do `workers.dev` enquanto a rota pública existir.
2. **Fechar só a exposição**: `workers_dev: false` no `wrangler.jsonc` do parcelamento (uma linha), deixando a autorização inteira no gateway. Resolve o bypass; não protege contra um binding mal configurado.
3. **Gate local espelhando o gateway** (recomendado, padrão contabil/fiscal): helper em `auth.ts` com plataforma = 0, owner = 3, senão `modules.parcelamento`; `GET ≥ 1`, demais `≥ 2`; `/internal/*` de fora; 403 com as mesmas mensagens do contabil. Diverge do Node por ser mais restritivo — e nenhum usuário que hoje passa pelo gateway perde acesso. Idealmente junto com a opção 2.

### Validações da revisão

| Comando | Resultado |
|---|---|
| `pnpm --filter @workspace/parcelamento-worker test` | GREEN: 3 arquivos, 38 testes |
| `pnpm --filter @workspace/parcelamento-worker typecheck` | GREEN |
| `pnpm --filter @workspace/parcelamento-worker build` | GREEN |
| `pnpm --filter @workspace/parcelamento-worker check` | GREEN (biome, 15 arquivos) |
| `pnpm --filter @workspace/parcelamento-worker exec prisma validate` | GREEN |
| `pnpm exec prisma validate --schema infra/prisma/schema.prisma` | GREEN |
| `pnpm exec wrangler deploy --dry-run --config workers/parcelamento-service/wrangler.jsonc` | GREEN: 6308.20 KiB / gzip 1981.23 KiB, bindings `AUDIT_SERVICE` e `USER_SERVICE`, sem deploy |
| `git diff --check` | GREEN |
| `pnpm install --frozen-lockfile` | OK, com `ERR_PNPM_IGNORED_BUILDS` esperado; lockfile não mudou |

### Commits da revisão

- `5179d301` `fix(parcelamento-worker): reject repeated query keys` (teste de paridade exata)
- `b0223889` `fix(parcelamento-worker): recalc totals inside transaction` (`services.ts` + `recalc.race.test.ts`)
- `docs(parcelamento-worker): record final parity review` (só este arquivo)
