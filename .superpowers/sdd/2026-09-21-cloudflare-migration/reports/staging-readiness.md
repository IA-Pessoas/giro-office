# Readiness de staging: contabil, fiscal, triagem, parcelamento e gateway

Data: 2026-09-22. Base: `cloudflare-migration` @ `34958e27`. Checagem somente leitura.

## Veredito

**Staging não está pronto.** Nenhum Worker `giro-*` da migração existe na conta Cloudflare,
não há Hyperdrive, nenhum `wrangler.jsonc` tem `env.staging` nem binding `hyperdrive`, e o
schema Prisma do Worker de triagem aponta para tabelas que não existem no banco.

## O que foi verificado ao vivo

| Verificação | Fonte | Resultado |
|---|---|---|
| Conta autenticada | `wrangler whoami` (4.135.0, OAuth) | Uma conta: `4bd169ead930e11c04651aa29086ce83` |
| Workers existentes | MCP `workers_list` | 8 Workers, **nenhum `giro-*` da migração** (há só `giro-agents-api`, `giro-agents-api-dev` e outros projetos) |
| Hyperdrive | `wrangler hyperdrive list` e MCP `hyperdrive_configs_list` | **0 configs** |
| Secrets por Worker | `wrangler secret list --name <worker>` | Todos: `Worker "<nome>" not found` |
| Deployments | `wrangler deployments list --name <worker>` | Todos: `code 10007, This Worker does not exist` |
| Tabelas no banco de staging | — | **PENDENTE**: o MCP Supabase exige autenticação; não foi forçada. Nenhum `.env*` foi lido |

Nenhum valor de secret foi lido nem registrado. Nenhum recurso remoto foi criado ou alterado.

## Por Worker: esperado no repo × remoto

`compatibility_date` = `2026-09-22` e `compatibility_flags` = `["nodejs_compat"]` nos seis
arquivos. `observability.enabled` = true em todos. **Nenhum tem bloco `env.staging`, binding
`hyperdrive` nem `vars` de ambiente**, exceto o reports, que tem `vars`. Remoto: Worker
inexistente em todos, então a coluna "remoto" vale "ausente" para bindings, secrets e vars.

### giro-contabil-service

| Item | Esperado (repo) | Remoto |
|---|---|---|
| Service bindings | `AUDIT_SERVICE`→`giro-audit-service`, `TRIAGEM_SERVICE`→`giro-triagem-service`, `USER_SERVICE`→`giro-user-service` | Worker ausente. Os 3 alvos também ausentes |
| Banco | `HYPERDRIVE` (binding) ou `DATABASE_URL` (secret) | Nenhum |
| Secrets obrigatórios | `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` | Nenhum |
| Secrets funcionais | `USER_SERVICE_INTERNAL_TOKEN` (sem ele, a auth por cookie responde 503), `AUDIT_SERVICE_TOKEN`, `TRIAGEM_INTERNAL_TOKEN`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` | Nenhum |
| Vars | nenhuma | — |

### giro-fiscal-service

| Item | Esperado (repo) | Remoto |
|---|---|---|
| Service bindings | `AUDIT_SERVICE`, `USER_SERVICE` | Worker ausente |
| Banco | `HYPERDRIVE` ou `DATABASE_URL` | Nenhum |
| Secrets obrigatórios | `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` | Nenhum |
| Secrets funcionais | `USER_SERVICE_INTERNAL_TOKEN`, `AUDIT_SERVICE_TOKEN`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` | Nenhum |
| Vars lidas pelo código | `NODE_ENV` (HSTS só em `production`), `SERVICE_ALLOWED_ORIGINS` (**default `*`**), `ENABLE_API_DOCS` | Nenhuma declarada no `wrangler.jsonc` |

### giro-triagem-service

| Item | Esperado (repo) | Remoto |
|---|---|---|
| Service bindings | `AUDIT_SERVICE` | Worker ausente |
| Banco | `HYPERDRIVE` ou `DATABASE_URL` | Nenhum |
| Secrets obrigatórios | `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` | Nenhum |
| Secrets funcionais | `AUDIT_SERVICE_TOKEN` | Nenhum |
| Vars | nenhuma | — |

O contabil chama o triagem com `TRIAGEM_INTERNAL_TOKEN`. Esse valor precisa ser igual ao
`INTERNAL_SERVICE_TOKEN` do triagem.

### giro-parcelamento-service

| Item | Esperado (repo) | Remoto |
|---|---|---|
| Service bindings | `AUDIT_SERVICE`, `USER_SERVICE` | Worker ausente |
| Banco | `HYPERDRIVE` ou `DATABASE_URL` | Nenhum |
| Secrets obrigatórios | `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` | Nenhum |
| Secrets funcionais | `USER_SERVICE_INTERNAL_TOKEN`, `AUDIT_SERVICE_TOKEN`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` | Nenhum |
| Vars | `AUDIT_ENABLED` (sem valor = ligado) | Não declarada |

### giro-gateway

| Item | Esperado (repo) | Remoto |
|---|---|---|
| Service bindings (17) | `AUDIT`, `DEPARTMENT`, `ORGANIZATION`, `USER`, `CLIENT`, `FISCAL`, `CERTIFICATE`, `REPORTS`, `PARCELAMENTO`, `CONTABIL`, `PROJECT`, `TI`, `RH`, `COMMERCIAL`, `TRIAGEM`, `PESSOAL`, `REGULARIZE` (`*_SERVICE` → `giro-<x>-service`) | Worker ausente. **Os 17 alvos também ausentes** |
| Banco | não usa | — |
| Secrets obrigatórios | `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN` | Nenhum |
| Secrets funcionais | `AUDIT_SERVICE_TOKEN`, que precisa ser diferente de `INTERNAL_SERVICE_TOKEN` (o código registra erro se forem iguais) | Nenhum |

### giro-reports-service (consumidor de `FISCAL_SERVICE_URL`)

| Item | Esperado (repo) | Remoto |
|---|---|---|
| Service bindings | `USER_SERVICE`, `AUDIT_SERVICE` | Worker ausente |
| Vars declaradas | `NODE_ENV="development"`, `ENABLE_API_DOCS="false"`. **Em staging, `NODE_ENV` deveria ser `production`** | — |
| URLs de fonte | `FISCAL_SERVICE_URL`, `CONTABIL_SERVICE_URL`, `PARCELAMENTO_SERVICE_URL` e mais 9 `*_SERVICE_URL`, todas sem valor. Sem valor, caem em `http://127.0.0.1:9` | — |
| Secrets | `JWT_SECRET`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET`, `USER_SERVICE_INTERNAL_TOKEN`, `AUDIT_SERVICE_TOKEN`, `CERTIFICATE_REPORTING_*`, `REGULARIZE_REPORTING_*`, `HYPERDRIVE`/`DATABASE_URL` | Nenhum |

`REPORTS_INTERNAL_TOKEN` e `REPORTS_GRANT_SECRET` precisam ter o mesmo valor no reports e
nos Workers-fonte (contabil, fiscal e parcelamento). A assinatura é HMAC do grant.

## Hyperdrive

- A conta não tem nenhuma config de Hyperdrive, portanto não há nome nem ID para registrar.
- Nenhum `workers/*/wrangler.jsonc` declara `hyperdrive`. O runtime
  (`workers/runtime/src/prisma.ts`) usa `env.HYPERDRIVE?.connectionString` e, se ele faltar,
  `env.DATABASE_URL`. Hoje só o fallback funcionaria.

## `FISCAL_SERVICE_URL`

- **Onde é usada:** `workers/reports-service/src/env.ts:73` → `fiscalServiceUrl`, consumida
  por `services/reports-service/src/integrations/fiscal{Ncm,Icms,Ipi}Adapter.ts`. Esses
  adapters fazem `fetch(new URL("/internal/reporting/extract", fiscalServiceUrl))` com fetch
  global.
- **Valor por ambiente:** local `http://localhost:3037` (`.env.example`, default do zod), VPS
  `http://fiscal-service:3037` (`docker-compose.vps.yml`), Worker sem valor, o que dá
  `http://127.0.0.1:9` e falha. Em staging no Cloudflare seria a URL pública do fiscal
  Worker (`workers.dev` ou rota), e esse endpoint `/internal/*` ficaria exposto na internet.
- **Recomendação:** trocar por um Service Binding `FISCAL_SERVICE` → `giro-fiscal-service`
  no reports. Fetch entre Workers da mesma conta por URL pública é mais lento, sai para a
  rede e expõe o endpoint interno. O mesmo vale para contabil e parcelamento. Isso exige
  mudar os adapters para receber um `fetcher`, o que não cabe em `vars`, e fica fora desta
  checagem.

## Tabelas de banco (fonte: migrations em `infra/prisma/migrations`, não ao vivo)

**Atenção ao nome:** `fiscal.ncm` e `fiscal.ipi` **não estão num schema `fiscal`**. O Prisma
não usa `multiSchema` aqui, e `@@map("fiscal.ncm")` cria no schema `public` uma tabela cujo
nome literal é `"fiscal.ncm"` (`20251024120217_fiscal/migration.sql`:
`CREATE TABLE "fiscal.ncm"`). Uma consulta com `table_schema='fiscal'` retorna vazio mesmo
com as tabelas presentes. Use `table_schema='public' and table_name like 'fiscal.%'`.

| Worker | Modelo | Tabela (`public`) | Migration que cria |
|---|---|---|---|
| fiscal | Ncm | `fiscal.ncm` | 20251024120217_fiscal (+ `organization_id` em 20260220185848_init_tenancy) |
| fiscal | Ipi | `fiscal.ipi` | idem |
| fiscal | Icms | `fiscal.icms` | idem |
| contabil | ControlContabil / RelationshipContabil / ResponsibleContabil | `contabil.control` / `contabil.relationship` / `contabil.responsibles` | 20251017182457_contabil |
| contabil | Client | `clients` | 20250417140533_clients |
| contabil, triagem | TriageConfig / TriageMonthly | `triagem.configs` / `triagem.monthly` | 20251203141052_triagem |
| contabil, triagem | TriageResponsible | `triagem.responsibles` | 20251204184947_triagem_responsibles |
| contabil, triagem | TriageBankStatement | `triagem.bank_statements` | 20260916110000_triage_documents_bank_statements |
| contabil, triagem | TriageClosing | `triagem.closings` | 20260916120000_triage_closings |
| contabil, triagem | TriageCompetence | `triagem.competences` | 20260917120000_triagem_competences |
| triagem | TriageCompetenceHistory / TriageOutboxEvent | `triagem.competence_history` / `triagem.outbox_events` | 20260917120000_triagem_competences |
| contabil, triagem | TriageCatalogItem / TriageCompetenceCatalogSnapshot | `triagem.catalog_items` / `triagem.competence_catalog_snapshots` | 20260918110000_triagem_catalogs |
| triagem | TriageExternalLink | `triagem.external_links` | 20260918090000_triagem_external_links |
| triagem | TriageUrgentRequest | `triagem.urgent_requests` | 20260918095000_triagem_urgent_requests |
| **triagem** | **Organization / Client / User** | **`"Organization"` / `"Client"` / `"User"`: não existem** | **nenhuma**. As tabelas reais são `organizations`, `clients` e `users` |
| parcelamento | Installment / InstallmentCompetencies / PanoramaParcelameto | `parcelamento.installments` / `parcelamento.installmentsCompetencies` / `parcelamento.panorama` | 20251027162331_parcelamento |
| parcelamento | Client / User | `clients` / `users` | 20250417140533_clients / 20250416144614_start |

A presença ao vivo depende de o staging estar com todas as migrations até
`20260922100000_report_job_idempotency` aplicadas. Isso está **PENDENTE**.

## Bloqueadores, por severidade

1. **P0: nenhum Worker existe na conta.** Contabil, fiscal, triagem, parcelamento, gateway,
   reports e as dependências `giro-audit-service`/`giro-user-service` estão ausentes. O
   gateway depende de 17 Workers; um deploy com service binding para Worker inexistente
   tende a ser recusado. Ordem de deploy: user, audit e depois triagem, fiscal, parcelamento,
   contabil, reports e, por último, o gateway.
2. **P0: bug de schema no triagem Worker.** `workers/triagem-service/prisma/schema.prisma`
   declara `Organization`, `Client` e `User` sem `@@map`. Os services reaproveitados
   (`triageUrgentRequestService`, `triageExternalLinkService`, `triageCompetenceService`)
   fazem `transaction.client.findFirst` / `transaction.user.findFirst` e
   `select { requester, responsible }`. Contra o banco real isso vira
   `relation "Client" does not exist`. Correção: `@@map("organizations")`,
   `@@map("clients")` e `@@map("users")`, como no parcelamento. Os testes com mock não pegam.
3. **P0: sem conexão de banco.** Não há Hyperdrive na conta nem binding em nenhum
   `wrangler.jsonc`. Falta criar a config (origem = Postgres de staging) e adicionar
   `"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id>" }]` em `env.staging` de contabil,
   fiscal, triagem, parcelamento e reports.
4. **P1: nenhum `env.staging`.** Sem ele, `wrangler deploy --env staging` publica
   `giro-<x>-staging` **sem** services, vars nem Hyperdrive, porque bindings não são
   herdados entre envs. Além disso, os `service` apontam para os nomes sem sufixo. É preciso
   decidir entre uma conta separada com os nomes atuais e `env.staging` com alvos
   `giro-<x>-service-staging`.
5. **P1: secrets não provisionados.** O mínimo por Worker está nas tabelas acima. Pares que
   precisam coincidir: `TRIAGEM_INTERNAL_TOKEN` (contabil) = `INTERNAL_SERVICE_TOKEN`
   (triagem); `REPORTS_INTERNAL_TOKEN`/`REPORTS_GRANT_SECRET` iguais no reports e nas fontes;
   `USER_SERVICE_INTERNAL_TOKEN`/`AUDIT_SERVICE_TOKEN` iguais aos tokens aceitos pelo user e
   pelo audit.
6. **P2: `FISCAL_SERVICE_URL` e as demais `*_SERVICE_URL` do reports sem valor.** Sem valor,
   os relatórios fiscais, contábeis e de parcelamento falham (`127.0.0.1:9`). Recomendado
   usar Service Binding (ver acima).
7. **P2: vars de staging.** No reports, `NODE_ENV="development"` está fixo no topo do
   arquivo. No fiscal, `SERVICE_ALLOWED_ORIGINS` tem default `*` e `NODE_ENV` não está
   definido, então fica sem HSTS. Declarar em `env.staging.vars`.
8. **P3: tabelas não confirmadas ao vivo.** Pelas migrations, `fiscal.ncm` e `fiscal.ipi`
   existem, no schema `public` e com nome literal.

## Comandos para fechar pendências (o usuário executa)

Tabelas (somente leitura):

```sh
! psql "$STAGING_DATABASE_URL" -c "select table_schema, table_name from information_schema.tables where table_schema='public' and (table_name like 'fiscal.%' or table_name like 'triagem.%' or table_name like 'contabil.%' or table_name like 'parcelamento.%' or table_name in ('clients','users','organizations')) order by 2"
! psql "$STAGING_DATABASE_URL" -c "select migration_name, finished_at from _prisma_migrations order by finished_at desc nulls first limit 5"
```

Cloudflare (leitura, depois de criar os Workers):

```sh
! pnpm exec wrangler hyperdrive list
! for n in giro-contabil-service giro-fiscal-service giro-triagem-service giro-parcelamento-service giro-gateway giro-reports-service; do pnpm exec wrangler secret list --name "$n"; done
```

Provisionamento (escrita, fora do escopo desta checagem; o usuário decide):

```sh
! pnpm exec wrangler hyperdrive create giro-staging-db --connection-string="$STAGING_DATABASE_URL"
! pnpm exec wrangler secret put JWT_SECRET --name giro-fiscal-service   # repetir por secret/Worker
```
