# Plano de Recuperacao Super Admin com Sessoes HTTP-only

**Objetivo:** reconstruir o Super Admin sobre `develop` sem reintroduzir JWT acessivel ao navegador, scripts ofuscados ou dependencias antigas.

**Base:** `develop@2322dc15`. A referencia funcional e a feature sanitizada `b1e04752`; ela e apenas uma fonte semantica, nao uma base Git para merge.

## Restricoes globais

- `develop` e a fonte de verdade para lockfile, dependencias, configuracoes, cookies e hardenings.
- O navegador recebe somente `cw.session` HttpOnly e `cw.csrf`; respostas JSON nunca retornam JWT ou CSRF secreto.
- Nenhum codigo da referencia que leia `cw.token`, use `Authorization: Bearer`, `jwt-decode`, `nookies` de token ou `support_mode` como bypass global pode ser portado.
- Preservar `.husky/pre-commit`, `scripts/supply-chain-security.test.mjs` e `scripts/supply-chain-integrity.mjs` do `develop`.
- Toda rota mutavel de plataforma exige a protecao CSRF ja usada pelo gateway.

## Fase 1 - Contratos e persistencia de plataforma

1. Criar uma migration nova, posterior a `20260820230000_add_auth_sessions`, para `PlatformUser`, `PlatformAuthSession`, `SupportSession`, papeis, status e indices. Nao copiar a migration historica da referencia.
2. Usar Argon2 e `session_version`; manter sessoes de plataforma em tabela propria, sem reutilizar `auth_sessions` de usuarios organizacionais.
3. Criar o comando explicito de bootstrap de super admin, sem seed implicito.
4. Testar invalidacao por revogacao, expiracao, CSRF e `session_version`.

## Fase 2 - Sessao HTTP-only e gateway

1. Estender os tipos/claims compartilhados com `auth_kind=platform` e `platform_role=super_admin`.
2. Implementar `POST /platform/session`, `GET /platform/me`, refresh e logout. Login responde somente identidade; os cookies sao emitidos pelo servidor.
3. O middleware valida sessao de plataforma persistida e nunca aceita contexto de plataforma fornecido pelo cliente.
4. O gateway remove cabecalhos falsificados, encaminha apenas contexto derivado com token interno e preserva `Set-Cookie` somente nas rotas de sessao permitidas.
5. Testar 401/403/200, rate limit, CSRF, rotacao CAS e tentativa de forjar cabecalhos.

## Fase 3 - Operacoes de plataforma

1. Adicionar rotas de organizacoes e usuarios de plataforma protegidas por `platformOnly`.
2. Expor rotas pelo registry central do gateway e alinhar OpenAPI, audit e smoke.
3. Permitir busca global de auditoria apenas para o principal plataforma; usuarios organizacionais continuam confinados ao tenant.
4. Suporte auditado nao libera todos os modulos: manter allowlist explicita de rotas antes de qualquer impersonacao.

## Fase 4 - Frontend sem token legivel

1. Portar apenas a UI de `app/src/modules/superAdmin/**`, pagina e hooks necessarios.
2. Adaptar `AuthContext` para aceitar a identidade de plataforma servida pelo backend, mantendo `withCredentials` e o fluxo HTTP-only de `develop`.
3. O guard SSR consulta `/platform/me` com `setupAPIClient(ctx)`; nunca le ou decodifica `cw.session`.
4. `AppShell` mostra Super Admin somente a `platform_role=super_admin` e nao tenta carregar perfil/departamento organizacional.
5. Nao portar login/suporte JWT, `authCookie`, `authHeaders` ou `sessionToken` da referencia.

## Fase 5 - Gates e liberacao

1. Adicionar testes de contrato e regressao para backend, gateway e frontend; incluir afirmacoes de ausencia de `cw.token`, `Bearer`, `jwtDecode`, `setCookie` e `destroyCookie` no fluxo Super Admin.
2. Executar scanner de supply chain em toda mudanca de configuracao, hook, script e manifest.
3. Reativar ou criar CI de pull request com `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm smoke:coverage`, `prisma validate` e migration em Postgres efemero.
4. So apos os gates verdes, abrir PR contra `develop`.