# Runbook de deploy — o que falta e como executar

Estado da branch candidata `cf/integracao-consolidada` em `fcf4d4c3`:
108 gates OK, 0 falhas; smoke real verde, incluindo transação concorrente
provada contra Postgres. O Hyperdrive já está ligado; o que ainda impede o
deploy são os secrets, mais uma decisão de topologia da UI.

Verificado na conta Cloudflare autenticada (só leitura, nenhum deploy):

| checagem | resultado |
|---|---|
| `wrangler whoami` | autenticado, permissões de escrita |
| `wrangler hyperdrive list` | **resolvido** — ver §2 |
| `wrangler deployments list --name giro-gateway` | Worker não existe |
| `wrangler pages project list` | 4 projetos, nenhum desta UI |

## 1. Topologia já está correta

Não há nada a mudar aqui, e convém não mudar.

- Os **17 Workers de backend** têm `workers_dev: false`. Continuam privados,
  alcançáveis só por Service Binding.
- O **gateway** omite a flag, então recebe a URL `*.workers.dev`, e declara os
  17 bindings (`workers/gateway/wrangler.jsonc`).

Deployar a config atual expõe **apenas o gateway**. Virar `workers_dev` para
`true` nos backends contornaria autenticação, CSRF e a negação por padrão do
gateway (`d44b06a7`) — não fazer.

## 2. Hyperdrive — RESOLVIDO

Provisionado pelo usuário e ligado em `fcf4d4c3`.

```
id:     da08299aa9604daaa985fc2ba12fce04
name:   giro-postgres-prod
origin: db.lfhrkztuqnokijdekjsc.supabase.co:5432/postgres
limite: 60 conexões na origem
mtls:   sslmode=require
```

Binding declarado nos 17 Workers que acessam banco:

```jsonc
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "da08299aa9604daaa985fc2ba12fce04" }]
```

Os marcadores `// BLOCKED` foram removidos, por terem se tornado falsos. O teste
do `user-service` que exigia a string `BLOCKED` passou a exigir o que importa:
binding declarado e nenhum fallback de `DATABASE_URL`
(`workers/user-service/src/index.test.ts`). Verificado removendo o binding —
o teste falha.

Por que importa: cada isolate de Worker abre a própria conexão e a origem
aceita 60. O Hyperdrive faz pool na borda. Ele **não move nem copia o banco**;
o dado continua no Supabase.

### Pendente: cache de query

A config subiu com `"caching": { "disabled": false }`.

O isolamento multi-tenant deste sistema depende de **estado de sessão** —
`SET LOCAL ROLE "giro_user_runtime"` mais
`set_config('app.organization_id', …)` — com RLS em 9 tabelas
(`workers/contabil-service/src/services.ts:941-942`). O Hyperdrive não enxerga
`SET LOCAL`, então em tese uma mesma query com os mesmos parâmetros poderia
servir linhas de outra organização.

Atenuante honesto: essas queries rodam dentro de `$transaction`, e o Hyperdrive
não cacheia dentro de transação; as que rodam fora levam `organization_id` nos
parâmetros, o que já diferencia a chave de cache. O risco é baixo, não nulo.

Recomendação: desligar, porque custa um comando e elimina a classe de dúvida.

```
pnpm exec wrangler hyperdrive update da08299aa9604daaa985fc2ba12fce04 --caching-disabled
```

## 3. Secrets — 8 valores, nenhum inventável

Exigidos pelos `src/env.ts` dos Workers:

| secret | origem |
|---|---|
| `JWT_SECRET` | gerar aleatório; **o mesmo** no gateway e em todos os serviços |
| `INTERNAL_SERVICE_TOKEN` | gerar aleatório; o mesmo no gateway e nos serviços |
| `AUDIT_SERVICE_TOKEN` | gerar aleatório; distinto do interno |
| `REPORTS_INTERNAL_TOKEN` | gerar aleatório |
| `REPORTS_GRANT_SECRET` | gerar aleatório |
| `ADMIN_PASSWORD` | definido pelo usuário |
| `SUPABASE_URL` | **só o usuário tem** |
| `SUPABASE_SERVICE_ROLE_KEY` | **só o usuário tem** |

`JWT_SECRET` divergente entre gateway e serviço faz **toda** requisição
autenticada falhar, porque o gateway assina e o serviço verifica. Um valor
fraco vira porta de entrada. Por isso nenhum é gerado sem autorização e nenhum
vai para arquivo versionado.

Geração e envio (repetir por Worker; `staging-readiness.md` tem o inventário):

```
openssl rand -hex 32
pnpm exec wrangler secret put JWT_SECRET --name giro-gateway
```

## 4. UI — `.pages.dev` quebra o login

Achado com evidência, não preferência.

O gateway emite `cw.session` e `cw.csrf` com `SameSite=Lax`, `HttpOnly` e
**sem `Domain=`** (host-only) — `workers/runtime/src/session.ts:108,128-129` e
`shared/src/http/session-security.ts:78-84`.

Hoje funciona porque frontend e API são a **mesma origem**: o rewrite de
`/api/*` em `app/next.config.mjs:51-58` aponta para o gateway, e o browser
nunca vê duas origens.

`app.pages.dev` + `giro-gateway.workers.dev` é **cross-site** — `pages.dev` e
`workers.dev` são entradas distintas na Public Suffix List. Quebra em quatro
pontos ao mesmo tempo:

1. cookie host-only do gateway nunca chega à origem do frontend;
2. `SameSite=Lax` bloqueia em XHR cross-site;
3. `cw.session` é `HttpOnly`, então `canSSRAuth`
   (`app/src/modules/auth/utils/canSSRAuth.ts:8`) nunca o lê de outra origem;
4. o CSP do app é `connect-src 'self'` (`app/next.config.mjs:19`).

Fazer `.pages.dev` funcionar exigiria `SameSite=None; Domain=…` em dois módulos
compartilhados e afrouxar o CSP — **perdendo a proteção CSRF que o `Lax` dá**.

**Recomendado:** um Worker servindo os assets estáticos e com Service Binding
`/api/*` para o `giro-gateway`. Uma origem só, igual ao rewrite de hoje.
Preserva cookies, CSP e CSRF sem tocar em nenhum deles.

### O app também não está pronto

| fato | evidência |
|---|---|
| `output: "standalone"` (servidor Node, não estático) | `app/next.config.mjs:38` |
| 43 das 46 páginas usam `getServerSideProps` | contagem em `app/src/pages` |
| nenhum adapter Cloudflare instalado | `app/package.json` |
| `next/image` sem `images.unoptimized` | 2 componentes batem em `/_next/image` |
| Next 16.3.3, Pages Router | `app/package.json` |

`docs/cloudflare/pages-compatibility.md` já registrava que export estático puro
não é compatível.

Precisa de `@opennextjs/cloudflare` e mudanças de código. É frente própria, não
um `wrangler pages deploy`. Atenção: `pnpm install` neste workspace falha hoje
com `ERR_PNPM_EXOTIC_SUBDEP` (postcss em `app/`), então adicionar a dependência
não é trivial e precisa ser resolvido antes.

Não atrapalham: zero API routes, zero middleware, zero Server Actions, nenhum
builtin do Node no código empacotado, socket.io desligado
(`app/src/context/socketConfig.ts:13-18`).

## 5. Ordem de execução

1. ~~Provisionar Hyperdrive e adicionar o binding~~ — feito em `fcf4d4c3` (§2).
2. Gerar e subir os 8 secrets (§3). **Único impedimento restante.**
3. `pnpm exec wrangler deploy` nos 17 backends, depois no gateway — os
   bindings exigem que os serviços existam primeiro.
4. Conferir: `/health` e `/ready` no gateway; um GET autenticado ponta a ponta.
5. UI como frente separada, na topologia do §4.

## 6. Pendente de decisão

| # | item | quem decide |
|---|---|---|
| 1 | ~~ID do Hyperdrive~~ | **resolvido** |
| 2 | 8 secrets | usuário (credencial) |
| 2b | desligar o cache do Hyperdrive | usuário (§2) |
| 3 | Worker-com-assets vs Pages para a UI | usuário (topologia) |
| 4 | Credenciais aos 17 upstreams | produto (`gateway-session-forwarding.md`) |
| 5 | Mecanismo do triagem reconcile | produto |

Os itens 4 e 5 não impedem subir. Restam o 2 e a decisão do 2b.
