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
3. **Permissão por módulo**: o Node não aplica `modules.parcelamento` nem nível de escrita, e o gateway Node só resolve o `x-auth-permission` sem negar. Por paridade, o Worker também não aplica. Se o produto exigir gate de módulo (como o contabil faz), trata-se de mudança de comportamento a decidir fora deste escopo.
4. **OpenAPI/Swagger** (`ENABLE_API_DOCS`) não foi portado: é documentação de dev, e a spec agregada continua no gateway Node.
5. **CORS/security headers** do Express não foram replicados no Worker, seguindo o padrão dos demais workers (o gateway é o ponto de borda).
6. **Query string com chave repetida**: o Express gera array e responde 400; o Worker usa o último valor. A diferença é marginal.
7. **Recálculo de agregados fora de transação**, como no Node. Competências concorrentes no mesmo parcelamento podem gravar agregados de uma leitura anterior (mesmo risco do Node).
8. Não houve validação contra PostgreSQL/Supabase/Hyperdrive nem smoke autenticado em preview. Os testes usam doubles de Prisma e Service Binding.

## Commits

- Código: `22640322` `feat(parcelamento-worker): complete service remainder parity`, só com `workers/parcelamento-service/**`.
- Relatório: commit `docs(parcelamento-worker): ...` separado, só com este arquivo.
