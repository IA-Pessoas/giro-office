# gateway

Gateway HTTP do workspace. Centraliza autenticacao, autorizacao, CORS, auditoria e proxy para os microservicos.

## Porta local

Por defeito: **3010** (`GATEWAY_PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `JWT_SECRET`
- `GATEWAY_ALLOWED_ORIGINS`
- `GATEWAY_PUBLIC_URL` (opcional, usado no `servers[0].url` do OpenAPI agregado)
- `GATEWAY_JSON_BODY_LIMIT` (opcional, padrao `1mb`)
- `ENABLE_API_DOCS` (opcional; por padrão habilitado fora de produção e desabilitado em produção)
- `GATEWAY_AUTHORIZATION_MODE` (`enforce`, padrão seguro; `observe` somente para rollout temporário)
- `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN`
- `ORGANIZATION_SERVICE_URL`
- `RH_SERVICE_URL`
- `USER_SERVICE_URL`
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

### Parcelamento

- Public prefix: `/parcelamento`
- Upstream env: `PARCELAMENTO_SERVICE_URL`
- Default upstream: `http://localhost:3043`

Para servicos que validam contexto autenticado encaminhado internamente, o gateway injeta tokens internos por upstream:

- `/ti` usa `TI_SERVICE_INTERNAL_TOKEN`.
- `/certificate` usa `CERTIFICATE_SERVICE_INTERNAL_TOKEN`.
- `/client` usa `CLIENT_SERVICE_INTERNAL_TOKEN` para autenticação do contexto encaminhado.

Quando `AUDIT_ENABLED=true`, o gateway tambem proxya `/audit` para `AUDIT_SERVICE_URL` e injeta o header interno com `AUDIT_SERVICE_TOKEN`.

## Autorização de rotas

O gateway aplica *default-deny*: toda rota autenticada precisa de uma política explícita antes de
ser encaminhada ao upstream. `GET` exige nível modular `>=1` e operações de escrita exigem
`>=2`, exceto políticas declaradas específicas. As únicas rotas sem sessão são `GET /health`,
`GET /ready`, `POST /user/session` e `POST /user/start-config`.

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
