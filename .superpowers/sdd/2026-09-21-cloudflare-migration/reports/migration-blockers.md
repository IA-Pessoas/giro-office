# Bloqueios remanescentes da migração Cloudflare

Levantamento com evidência executada, não leitura de código apenas. O smoke
local rodou ponta a ponta contra Postgres real em container descartável
(loopback, `run=cfsmoke-30e27ec5`): **19 de 20 checks passaram**.

## 1. Prisma `runtime = "workerd"` — resolvido (ver §9 para a metade compartilhada)

### Contrato comprovado

Extraído do binário instalado (`node_modules/prisma/build/cli.js`), não de
documentação:

```js
b8t = ["nodejs","deno","bun","workerd","cloudflare","vercel-edge","edge-light"]
a = n.runtime !== void 0 ? I3e(n.runtime) : "nodejs"        // default: nodejs
workerd|cloudflare → "workerd" → runtimeName "wasm-compiler-edge", compilerBuild "fast"
```

O gerador `prisma-client` default é `nodejs`. Os 17 schemas dos Workers não
declaravam `runtime`, logo emitiam client Node.

Diferença medida no client gerado do audit-service:

| | `nodejs` | `workerd` |
|---|---|---|
| imports | `node:process`, `node:path`, `node:url` + `fileURLToPath` | nenhum |
| runtime | `@prisma/client/runtime/client` | `.../wasm-compiler-edge` |
| WASM | `…wasm-base64.mjs`, decodificado em JS a cada cold start | `./query_compiler_fast_bg.wasm?module`, nativo |
| upload | 5584.63 KiB | **4405.16 KiB** |
| gzip | 1869.12 KiB | **1361.52 KiB** |

Pré-requisito já satisfeito: os 17 Workers criam o client via
`createWorkerPrismaClient` com adapter `PrismaPg`
(`workers/runtime/src/prisma.ts:26-28`), que é o que o build
`wasm-compiler-edge` exige.

**Resolvido** no commit `2724caa6`: `runtime = "workerd"` nos 17
`workers/*/prisma/schema.prisma`. Gates verdes (ver §5).

### Confirmação independente

O harness de smoke **já contornava isso em tempo de execução**, e diz por quê
(`scripts/cloudflare-smoke/local-env.mjs:170-173`):

> Regenera o Prisma Client de cada Worker com `runtime = "workerd"`.
> Sem isso o client gerado usa `import.meta.url`/__dirname e o Worker nem inicia.

`generateWorkerPrismaClients` (`:175`) injeta a linha num schema temporário
antes de gerar. Com `2724caa6` esse contorno fica redundante para a metade
`workers/*`.

### O que continua bloqueado

Os Workers reusam os services Node, que importam o client gerado do **schema
canônico** `infra/prisma/schema.prisma`. Esse arquivo tem **18 generators**
(`infraClient`, `userServiceClient`, … `commercialServiceClient`), todos sem
`runtime`, todos escrevendo em `services/*/src/generated/prisma`.

O harness também contorna isso (`local-env.mjs:209-212`):

> Os Workers reusam os services Node, que importam o client gerado do schema
> canônico. Esse client também precisa de `runtime = "workerd"`, senão o Worker
> não inicia.

`generateServicePrismaClients` (`:214`) sobrescreve 5 diretórios de
`services/*` com a variante workerd e `restoreServicePrismaClients` (`:239`)
devolve a variante Node no fim.

**Conflito real:** o mesmo output serve os services rodando em Node *e* os
Workers rodando em workerd. Não há valor de `runtime` que atenda aos dois. Não
dá para resolver unilateralmente.

Opções, para decisão:

1. Generators duplicados no schema canônico, com saída workerd em diretório
   próprio, e os Workers importando esse diretório.
2. Os Workers deixam de reusar os services Node e passam a ter o próprio
   acesso a dados.
3. Manter a sobrescrita do harness (funciona no smoke, não funciona em deploy).

Enquanto isso não for decidido, **os Workers que importam `services/*` não
sobem em produção**. Afeta ao menos: certificate, commercial, department,
fiscal, parcelamento (por `grep` de imports).

## 2. Banco — bloqueio duro

- **Zero bindings `hyperdrive`** declarados nos 18 `wrangler.jsonc`.
- **Zero `DATABASE_URL`** em `vars`.
- `workers/runtime/src/prisma.ts:15` lê `env.HYPERDRIVE?.connectionString || env.DATABASE_URL` e lança `"Prisma connection string is not configured"` se ambos faltarem.

Em deploy hoje, 16 Workers falhariam em runtime na primeira consulta.

O `user-service` é o único que falha **explicitamente e de propósito**:

- `workers/user-service/src/app.ts:100` → 503 `"Hyperdrive não configurado para o runtime Worker."` — não aceita fallback por `DATABASE_URL`.
- `workers/user-service/wrangler.jsonc:2` → `// BLOCKED: declare HYPERDRIVE only after an authorized production ID is provisioned.`
- `workers/user-service/src/index.test.ts:94-96` trava isso em teste: a config precisa conter `BLOCKED` e `HYPERDRIVE`, e **não pode** casar `/DATABASE_URL/iu`.

Confirmado: **o user-service rejeita `DATABASE_URL`.**

Nenhum ID, domínio ou credencial foi inventado. Provisionar o Hyperdrive é
decisão de infra do usuário.

## 3. Migrations — o problema não é `CONCURRENTLY`

### `CREATE INDEX CONCURRENTLY` — não é bloqueio

Duas ocorrências:

- `20260824150000_add_audit_requests_path_trigram_index/migration.sql:5`
- `20260713100000_platform_super_admin/migration.sql:36` (misturado com `CREATE TABLE` e `ADD CONSTRAINT` no mesmo arquivo)

A preocupação teórica era erro `25001` por rodar dentro de transação. **Não
ocorre**: o smoke aplicou as 175 migrations com `prisma migrate deploy` real e
o check `db.migrations_aplicadas` passou. Fica registrado como verificado, não
como risco.

### `extensions.crypt` — precondição de ambiente, falha alto

`20260819150000_user_service_tenant_rls/migration.sql:3-5` aborta com
`RAISE EXCEPTION` se `to_regprocedure('extensions.crypt(text,text)')` for nulo,
e usa a função em `:119`. Nenhuma migration cria o schema `extensions` nem
instala `pgcrypto` nele — é convenção Supabase.

O smoke passa porque a imagem padrão é a do Supabase. Num Postgres comum a
migration falha — mas falha **explicitamente**, com mensagem clara. É
precondição de provisionamento, não defeito de migration.

### Bloqueio real: 2 migrations não são replayáveis do zero

Saída do smoke:

```
WORKAROUND migration 20260821200000_add_platform_auth_sessions: recria
  PlatformRole/platform_users já criados em 20260713100000; aplica o reparo
  oficial infra/prisma/repairs/reconcile-platform-auth-sessions.sql
WORKAROUND migration 20260916170000_rh_request_workflow: usa o schema "rh"
  (inexistente num banco novo) enquanto o modelo Prisma mapeia tabelas
  public."rh.*"; as tabelas de RH ficam ausentes no banco local
ok   db.migrations_aplicadas — 175 migrations aplicadas (2 via workaround local)
```

Mecanismo em `scripts/cloudflare-smoke/local-env.mjs:97-133`: `prisma db execute`
do reparo + `migrate resolve --applied` na primeira; `migrate resolve
--rolled-back` seguido de `--applied` na segunda — ou seja, a segunda é marcada
como aplicada **sem nunca rodar**, e as tabelas de RH não existem.

`SMOKE_STRICT_MIGRATIONS=1` (`local-env.mjs:160-164`) transforma isso em erro:
`"Migration <x> não é replayável do zero"`.

Consequência: **um banco novo não converge sem intervenção manual.** Não
reescrevi nada — migrations publicadas não se reescrevem. A correção é
forward-only e precisa de decisão:

1. Uma migration nova que crie o schema `rh` ou realinhe o mapeamento
   `public."rh.*"`, para `20260916170000` deixar de ser pulada.
2. Incorporar `reconcile-platform-auth-sessions.sql` como migration versionada,
   em vez de reparo fora da linha.

## 4. Smoke real — executado, mas não cobre o que foi pedido

O harness é **real**, não mock: container Postgres 17 descartável, `prisma
migrate deploy` de verdade, um `wrangler dev` por Worker com binding Hyperdrive
real apontando para o container (`local-env.mjs:271-275`), cliente `pg` real
conferindo linhas.

Resultado (`run=cfsmoke-30e27ec5`): 19 ok, 1 fail.

Passou: conexão, migrations, RLS com `SET LOCAL ROLE giro_user_runtime` sem
bypass, isolamento multi-tenant (org B não vê org A), auth sem token/token
inválido, bearer direto e via gateway, cookie+CSRF em mutação, CRUD em fiscal /
contabil / triagem / parcelamento, grant HMAC de reporting com 403 em assinatura
adulterada, auditoria de request e de entity change, e despacho do outbox de
triagem.

Falhou: `cleanup.dados_de_teste — triagem.competence_history is append-only`.
É defeito da limpeza do próprio harness, não do produto — a tabela é
append-only por desenho e o cleanup tenta apagar dela.

### O que o smoke **não** prova

Grep em `scripts/cloudflare-smoke/` por
`Promise.all|409|P2028|FOR NO KEY UPDATE|deadlock`: **0 ocorrências.**

- `SELECT ... FOR NO KEY UPDATE` — não exercitado. Vive em
  `workers/parcelamento-service/src/services.ts:303`, dentro de
  `$transaction(..., { isolationLevel: "ReadCommitted" })` (`:222`).
- Concorrência — inexistente. Toda requisição é `await` sequencial; não há
  segunda conexão nem interleaving.
- 409 — nunca afirmado. O harness só espera 200/201/401/403/404.
- Rollback — o único `rollback` (`run.mjs:707`) é a sonda de RLS do próprio
  harness, não rollback de aplicação.
- Deadlock — não exercitado. A lógica de retry existe em
  `workers/project-service/src/app.ts:268` e
  `workers/commercial-service/src/commercialService.ts:65`, e nenhuma é tocada.
- P2028 — não aparece no harness. Única ocorrência no repo inteiro:
  `services/task-service/src/services/projectPlanService.ts:23`.

O harness nunca chama `POST /parcelamento/installments/:id/competencies`, que é
justamente a rota onde o lock e a transação vivem.

O único artefato que alega provar a correção do lost-update é
`workers/parcelamento-service/src/recalc.race.test.ts`, e ele é **100% stub**:
`interleavingPrisma()` (`:38`) é um duplo de Prisma escrito à mão, e a asserção
final (`:226`) é `expect(isolationLevels).toEqual([{isolationLevel:"ReadCommitted"}, …])`
— confere o argumento passado ao mock, não o comportamento do PostgreSQL.

**Portanto: não se pode declarar transação real validada.** A lacuna é pequena
e mecânica — dois `POST .../competencies` em paralelo dentro de
`crud.parcelamento_installments` (`run.mjs:606`), contra o container que já está
de pé, converteriam o teste mockado em evidência real. `db`, `sql`, `baseUrls` e
`tokenA` já estão em escopo ali.

### Cobertura parcial

`local-env.mjs:13-25` lista **7 Workers**: audit, user, contabil, fiscal,
triagem, parcelamento, gateway. Ficam de fora 11: certificate, client,
commercial, department, organization, pessoal, project, regularize, reports,
rh, ti.

Além disso, `scripts/cloudflare-smoke` **não está ligado ao `package.json`**.
`pnpm smoke` roda `scripts/all-services-smoke.mjs`, outro harness. Só se executa
à mão.

## 5. Gates

Com `runtime = "workerd"` nos 17 schemas, em `cf/prisma-workerd-runtime`:

- 18 Workers × (test, typecheck, build, check) = **72/72**
- **17/17** `prisma validate`
- **18/18** `wrangler deploy --dry-run` (`workers/runtime` não entra: é lib, não tem `wrangler.jsonc`)
- `git diff --check` limpo

Nota de método: uma rodada anterior usou `@workspace/<x>-service-worker` como
filtro do pnpm. O nome real é `@workspace/<x>-worker`, e `pnpm --filter` sem
correspondência **sai com código 0** — aqueles "OK" eram no-ops. O script passou
a abortar em `"No projects matched"`.

## 6. Triagem reconcile — nada a integrar

Não existe job de reconcile em lugar nenhum hoje, nem no Node nem no Worker.
Só uma rota HTTP manual, em ambos:
`services/triagem-service/src/routes/triageAudit.routes.ts:75` e
`workers/triagem-service/src/app.ts:351`. `services/triagem-service/src/server.ts`
só faz `app.listen`.

`workers/triagem-service/wrangler.jsonc` não tem `triggers` nem `queues`;
`src/index.ts` exporta só `fetch`. Precedente no repo:
`workers/commercial-service/wrangler.jsonc` tem `"triggers": { "crons": ["*/1 * * * *"] }`.

A branch `cf/triagem-reconcile` **não traz implementação**: 2 commits, 2
arquivos, +299/−0 — um documento de proposta e
`workers/triagem-service/src/reconcile-trigger.test.ts` com **15 `it.todo` e 0
`expect(`**.

A proposta recomenda Cron Trigger `*/5` e deixa 6 perguntas abertas, entre elas
se o papel do Hyperdrive tem `BYPASSRLS` (necessário para enumerar
organizações) e se a conta é Workers Paid. Semântica já embutida: entrega
**at-least-once**, dedup a jusante por `requestId = event_key`, e falha parcial
só é logada (`triageAuditService.ts:261`) — sem teto de tentativas, sem
dead-letter, sem backoff.

Nada foi implementado, conforme instrução.

## 7. Decisão de escopo: o banco fica no Supabase

Definido pelo usuário: migram-se **serviços e UI**; o banco **permanece no
Supabase**. Isso reclassifica dois itens acima.

- **§3 deixa de ser bloqueio de release.** As 2 migrations não replayáveis só
  mordem ao criar banco do zero. Com o Supabase preservado, as 175 já estão
  aplicadas. Continua valendo para ambiente novo (staging, CI, onboarding) —
  vira dívida, não impedimento.
- **`extensions.crypt` deixa de ser risco.** É convenção Supabase e o Supabase
  provê. Era exatamente por isso que o smoke passava: a imagem padrão do harness
  é `public.ecr.aws/supabase/postgres:17.6.1.167` (`run.mjs:183`), o mesmo sabor
  do banco real.
- **§2 muda de natureza, não some.** Hyperdrive não move banco — é pooler na
  frente dele. Importa porque cada isolate de Worker abre conexão própria e o
  Postgres do Supabase tem limite de conexões. Segue exigindo credencial real.

## 8. Transação real — bloqueio fechado

`scripts/cloudflare-smoke/run.mjs` ganhou o check
`transacao.parcelamento_lock_concorrente` (commit `8ba8131e`): 6 `POST
competencies` disparados com `Promise.all` no mesmo parcelamento, depois `GET`
conferindo se o agregado recalculado somou as 6; em seguida a mesma competência
duas vezes em paralelo, exigindo exatamente um 201 e um 409, com o total
inalterado além do vencedor.

Evidência executada contra PostgreSQL real, sem mock:

| | `paid_installments_count` após 6 escritas concorrentes |
|---|---|
| com `FOR NO KEY UPDATE` | **6** |
| sem o lock (removido de propósito e restaurado) | **1** — 5 escritas perdidas |

Sem o lock o check falha com
`lost update: paid_installments_count=1, esperado 6`. Ou seja, ele detecta a
regressão que justifica sua existência — não é verde decorativo.

Cobre: concorrência real, `SELECT ... FOR NO KEY UPDATE`, transação real
(`$transaction` com `ReadCommitted`), 409 e rollback do perdedor.

**Continuam sem evidência**: deadlock e `P2028`. Ambos exigem forçar condições
não determinísticas; não foram simulados e não se declara o contrário.

## 9. Bloqueio #1 fechado — clients compartilhados em workerd

Decisão do usuário: **os services Node são aposentados** quando os Workers
assumirem. Logo um runtime por generator basta, sem diretório duplicado.

Aplicado em `5514a4d2`: `runtime = "workerd"` nos 18 generators de
`infra/prisma/schema.prisma`, uma linha cada.

O bloqueio deixou de ser suposição e virou reprodução. Rodando o smoke com o
contorno do harness desligado (`generateServicePrismaClients` inerte):

**Antes** — o runtime aborta antes de servir qualquer requisição:

```
service core:user:giro-triagem-service: Uncaught TypeError: The "path" argument
  must be of type string or an instance of URL. Received undefined
    at node-internal:internal_url:155:15 in fileURLToPath
    at index.js:42105:36
The Workers runtime failed to start.
```

`import.meta.url` é `undefined` dentro do bundle workerd, então o shim
`fileURLToPath(import.meta.url)` do client Node estoura na carga do módulo.

**Depois** — `ok 7 Workers no ar` e os 19 checks funcionais verdes, sem
contorno nenhum.

Efeito colateral necessário: o harness injetava `runtime = "workerd"` nos
schemas dos Workers, que desde `2724caa6` já o declaram. A injeção passou a
duplicar a chave e falhar com `P1012`; foi removida no mesmo commit.

Custo medido da aposentadoria dos services Node: `@workspace/fiscal-service`
mantém **82/82 testes** passando com o client wasm. Os testes dos services não
dependiam do runtime Node.

Gates após a mudança: 72/72, 17/17 `prisma validate`, 18/18 `wrangler dry-run`,
`git diff --check` limpo.

## 10. Situação

A migração **não está finalizada**. Bloqueios reais abertos:

| # | bloqueio | tipo | estado |
|---|---|---|---|
| 1 | Generators de `infra/prisma/schema.prisma` em runtime nodejs | arquitetura | **fechado** (§9) |
| 2 | Nenhum binding Hyperdrive apontando para o Supabase | infra | **aberto** |
| 3 | 2 migrations não replayáveis do zero | dívida | rebaixado (§7) |
| 4 | Transação/concorrência sem evidência real | teste | **fechado** (§8) |
| 5 | Credenciais chegando aos 17 upstreams | produto | **aberto** (`gateway-session-forwarding.md`) |
| 6 | Triagem reconcile sem mecanismo | produto | **aberto** |

Resta **#2 como único bloqueio de deploy**, e ele depende de credencial real:
provisionar o Hyperdrive apontando para o Supabase. #5 e #6 são decisões de
produto que não impedem subir.
