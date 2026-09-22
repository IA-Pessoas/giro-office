# Relatório final — consolidação e deploy da migração Cloudflare

Branch candidata `cf/integracao-consolidada` em `409d079b`: **16 commits** sobre
`e5eacddc`, 48 arquivos, +1240/−87.

## 1. Commits

| commit | o quê |
|---|---|
| `d44b06a7` | gateway: negação por padrão, fluxo público de sessão, normalização de path |
| `2724caa6` | `runtime = "workerd"` nos 17 schemas dos Workers |
| `1b90ac1e` | relatório do encaminhamento de credenciais ao upstream |
| `bd5e1390` | relatório de bloqueios com evidência executada |
| `8ba8131e` | smoke: prova do lock de linha do parcelamento contra banco real |
| `d55c2223` | fecha o bloqueio de transação e reescopa o banco |
| `5514a4d2` | `runtime = "workerd"` nos 18 generators canônicos |
| `87d9c54b` | fecha o bloqueio do client Prisma compartilhado |
| `d23de08b` `628e7233` | merges para a branch candidata |
| `bb3adb40` | runbook de deploy |
| `f172f1c3` | configs dizem por que não havia binding de banco |
| `d3d95e01` | para de versionar o cache local do wrangler |
| `fcf4d4c3` | binding do Hyperdrive nos 17 Workers de banco |
| `9a8ad79d` | registra o binding e a questão do cache |
| `409d079b` | remove o binding para o task-service não migrado |

`d44b06a7` foi integrado por **fast-forward puro** (`git merge-base --is-ancestor`
confirma), sem cherry-pick e sem recriar.

## 2. Gates

Última execução sobre `409d079b`: **108 OK, 0 falhas, `EXIT=0`**.

- 18 Workers × (test, typecheck, build, check) = 72
- 17/17 `prisma validate`
- 18/18 `wrangler deploy --dry-run`
- `git diff --check` limpo

Nota de método: uma rodada inicial filtrou por `@workspace/<x>-service-worker`.
O nome real é `@workspace/<x>-worker`, e `pnpm --filter` sem correspondência
**sai com código 0** — aqueles "OK" eram no-ops. O script passou a abortar em
`"No projects matched"`.

## 3. Bloqueios fechados, com a prova de cada um

### Runtime Prisma

O gerador `prisma-client` default é `nodejs` (extraído do binário:
`a = n.runtime !== void 0 ? I3e(n.runtime) : "nodejs"`). Os 17 schemas dos
Workers e os 18 generators de `infra/prisma/schema.prisma` emitiam client Node.

Consequência provada, não suposta: rodando o smoke com o contorno do harness
desligado, o runtime aborta antes de servir qualquer requisição —

```
Uncaught TypeError: The "path" argument must be of type string or an instance
of URL. Received undefined — at fileURLToPath
The Workers runtime failed to start.
```

Depois da correção: `ok 7 Workers no ar` e 19 checks funcionais verdes.
Ganho medido no audit-service: upload 5584→4405 KiB, gzip 1869→1361 KiB.

### Banco

Hyperdrive `giro-postgres-prod` (`da08299aa9604daaa985fc2ba12fce04`) fronteia o
Supabase existente e está ligado nos 17. O `user-service` recusa fallback por
`DATABASE_URL` de propósito (`app.ts:100` devolve 503).

Pendente de decisão: o cache de query subiu habilitado. O isolamento
multi-tenant depende de estado de sessão (`SET LOCAL ROLE` +
`set_config('app.organization_id', …)`) que o Hyperdrive não enxerga. O risco é
baixo — essas queries rodam em transação, e o Hyperdrive não cacheia lá dentro —
mas desligar custa um comando.

### Migrations

`CREATE INDEX CONCURRENTLY` **não** é bloqueio: as 175 migrations aplicaram com
`prisma migrate deploy` real. `extensions.crypt` é precondição Supabase, falha
alto e claro.

O bloqueio real é outro: **2 migrations não são replayáveis do zero**
(`20260821200000` recria objetos de `20260713100000`; `20260916170000` usa um
schema `rh` inexistente e é marcada como aplicada sem rodar). Como o banco
permanece no Supabase, isso vira dívida para ambiente novo, não impedimento.

### Transação e concorrência

O único artefato que alegava provar a correção do lost-update
(`recalc.race.test.ts`) é **100% stub** — assere o argumento passado a um Prisma
falso. Foi adicionado um check real no smoke: 6 `POST competencies`
concorrentes no mesmo parcelamento, mais a mesma competência duas vezes em
paralelo.

| | `paid_installments_count` após 6 escritas |
|---|---|
| com `FOR NO KEY UPDATE` | **6** |
| sem o lock (removido de propósito) | **1** — 5 perdidas |

Cobre concorrência real, o lock, transação real, 409 e rollback do perdedor.
**Deadlock e `P2028` seguem sem evidência** e não se declara o contrário.

## 4. Deploy

**18/18 Workers no ar.** 17 backends com `workers_dev: false`, alcançáveis só
por Service Binding; gateway em `https://giro-gateway.eed-jrr.workers.dev`.

### Fiação de tokens — um erro encontrado e corrigido

O double check pedido encontrou um erro real de configuração:

- `audit-service` valida o header contra o **próprio** `INTERNAL_SERVICE_TOKEN`
  (`auth.ts:78`, `app.ts:76`)
- os chamadores enviam `x-internal-service-token: env.AUDIT_SERVICE_TOKEN`
  (`user-service/src/audit.ts:53`)
- o gateway **recusa auditar** se os dois forem iguais (`gateway/src/app.ts:129`)

O `INTERNAL_SERVICE_TOKEN` do audit precisa receber o **token de auditoria**
(confirmado em `local-env.mjs:311`). Estava com o token comum: toda auditoria
seria rejeitada em silêncio. Corrigido, junto com `USER_SERVICE_INTERNAL_TOKEN`,
`TRIAGEM_INTERNAL_TOKEN` e `CLIENT_SERVICE_INTERNAL_TOKEN`, que haviam sido
omitidos.

São 5 valores distintos: `jwtSecret`, `internalToken`, `auditToken`,
`reportsToken`, `grantSecret`.

## 5. Divergências e dívidas registradas

| # | item | onde |
|---|---|---|
| 1 | `authorization`, `cookie` e `x-csrf-token` ainda chegam aos 17 | `gateway-session-forwarding.md` |
| 2 | token interno único para todos os serviços | idem |
| 3 | 2 migrations não replayáveis do zero | §3 |
| 4 | cache do Hyperdrive habilitado | §3 |
| 5 | triagem reconcile sem mecanismo (não existe job em Node nem Worker) | `migration-blockers.md` §6 |
| 6 | cron do outbox comercial parado | §6 abaixo |

## 6. Bloqueios abertos

### Cloudflare Access

`*.workers.dev` desta conta está atrás do Access. Toda requisição ao gateway
recebe 302 para `snowy-tooth-2170.cloudflareaccess.com` antes de tocar o Worker.
Consequências: a validação HTTP ponta a ponta do stack deployado não é possível,
e o frontend também será barrado no cutover.

### task-service não migrado

`giro-task-service` não existe. O binding foi removido do `commercial` para
destravar o deploy dele e do gateway; a dívida está comentada no
`wrangler.jsonc`. A API HTTP do commercial funciona; **o cron do outbox para**,
porque `assertScheduledDependencies` (`index.ts:25`) lança sem `TASK_SERVICE`.

Levantamento, corrigindo um número que este relatório havia errado antes:

| medida | valor |
|---|---|
| tamanho reportado inicialmente | 416.122 linhas |
| **tamanho real** (sem `generated/prisma`) | **11.964 linhas, 74 arquivos** |
| comparação | ~2× o maior já migrado (`user`, 5.643) |
| rotas | 55 |
| `node:child_process`, `node:fs`, `node:stream` | só em testes |
| `node:zlib` (`utils/pdf.ts`, `utils/docx.ts`) | produção, **suportado** pelo workerd |

Estava no escopo: o plano o coloca no **Lote B**, com `client`, `project` e
`commercial` — os três migrados. Não há `task-service-remainder.md`, ou seja,
ninguém chegou a trabalhar nele. É o mais complexo do lote (multipart, Storage,
IA, Queues), mas não há incompatibilidade de runtime.

## 7. Validação

**Smoke local: 20 de 21 verdes**, contra Postgres real em container descartável,
com o código idêntico ao deployado. Cobre RLS com `SET LOCAL ROLE` sem bypass,
isolamento multi-tenant, auth sem token e via gateway, cookie+CSRF em mutação,
CRUD em quatro serviços, grant HMAC com 403 em assinatura adulterada, auditoria
de request e de entity change, outbox de triagem e a corrida de transação.

A única falha é `cleanup.dados_de_teste`, defeito da limpeza do próprio harness
numa tabela append-only.

**Stack deployado: não validado por HTTP**, pelo Access (§6).

Limitação do harness: `SMOKE_MODE=external` exige uma URL pública por Worker, e
por desenho os 17 backends não têm. Validação do stack real só pelo gateway.

## 8. Integridade do repositório

- `main` em `d834772a` e `cloudflare-migration` em `a8c37475` — **intocadas**
- **nenhum** reset, rebase, amend, force-push ou push
- 36 worktrees, nenhuma removida, sincronizada ou alterada
- `app/next-env.d.ts` sem nenhum commit
- working tree limpo; `git diff --check` limpo
- gates de supply-chain verdes em todos os commits

## 9. Conclusão

A migração **não está finalizada**. O stack está deployado e o código validado
localmente, mas dois bloqueios permanecem: o Access impede provar por HTTP que o
que subiu funciona, e o `task-service` continua fora, com o cron do outbox
comercial parado como consequência declarada.
