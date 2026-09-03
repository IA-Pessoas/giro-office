# gateway

Gateway HTTP do workspace. Centraliza autenticacao, autorizacao, CORS, auditoria e proxy para os microservicos.

## Porta local

Por defeito: **3010** (`GATEWAY_PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL` e `DATABASE_POOL_MAX` (default `1`) para o dashboard agregado
- `JWT_SECRET`
- `GATEWAY_ALLOWED_ORIGINS`
- `GATEWAY_PUBLIC_URL` (opcional, usado no `servers[0].url` do OpenAPI agregado)
- `GATEWAY_JSON_BODY_LIMIT` (opcional, padrao `1mb`)
- `ENABLE_API_DOCS` (opcional; por padrão habilitado fora de produção e desabilitado em produção)
- `GATEWAY_AUTHORIZATION_MODE` (`enforce`, padrão seguro; `observe` somente para rollout temporário)
- `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN`
- `ORGANIZATION_SERVICE_URL`
- `RH_SERVICE_URL`
- `USER_SERVICE_URL`, `USER_SERVICE_INTERNAL_TOKEN` (token exclusivo do contexto gateway -> user-service; obrigatório em produção)
- `FEATURE_FLAGS_ENABLED`, `LAUNCHDARKLY_SDK_KEY` (segredo server-side) e `LAUNCHDARKLY_INIT_TIMEOUT_MS` — camada base de flags; consulte [`docs/feature-flags.md`](../../docs/feature-flags.md).
- `DEPARTMENT_SERVICE_URL`
- `TASK_SERVICE_URL`
- `PROJECT_SERVICE_URL`
- `CLIENT_SERVICE_URL`, `CLIENT_SERVICE_INTERNAL_TOKEN` (token compartilhado no contexto gateway -> client-service; em desenvolvimento, usa `AUDIT_SERVICE_TOKEN` quando omitido)
- `FISCAL_SERVICE_URL`
- `CONTABIL_SERVICE_URL`
- `REGULARIZE_SERVICE_URL`
- `TI_SERVICE_URL`, `TI_SERVICE_INTERNAL_TOKEN`
- `CERTIFICATE_SERVICE_URL`, `CERTIFICATE_SERVICE_INTERNAL_TOKEN`
- `PESSOAL_SERVICE_URL`
- `PARCELAMENTO_SERVICE_URL`
- `REPORTS_SERVICE_URL`
- `WEBSOCKET_UPSTREAM_URL`

## Upstreams

O gateway encaminha estes prefixos para os servicos configurados no env:

- `/organizations` -> `ORGANIZATION_SERVICE_URL`
- `/rh` -> `RH_SERVICE_URL`
- `/user` -> `USER_SERVICE_URL`
- `/department` -> `DEPARTMENT_SERVICE_URL`
- `/task` -> `TASK_SERVICE_URL`
- `/project` -> `PROJECT_SERVICE_URL`
- `/client` -> `CLIENT_SERVICE_URL`
- `/fiscal` -> `FISCAL_SERVICE_URL`
- `/contabil` -> `CONTABIL_SERVICE_URL`
- `/regularize` -> `REGULARIZE_SERVICE_URL`
- `/ti` -> `TI_SERVICE_URL`
- `/certificate` -> `CERTIFICATE_SERVICE_URL`
- `/pessoal` -> `PESSOAL_SERVICE_URL`
- `/parcelamento` -> `PARCELAMENTO_SERVICE_URL`
- `/reports` -> `REPORTS_SERVICE_URL`

As rotas administrativas globais sob `/platform` são resolvidas por método e caminho, sem um
upstream genérico:

- sessão, identidade e usuários de organização -> `USER_SERVICE_URL`;
- listagem, criação, detalhe e alterações de status/plano/logo de organizações ->
  `ORGANIZATION_SERVICE_URL`;
- `GET /platform/audit/requests` -> `AUDIT_SERVICE_URL` (quando a auditoria está habilitada).

O gateway remove todos os headers `x-auth-*` recebidos do cliente e reconstrói somente a
identidade verificada. O user-service aceita essa identidade apenas junto do
`USER_SERVICE_INTERNAL_TOKEN` injetado pelo gateway. Cookies da plataforma também são encaminhados
por allowlist de método, rota e nome: somente `cw.session` nas leituras, acrescido de `cw.csrf` nas
mutações autorizadas. Após autenticação, CSRF e autorização, criação, PATCH de status/plano/logo,
desativação de usuário e reativação exigem ACK 2xx do audit-service (emitido após persistência) antes
do upstream. Auditoria desabilitada,
sem capacidade, erro de rede/HTTP ou timeout de 5s retorna 503; desconexão durante a espera não
despacha a mutação. O registro `organization.mutation.attempt` tem UUID próprio e correlação pelo
SHA-256 do request ID original em `source_request_id_sha256`. Seu `outcome: success` descreve apenas
o registro da tentativa, com status HTTP nulo e `business_outcome: unknown`; não anuncia êxito do
negócio. O evento final e o evento de domínio pós-commit continuam best-effort. `Set-Cookie` de
upstream só é publicado nos endpoints de criação/rotação
de sessão.

### Parcelamento

- Public prefix: `/parcelamento`
- Upstream env: `PARCELAMENTO_SERVICE_URL`
- Default upstream: `http://localhost:3043`

### Relatórios

- Public prefix: `/reports`
- Upstream env: `REPORTS_SERVICE_URL`
- Default upstream: `http://localhost:3044`

Para servicos que validam contexto autenticado encaminhado internamente, o gateway injeta tokens internos por upstream:

- `/ti` usa `TI_SERVICE_INTERNAL_TOKEN`.
- `/certificate` usa `CERTIFICATE_SERVICE_INTERNAL_TOKEN`.
- `/client` usa `CLIENT_SERVICE_INTERNAL_TOKEN` para autenticação do contexto encaminhado.

Quando `AUDIT_ENABLED=true`, o gateway proxya `/audit` e `GET /platform/audit/requests` para
`AUDIT_SERVICE_URL` e injeta o header interno com `AUDIT_SERVICE_TOKEN`.

## Autorização de rotas

O gateway aplica *default-deny*: toda rota autenticada precisa de uma política explícita antes de
ser encaminhada ao upstream. `GET` exige nível modular `>=1` e operações de escrita exigem
`>=2`, exceto políticas declaradas específicas. As únicas rotas HTTP sem sessão são `GET /health`,
`GET /ready`, `POST /user/session`, `POST /platform/session` e `POST /user/start-config`. Rotas
`/platform` protegidas aceitam apenas a sessão HttpOnly de `super_admin`; Bearer de navegador é
recusado. Rotas organizacionais recusam identidade de plataforma, e rotas `/platform` recusam
identidade organizacional. Login tem rate limit dedicado; refresh e logout exigem double-submit
CSRF. `POST /platform/session/validate` é exclusivamente interno no user-service e responde 404
quando tentado pelo gateway público. O transporte `/socket.io` é uma
exceção de compatibilidade: o gateway apenas encaminha o handshake e o serviço de tempo real
valida `socket.handshake.auth.token` antes de aceitar a conexão.

Em produção, `/docs` e `/openapi.json` respondem `404` por padrão. Habilite
`ENABLE_API_DOCS=true` apenas quando a documentação precisar ser exposta deliberadamente.

Para o rollout, use `GATEWAY_AUTHORIZATION_MODE=observe` por uma janela limitada (por exemplo,
sete dias). Nesse modo, rotas autenticadas ainda sem política são encaminhadas e emitem somente
o evento agregado `authorization.unclassified_route` com método e namespace — sem URL completa,
identificadores, query, cabeçalhos ou corpo. Depois de classificar os eventos observados, retorne
para `enforce`.

## Desenvolvimento

```bash
pnpm --filter @workspace/gateway dev
```

Testes do pacote: `pnpm --filter @workspace/gateway test`.
