# Gateway Worker: encaminhamento de credenciais ao upstream

Relatório técnico para uma branch própria. **Nada aqui foi implementado.**

O commit `d44b06a7` (negação por padrão, rotas públicas de sessão, limpeza de
identidade, normalização de path) deliberadamente **não** removeu `authorization`,
`cookie` e `x-csrf-token` antes de encaminhar aos 17 serviços. Este documento
registra por quê, qual é o mecanismo do Node e o que precisa ser decidido.

## 1. O que o Node faz

Arquivo: `services/gateway/src/proxy/httpProxy.ts`.

### 1.1 `strippedClientHeaders` (`:326-342`)

15 headers são removidos do que o cliente mandou, antes de montar o upstream:

```
x-internal-service-token
x-auth-user-id, x-auth-organization-id, x-auth-permission, x-auth-type,
x-auth-modules, x-auth-session-version, x-auth-session-id,
x-auth-csrf-hash, x-auth-kind, x-auth-platform-role
authorization
cookie
x-auth-session-transport
x-csrf-token
```

**O Worker hoje remove os 10 `x-auth-*` mais `x-auth-session-transport` e
sobrescreve `x-internal-service-token`** (`workers/gateway/src/auth.ts:91-105`,
via `clearForwardedIdentity`/`forwardIdentity`). Faltam os três últimos de fato
sensíveis: `authorization`, `cookie` e `x-csrf-token`.

### 1.2 `cookie` não é removido de forma cega

Ponto central, e o motivo de o diagnóstico inicial ("remover quebraria tudo")
estar incompleto. O Node remove `cookie` e depois **reinjeta uma versão
filtrada** (`:361-364`):

```ts
const forwardedCookie = getForwardedCookie(request, options, normalizedPath, sessionCookieRule);
if (forwardedCookie) headers.set("cookie", forwardedCookie);
```

O caminho padrão (`:490`) é `stripBrowserAuth(cookieHeader)`, definido em
`shared/src/http/session-security.ts:61`: remove **apenas** `cw.session` e
`cw.csrf`, preserva todo o resto do cookie, e devolve `undefined` se o header
passar de `MAX_COOKIE_HEADER_BYTES`.

`stripBrowserAuth` vive em `@workspace/shared`, pacote que o Worker gateway **já
importa**. É função pura. Não há nada a portar.

### 1.3 `SESSION_COOKIE_RULES` (`:85-233`)

24 regras `{ method, path, inbound[], outbound[] }` sobre os dois cookies
(`cw.session`, `cw.csrf`). `inbound` diz o que pode subir ao serviço; `outbound`,
o que o serviço pode devolver ao browser. Exemplos:

| método | path | inbound | outbound |
|---|---|---|---|
| POST | `/user` | `cw.csrf` | — |
| PUT | `/user/:id` | `cw.csrf` | — |
| POST | `/user/session` | — | `cw.session`, `cw.csrf` |
| POST | `/user/session/refresh` | — | `cw.session`, `cw.csrf` |

Quando a regra pede `cw.csrf` no `inbound`, o Node **exige** o header
`x-csrf-token` e o repassa (`:366-372`), com 403 `"Token CSRF obrigatório para
mutação User."` se faltar. Ou seja: `x-csrf-token` não é removido sempre — é
removido por padrão e reposto nas mutações de User.

### 1.4 As três flags por serviço

Declaradas em `services/gateway/src/config/serviceRegistry.ts:48-50` e ligadas em
`app.ts:449-451`. **Só 3 dos 17 serviços as usam:**

| serviço | flag | linha | efeito |
|---|---|---|---|
| `organization-service` | `forwardPlatformSessionCredentials` | `serviceRegistry.ts:63` | em path `/platform/*`, reconstrói `cookie` a partir de `auth.token` em vez do cookie do cliente (`httpProxy.ts:479-508`) |
| `rh-service` | `forwardValidatedAuthorization` | `serviceRegistry.ts:79` | reinjeta `authorization: Bearer <auth.token>` — só para ator `organization` (`httpProxy.ts:383-385`) |
| `user-service` | `forwardSessionBinding` + `forwardPlatformSessionCredentials` | `serviceRegistry.ts:87-88` | adiciona `x-auth-session-id` e `x-auth-csrf-hash` (`httpProxy.ts:429-437`) |

Os outros 14 serviços **não recebem `authorization` nenhum** e recebem só o
cookie já filtrado por `stripBrowserAuth`.

Também por serviço: `internalServiceToken` (`httpProxy.ts:439-440`) — o Node manda
um token **distinto por serviço** (`env.auditServiceToken` para organization,
`env.userServiceInternalToken` para user), enquanto o Worker manda um
`INTERNAL_SERVICE_TOKEN` global para os 17.

## 2. Por que não foi implementado

Remover os três headers no Worker, isolado, quebra serviços — porque alguns
**Workers** divergiram do desenho do Node.

### 2.1 `reports-service` — divergência arquitetural, não do gateway

| | consumo de identidade |
|---|---|
| Node (`services/reports-service/`) | lê `FORWARDED_AUTH_USER_ID_HEADER` |
| Worker (`workers/reports-service/src/app.ts:141-146`) | `authenticateWorkerRequest(c.req.raw, { jwtSecret, allowBearer: true })` |

`grep -rn 'x-auth-user-id' workers/reports-service/src/` retorna **vazio**. O
Worker reautentica o JWT do cliente por conta própria. Tirar `authorization` e
`cookie` ⇒ **401 em todas as rotas de reports**. Quem precisa mudar é o Worker,
não o gateway.

### 2.2 `organization-service`

`workers/organization-service/src/auth.ts:123-125` usa `allowBearer: false`: só
aceita o cookie `cw.session`. `requirePlatformCsrf` exige `cw.csrf` + `cw.session`.
É o serviço coberto por `forwardPlatformSessionCredentials`, que o Worker não tem.

### 2.3 `user-service`

Depende de `x-auth-session-id` + `x-auth-csrf-hash` + `x-auth-session-version`,
que no Node só existem sob `forwardSessionBinding`. O Worker já manda os três
sempre (`workers/gateway/src/auth.ts:116-127`) — mais permissivo que o Node, mas
funcional. O risco aqui é o contrário: manda para os 17.

### 2.4 `fiscal` / `project` / `ti`

Derivam `auth.token` do cookie e caem no literal `"forwarded-by-gateway"` sem ele.
Não retornam 401, mas perdem a validação de sessão — falha silenciosa, pior que
erro visível.

## 3. O que dá para fazer sem decisão de produto

Ordenado por risco crescente.

1. **`x-csrf-token` fora das mutações de User.** Nenhum serviço além de user
   consome o header. Baixo risco, cobre o vetor de replay de CSRF.
2. **`cookie` → `stripBrowserAuth(cookie)` nos 14 serviços sem flag.** Usa a
   função que já está em `@workspace/shared`. Remove `cw.session`/`cw.csrf` e
   preserva o resto. Precisa antes resolver §2.1 e §2.4.
3. **`authorization` removido nos 16 serviços sem `forwardValidatedAuthorization`.**
   Bloqueado por §2.1 até o reports-service ganhar caminho de identidade
   encaminhada.

## 4. Decisões que dependem do usuário

1. **`reports-service`**: dar ao Worker um caminho de identidade encaminhada
   (paridade com o Node), ou manter a reautenticação e aceitar que `authorization`
   chegue nele?
2. **Token interno por serviço**: replicar o `internalServiceToken` por serviço do
   Node, ou manter o global? Hoje qualquer um dos 17 pode se passar pelo gateway
   perante os outros 16.
3. **`SESSION_COOKIE_RULES` no Worker**: portar as 24 regras, ou aplicar só
   `stripBrowserAuth` e tratar user/organization como exceção explícita?
4. **`forwardPlatformSessionCredentials`**: as rotas `/platform/*` ainda não
   existem no Worker gateway. Portar a flag antes ou junto com essas rotas?

## 5. Divergências correlatas encontradas na leitura

Não são o tema desta branch, mas saíram da mesma comparação e valem registro.

| # | Node | Worker |
|---|---|---|
| 1 | `x-auth-modules` só quando `modulePermissionsPresent === true` (`httpProxy.ts:416-418`) | sempre (`auth.ts:109`) |
| 2 | `x-auth-organization-id`, `x-auth-permission`, `x-auth-type` só para ator não-platform (`httpProxy.ts:392-420`) | sempre |
| 3 | `x-auth-platform-role` = `"super_admin"` só se `isPlatformAdmin` (`httpProxy.ts:388-390`) | repassa a claim crua (`auth.ts:112-114`) |
| 4 | `x-auth-session-id`/`x-auth-csrf-hash` só sob `forwardSessionBinding` | sempre, aos 17 |
| 5 | `internalServiceToken` por serviço | token global único |

Os itens 1-4 fazem o Worker mandar **mais** informação de identidade do que o Node
para serviços que não deveriam recebê-la. Nenhum é escalada de privilégio por si
só — o serviço ainda precisa confiar no header — mas ampliam a superfície.
