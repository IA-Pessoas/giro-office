# user-service

Microserviço de utilizadores, sessão e permissões. Integra com o **gateway** antes do fallback para o legado.

## Porta local

Por defeito: **3030** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, logging e `AUTH_COOKIE_SECURE`. A última variável é obrigatoriamente `true` em produção. `USER_SERVICE_INTERNAL_TOKEN` autentica exclusivamente o gateway e deve ter o mesmo valor configurado nele. `PLATFORM_AUTH_RATE_LIMIT_MAX` e `PLATFORM_AUTH_RATE_LIMIT_WINDOW_MS` controlam a segunda barreira local do login (padrões: 10 tentativas por 60 segundos). `REPORTS_INTERNAL_TOKEN` protege `POST /internal/reporting/access-context`; deve ser igual ao valor do reports-service e é obrigatório em produção.

Para criar o único administrador da plataforma, informe explicitamente `PLATFORM_ADMIN_NAME`, `PLATFORM_ADMIN_EMAIL` e `PLATFORM_ADMIN_PASSWORD` (mínimo de 16 caracteres e não comum) e execute `pnpm --filter @workspace/user-service bootstrap:platform-admin`. O comando normaliza o e-mail, não substitui uma conta existente e imprime apenas `id`, `email` e `created`.

O endpoint `/internal/reporting/access-context` é chamado diretamente pelo reports-service e não é publicado pelo gateway.

## Sessão do navegador

- `POST /user/session` emite `cw.session` (`HttpOnly`, `SameSite=Lax`, um dia) e `cw.csrf`, sem retornar o JWT no JSON.
- `POST /user/session/refresh` rotaciona os dois cookies mantendo a versão ativa da sessão.
- `DELETE /user/session` revoga a sessão atual no servidor e expira os dois cookies.
- Mutações autenticadas por cookie exigem `x-csrf-token`; o gateway valida a prova antes de encaminhar a chamada.
- Validações internas diretas podem usar Bearer, enquanto chamadas vindas do gateway usam os headers `x-auth-*` protegidos pelo token interno.

## Sessão da plataforma

- `POST /platform/session` autentica o administrador da plataforma e emite `cw.session` como cookie `HttpOnly`; o contrato direto exige `USER_SERVICE_INTERNAL_TOKEN` e aplica rate limit local, portanto o navegador deve chamá-lo pelo gateway. `cw.csrf` não autentica a requisição, servindo somente como prova CSRF para refresh e logout.
- `POST /platform/session/refresh`, `DELETE /platform/session` e `GET /platform/me` usam a sessão de plataforma. Nenhum endpoint retorna o JWT ou a prova CSRF no JSON.
- `POST /platform/session/validate` é interno: exige `USER_SERVICE_INTERNAL_TOKEN` e não deve ser chamado pelo navegador.

## Gateway

O encaminhamento para `USER_SERVICE_URL` usa o prefixo público **`/user`** — ver [`gateway/src/config/serviceRegistry.ts`](../gateway/src/config/serviceRegistry.ts) (`USER_SERVICE_PREFIXES`).

O prefixo público `/platform` é exposto pelo gateway; os endpoints diretos do user-service permanecem internos.

Exemplos de caminhos expostos pelo **user-service** (via gateway): `/user/session`, `/user/session/refresh`, `/user/start-config`, `/user/me`, `/user`, `/user/:id`, `/user/:id/photo`, `/user/permission/:userId`.

- **`GET /user/:id/photo`:** `200` com envelope padrão e `data.url` (URL pública da foto no storage).

Configurar no `.env` da raiz ou do gateway: `USER_SERVICE_URL=http://localhost:3030`.

## Desenvolvimento

```bash
pnpm --filter @workspace/user-service dev
```

Requer Prisma gerado (o pacote sincroniza a partir do legado no `predev` / `prebuild`).
