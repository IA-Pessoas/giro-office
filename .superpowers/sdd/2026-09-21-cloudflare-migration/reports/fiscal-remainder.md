# Ciclo TDD: paridade restante do fiscal-service

Data: 2026-09-22
Escopo autorizado: `workers/fiscal-service/**` e este relatório
Referências: plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` e brief `task-service-remainder-brief.md`.

## Limites e método

- O worktree do agente foi criado em `72580459`, um merge da `main` que não contém `workers/fiscal-service`. Sem reset nem checkout de branch existente, criei a branch local nova `agent-fiscal-remainder` a partir de `2d4ebe02`, o HEAD de `cloudflare-migration`, e trabalhei nela.
- Graphify: o grafo não existe no worktree (`services/graphify-out/graph.json` ausente), então `pnpm graphify:context:services` saiu com código 2. Rodei o contexto em modo leitura no checkout principal (grafo no commit `2d4ebe02`); ele apontou `internalReporting.routes.ts`, `internalReportingService.ts`, os catálogos e schemas. Os candidatos foram completados por descoberta manual com `rg` e leitura direta.
- `services/fiscal-service` serviu só de referência de contrato; nenhum arquivo em `services/**`, gateway, runtime, shared, UI, lockfile, migrations ou outros Workers foi alterado.
- Sem deploy, sem push, sem migration, sem alteração remota.

## Inventário de rotas (Node × Worker)

| Método | Rota | Auth / permissão (Node) | Validação | Resposta | Worker antes | Worker agora |
|---|---|---|---|---|---|---|
| GET | `/health` | pública | — | `200 {success,data:{status,service}}` | ok | ok |
| GET | `/openapi.json` (+ `/docs` UI) | pública, só com `ENABLE_API_DOCS` | — | spec OpenAPI | ausente | **fechada**: JSON sim, Swagger UI não (lacuna) |
| POST | `/fiscal/ncm` | autenticado, `permission >= 2` | `createNcmBodySchema` (strict, `ncm_code` só dígitos, datas ISO) | `201 {create}`; `409 Já cadastrado.` | ausente | **fechada** |
| PUT | `/fiscal/ncm` | `permission >= 2` | `updateNcmBodySchema` | `200` entidade; `404 NCM não existe.`; `500 Erro ao atualizar.` | ausente | **fechada** |
| DELETE | `/fiscal/ncm?ncm_id` | `permission >= 3` | uuid | `200 {deleted}`; `404 NCM nao existe.` | ausente | **fechada** |
| GET | `/fiscal/ncm?ncm_id` | autenticado | uuid | `200 {detail}`; `404 NCM não encontrado.` | ausente | **fechada** |
| GET | `/fiscal/ncm/list` | autenticado | `ncmCodes` (CSV/repetido), `page`, `page_size <= 100` | `{data,total,page,limit,hasMore}` | ausente | **fechada** |
| POST/PUT/DELETE/GET | `/fiscal/icms`, `/fiscal/icms/list` | idem, com `icms_id` / `icmsCodes` | schemas ICMS | idem | ok (piloto) | ok (rotas genéricas, mesmo `IcmsService` canônico) |
| POST/PUT/DELETE/GET | `/fiscal/ipi`, `/fiscal/ipi/list` | idem, com `ipi_id` / `ipiCodes` | schemas IPI | idem, mensagens `IPI …` | ausente | **fechada** |
| GET | `/fiscal/ncm-search?ncmCode` | autenticado | `ncmCode` não vazio | `{ncm, icms[], ipi[]}` na mesma `$transaction` | ausente | **fechada** |
| GET | `/internal/reporting/catalog` | `x-internal-service-token` + grant HMAC (`fiscal.catalog`) | grant strict, TTL ≤ 60s, request-id, hash do corpo | fontes ICMS+NCM+IPI, `relations: []` | ausente | **fechada** |
| POST | `/internal/reporting/extract` | token + grant HMAC (`extract`, source, fields) | `internalReportingExtractBodySchema` | `{rows, reachedLimit}` pelo `InternalReportingService` canônico (snapshot + `executeReportingQuery`) | ausente | **fechada** |
| GET | `/ready` | pública | — | — | extra no Worker | mantida |

Envelopes: sucesso via `createSuccessResponse`; erro via `serializeError`, agora com `requestId` sempre presente como no Express (`requestContext` gera um quando o header falta). O teste ICMS antigo, que esperava o envelope sem `requestId`, foi ajustado para o contrato do Node.

## Correções TDD

RED observado antes da implementação: `remainder.routes.test.ts` com 13 falhas (404 nas rotas ausentes, sem `x-request-id`, sem 503) e `fiscalServices.test.ts` falhando por módulo inexistente. GREEN: 3 arquivos, 26 testes.

- **NCM/IPI/busca:** `IpiService`, `NcmService` e `FiscalSearchService` do Node importam no topo do módulo o Prisma e a auditoria Node, que leem `process.env` e carregam `pg`/`dotenv`. Por isso não podem ser importados no Worker. Foram portados em `src/fiscalServices.ts` (CRUD por configuração para IPI/NCM, com as mesmas `where`, `select`, ordenação, paginação, duplicidade 409, mensagens 404/500 e ações de auditoria). ICMS, schemas, `getPaginationParams`, `InternalReportingService` e a spec OpenAPI continuam importados do pacote canônico.
- **Prisma:** o schema do Worker ganhou `Ncm` (`fiscal.ncm`) e `Ipi` (`fiscal.ipi`), copiados de `infra/prisma/schema.prisma` sem a relação `organization`, no mesmo padrão do modelo `Icms` já existente.
- **Autorização:** o Worker gateway só encaminha identidade e não aplica a política de módulo do gateway Node (`fiscal >= 1` para GET, `>= 2` para escrita). O Worker fiscal agora aplica essa política, além de `permission >= 2` para POST/PUT e `>= 3` para DELETE. Organização vazia vira 403. A permissão encaminhada usa `parseInt`, como no Node.
- **Cookie:** o Worker aceitava cookie sem CSRF nem validação de sessão. Agora usa o padrão do contabil-worker: CSRF duplo em mutações e `validateWorkerSession` via `USER_SERVICE`. Sem binding ou token, responde `503` explícito. Bearer continua aceito, como no Node.
- **Auditoria:** antes, sem binding ela era descartada em silêncio. Agora escrita sem `AUDIT_SERVICE` ou `AUDIT_SERVICE_TOKEN` falha com `503` **antes** de persistir. Depois da persistência, o envio é best-effort (timeout de 5s, falha só é logada), como no recorder público do Node.
- **Banco:** sem `HYPERDRIVE.connectionString` e sem `DATABASE_URL`, responde `503` explícito antes de criar o Prisma.
- **HTTP:** headers de segurança do `createSecurityHeadersMiddleware` (HSTS em produção), CORS por `SERVICE_ALLOWED_ORIGINS` (403 para origem não permitida) e eco de `x-request-id`.
- **Reporting:** a verificação do grant é a mesma do Express (token interno, grant base64url canônico, HMAC-SHA256, operação/fonte/campos/request-id/hash/TTL), com WebCrypto e `Buffer` (`nodejs_compat`), sem `atob`/`fromCharCode`. Sem `REPORTS_INTERNAL_TOKEN` ou `REPORTS_GRANT_SECRET`, responde `503`. No Node esses valores têm defaults de desenvolvimento.

## Validações

- `pnpm install --frozen-lockfile`: dependências instaladas. O comando terminou com `ERR_PNPM_IGNORED_BUILDS` (build scripts ignorados por política), e o lockfile não mudou.
- `pnpm --filter @workspace/shared build` e `pnpm --filter @workspace/runtime build`: pré-requisito local (dist não versionado).
- `DATABASE_URL=postgresql://codegen@localhost:5432/codegen pnpm --filter @workspace/fiscal-service prisma:generate`: gera o client dos services, necessário para o `import type` do `IcmsService`. A URL é só um placeholder de codegen, não credencial, e não foi versionada.
- `pnpm --filter @workspace/fiscal-worker test`: GREEN, 3 arquivos e 26 testes.
- `pnpm --filter @workspace/fiscal-worker typecheck`: GREEN.
- `pnpm --filter @workspace/fiscal-worker build`: GREEN.
- `pnpm --filter @workspace/fiscal-worker check`: GREEN, 14 arquivos.
- `pnpm --filter @workspace/fiscal-worker exec prisma validate --schema prisma/schema.prisma`: válido.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma`: válido.
- `pnpm exec wrangler deploy --dry-run --config workers/fiscal-service/wrangler.jsonc`: GREEN, 6313.17 KiB / 1981.59 KiB gzip, bindings `AUDIT_SERVICE` e `USER_SERVICE`. Nenhum deploy.
- `git diff --cached --check`: limpo.
- `pnpm graphify:update:services`: **não executado**, porque o grafo não existe no escopo do worktree. O grafo do checkout principal não foi alterado.

## Lacunas reais

- **Hyperdrive:** `wrangler.jsonc` não declara `HYPERDRIVE`, porque não há ID autorizado. Sem ele e sem o secret `DATABASE_URL`, o Worker responde 503.
- **Secrets de ambiente:** `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `AUDIT_SERVICE_TOKEN`, `USER_SERVICE_INTERNAL_TOKEN`, `REPORTS_INTERNAL_TOKEN` e `REPORTS_GRANT_SECRET` não estão no arquivo Wrangler e precisam ser provisionados no ambiente.
- **Reporting sem binding:** o reports-service Worker chama o fiscal por `FISCAL_SERVICE_URL`, não por service binding. Está fora deste escopo.
- **Swagger UI (`/docs`):** não portado, só `/openapi.json`. Só existe fora de produção.
- **Retry de auditoria:** o recorder Node faz retry em background. O Worker faz uma tentativa com timeout e registra a falha (marcado com `ponytail:` em `src/audit.ts`). Se isso importar, adicionar fila ou `waitUntil`.
- **Sem validação real:** nada foi testado contra PostgreSQL/Supabase/Hyperdrive, bindings remotos ou smoke autenticado. Os testes usam doubles de service/Prisma.

## Riscos para staging

- Usuários sem `modules.fiscal` passam a receber 403 no Worker. Essa era a política do gateway Node, que o Worker gateway não aplica.
- Uma escrita fiscal falha com 503 se `AUDIT_SERVICE_TOKEN` não estiver provisionado.
- As tabelas `fiscal.ncm` e `fiscal.ipi` usam o `@@map` literal do schema canônico. Isso precisa ser confirmado no banco de staging via Hyperdrive.

## Commit

- Código: `aae2f246` `feat(fiscal-worker): close NCM, IPI, search and reporting parity`.
- Relatório: commit `docs(fiscal-worker)` separado, na branch local `agent-fiscal-remainder`.
