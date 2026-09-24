# Runbook — smoke real com banco de verdade (Workers Cloudflare)

Data: 2026-09-22
Escopo: `scripts/cloudflare-smoke/**` (novo) e este relatório.
Alvo do smoke: Workers `contabil`, `fiscal`, `triagem`, `parcelamento`, com `gateway` na frente e
`audit-service` + `user-service` como dependências.
Referências: plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` e os relatórios
`*-remainder.md` desta pasta, que registram "sem validação real contra PostgreSQL/Hyperdrive" como
lacuna aberta. Este runbook fecha o ferramental dessa validação.

Nada em `workers/**`, `services/**`, `shared/**`, `infra/**`, `package.json` ou no lockfile foi
alterado. Não houve deploy, push, migration em ambiente compartilhado nem escrita em staging.

## O que o harness prova

| Etapa | O que valida |
|---|---|
| `db.conexao` | conexão PostgreSQL real (usuário, versão, porta) |
| `db.migrations_aplicadas` | todas as migrations de `infra/prisma/migrations` presentes e finalizadas em `_prisma_migrations`; nunca aplica nada fora do banco local |
| `db.rls_configurado` | RLS habilitado nas tabelas multi-tenant e papel `giro_user_runtime` sem `BYPASSRLS`/`SUPERUSER` |
| `seed.organizacoes_de_teste` | cria org A, org B, departamentos, usuários, clientes e sessão, todos com prefixo `cfsmoke-<run>` |
| `workers.health_ready` | `/health` e `/ready` dos 7 Workers (o `/ready` toca o banco) |
| `auth.sem_token_e_token_invalido` | 401 sem token e com token adulterado, no gateway e no Worker |
| `auth.bearer_direto_e_via_gateway` | JWT HS256 aceito no Worker e via gateway |
| `auth.cookie_csrf_via_gateway` | cookie de sessão + CSRF: GET ok, mutação sem `x-csrf-token` → 403, mutação com CSRF válido → 201; inclui validação de sessão no `user-service` |
| `crud.fiscal_ncm` | POST/GET/PUT/LIST em `fiscal.ncm` |
| `crud.contabil_relationships` | POST/GET/PUT em `contabil.relationship` |
| `crud.triagem_catalogs` | POST/GET/PATCH em `triagem.catalog_items` |
| `crud.parcelamento_installments` | POST/GET/PATCH/LIST em `parcelamento.installments` |
| `tenant.org_b_nao_ve_org_a` | org B não vê listas nem GET direto de recursos da org A (404) |
| `rls.set_local_role_giro_user_runtime` | prova em SQL: com `SET LOCAL ROLE "giro_user_runtime"` + `app.organization_id`, a org A vê 1 linha e a org B vê 0 |
| `reporting.catalog_com_grant_hmac` | catálogo interno de fiscal/contabil/parcelamento com grant HMAC válido (200) e com assinatura adulterada (403) |
| `reporting.extract_respeita_tenant` | `extract` com grant da org A traz a linha criada; com grant da org B, não traz |
| `auditoria.request_do_gateway` | request autenticado pelo gateway vira linha em `audit_requests` com o mesmo `x-request-id` |
| `auditoria.entity_change_do_worker` | mutação no Worker gera `ENTITY_CHANGE` de `fiscal.ncm` em `audit_requests` |
| `outbox.triagem_reconcile_despacha` | competência da triagem grava na outbox e `/internal/triagem/audit/reconcile` despacha ao audit-service |
| `cleanup.dados_de_teste` | remove tudo que o run criou, por `organization_id` de teste |

Qualquer etapa que falhe imprime `FAIL` e o processo termina com código 1. Não há mock: toda
verificação passa por HTTP real no Worker e por SQL no banco real.

## Arquivos

- `scripts/cloudflare-smoke/run.mjs` — orquestrador e as 20 verificações.
- `scripts/cloudflare-smoke/local-env.mjs` — Postgres descartável, migrations, geração de client e `wrangler dev`.
- `scripts/cloudflare-smoke/lib.mjs` — JWT, CSRF, grant HMAC e os guard-rails de alvo.
- `scripts/cloudflare-smoke/lib.test.mjs` — self-check dos helpers (`node --test`), sem rede e sem banco.

Só dependências já instaladas: `pg` (via `infra`), `wrangler`, `prisma` e `fetch` do Node.

## Como rodar

### Self-check (sem banco, sem rede)

```bash
node scripts/cloudflare-smoke/run.mjs --self-check
```

Roda os testes de `lib.mjs`, confere `wrangler`, os sete `wrangler.jsonc` e a contagem de migrations,
e reporta se o Docker está disponível.

### Banco local descartável (modo padrão)

Requer Docker. Nenhuma variável é obrigatória.

```bash
node scripts/cloudflare-smoke/run.mjs
```

O harness: sobe `public.ecr.aws/supabase/postgres:17.6.1.167` num container
`giro-cf-smoke-<run>` (label `giro.cf-smoke=1`, porta efêmera em 127.0.0.1) com senha aleatória;
aplica `prisma migrate deploy`; gera os Prisma Clients com `runtime = "workerd"`; sobe um
`wrangler dev` por Worker com binding **Hyperdrive local** apontando para esse Postgres; roda as
verificações; limpa os dados de teste, derruba os Workers, restaura os clients Node e remove o
container que ele mesmo criou.

Opcionais:

| Variável | Default | Efeito |
|---|---|---|
| `SMOKE_PG_IMAGE` | `public.ecr.aws/supabase/postgres:17.6.1.167` | imagem do Postgres descartável |
| `SMOKE_PORT_BASE` | `8870` | portas dos Workers (`+100` para os inspectors) |
| `SMOKE_STRICT_MIGRATIONS` | — | `1` faz os workarounds de migration virarem falha |
| `SMOKE_KEEP_TMP` | — | `1` preserva configs e logs do `wrangler dev` |

### Alvo externo (staging/clone), só com flag explícita

Não sobe nada: o operador precisa ter os Workers no ar (preview ou `wrangler dev` apontando ao
banco autorizado) e fornecer os segredos reais. O harness recusa qualquer host, base ou usuário
que contenha `prod`/`producao`/`prd`/`live`, e exige a frase exata de confirmação de escrita.

```bash
SMOKE_MODE=external \
SMOKE_ALLOW_EXTERNAL=1 \
SMOKE_CONFIRM_WRITES="CONFIRMO-ESCRITA:<host-do-banco>/<nome-da-base>" \
SMOKE_DATABASE_URL=... \
SMOKE_JWT_SECRET=... \
SMOKE_INTERNAL_SERVICE_TOKEN=... \
SMOKE_AUDIT_SERVICE_TOKEN=... \
SMOKE_REPORTS_INTERNAL_TOKEN=... \
SMOKE_REPORTS_GRANT_SECRET=... \
SMOKE_BASE_URL_GATEWAY=... \
SMOKE_BASE_URL_AUDIT=... \
SMOKE_BASE_URL_USER=... \
SMOKE_BASE_URL_CONTABIL=... \
SMOKE_BASE_URL_FISCAL=... \
SMOKE_BASE_URL_TRIAGEM=... \
SMOKE_BASE_URL_PARCELAMENTO=... \
node scripts/cloudflare-smoke/run.mjs
```

Regras do modo externo, aplicadas em código:

- host/base/usuário com marcador de produção → recusa, mesmo com confirmação;
- sem `SMOKE_ALLOW_EXTERNAL=1` → recusa;
- `SMOKE_CONFIRM_WRITES` diferente da frase esperada → recusa e imprime a frase exata;
- migrations **nunca** são aplicadas neste modo: a etapa só compara `_prisma_migrations` com o diretório;
- todas as escritas usam organizações de teste com prefixo `cfsmoke-<run>` e são removidas no fim.

Nenhum segredo fica no repositório e nenhum `.env*` real é lido.

## Execução real registrada (2026-09-22)

Docker disponível; execução contra Postgres local descartável, imagem Supabase 17.6.1.167.

- `node scripts/cloudflare-smoke/run.mjs --self-check`: exit 0 (9 testes de helpers verdes).
- `node scripts/cloudflare-smoke/run.mjs`: **19 etapas verdes, 1 falha, exit 1**.
  - Verdes: conexão, migrations, RLS configurado, seed, health/ready dos 7 Workers, auth (401,
    bearer, cookie+CSRF), CRUD de fiscal/contabil/triagem/parcelamento, isolamento de tenant por
    API, prova de RLS por SQL, reporting catalog+extract com grant HMAC (incluindo 403 com
    assinatura adulterada), auditoria do gateway e `ENTITY_CHANGE` do Worker, limpeza (27 linhas).
  - Falha: `outbox.triagem_reconcile_despacha` — ver achado 3 abaixo.
- Depois do run: nenhum container `giro.cf-smoke=1` remanescente, nenhum `wrangler dev` vivo,
  `git status` sem alteração fora de `scripts/cloudflare-smoke/`.

## Achados reais desta execução

1. **Prisma Client dos Workers não roda em workerd.** Os `prisma/schema.prisma` dos Workers (e os
   generators do schema canônico) não declaram `runtime = "workerd"`. O client gerado executa
   `globalThis["__dirname"] = path.dirname(fileURLToPath(import.meta.url))` e o Worker aborta no
   start com `TypeError: The "path" argument must be of type string... Received undefined`.
   `wrangler deploy --dry-run` não pega isso porque não executa o bundle. O harness contorna
   localmente regenerando os clients (saída gitignored) e restaura os clients Node no fim, mas a
   correção definitiva é declarar o runtime nos generators.
2. **A cadeia de migrations não é replayável do zero.** Reproduz o que `docs/qa/wizard-projetos-qa.md`
   já registrava:
   - `20260821200000_add_platform_auth_sessions` recria `PlatformRole`/`platform_users` de
     `20260713100000`; o harness aplica o reparo oficial
     `infra/prisma/repairs/reconcile-platform-auth-sessions.sql` e faz `migrate resolve --applied`;
   - `20260916170000_rh_request_workflow` usa o schema `"rh"` (inexistente num banco novo) enquanto
     os modelos Prisma mapeiam tabelas `public."rh.*"`; no banco local ela é marcada como aplicada e
     as tabelas de RH ficam ausentes (fora do escopo deste smoke).
   Cada workaround é impresso como `WORKAROUND` e some com `SMOKE_STRICT_MIGRATIONS=1`.
3. **`triagem-worker`: modelos `Client` e `User` sem `@@map`.** Em
   `workers/triagem-service/prisma/schema.prisma` os modelos `Client` (linha 28) e `User` (linha 44)
   não têm `@@map("clients")`/`@@map("users")` — ao contrário do `parcelamento-worker`. Contra banco
   real, `POST /triagem/competencies` falha com `P2021: The table public.Client does not exist`
   (HTTP 500). Isso bloqueia toda rota da triagem que valide cliente/responsável e, por tabela, a
   gravação na outbox e a reconciliação de auditoria. É a falha registrada acima; os testes com
   dublê de Prisma não a detectam. Correção fica fora deste escopo (`workers/**` não foi tocado).
4. **Auditoria depende de FK real.** `audit_requests` tem FK para `users` e `organizations`: um
   `userId` sem linha correspondente derruba a gravação com 500 no audit-service, e os Workers
   tratam isso como best-effort (log e segue). Em staging, usuário/organização precisam existir,
   senão a auditoria é perdida em silêncio.
5. **Hyperdrive não está declarado em nenhum `wrangler.jsonc`.** O smoke injeta o binding
   `HYPERDRIVE` com `localConnectionString` numa config temporária (fora do repo). Antes de qualquer
   ambiente real, o binding precisa ser provisionado; sem ele os Workers respondem 503.
6. **Inspectors colidem.** Vários `wrangler dev` simultâneos exigem `--inspector-port` distinto;
   o harness já atribui `porta + 100`.

## Limitações conhecidas

- O banco local é um Supabase Postgres novo: prova RLS, papéis e grants, mas não dados legados.
- O `user-service` só é exercitado como validador de sessão do fluxo cookie+CSRF.
- Reporting é validado em fiscal, contabil e parcelamento; a triagem não expõe reporting interno.
- Service Bindings usam o dev registry local do wrangler: outro `wrangler dev` com os mesmos nomes
  de Worker na mesma máquina pode interferir.
- O modo externo não aplica nem repara migrations: só compara o estado.
