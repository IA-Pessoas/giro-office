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
- `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN`
- `ORGANIZATION_SERVICE_URL`
- `RH_SERVICE_URL`
- `USER_SERVICE_URL`
- `DEPARTMENT_SERVICE_URL`
- `TASK_SERVICE_URL`
- `PROJECT_SERVICE_URL`
- `CLIENT_SERVICE_URL`
- `FISCAL_SERVICE_URL`
- `CONTABIL_SERVICE_URL`
- `REGULARIZE_SERVICE_URL`
- `TI_SERVICE_URL`, `TI_SERVICE_INTERNAL_TOKEN`
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
- `/regularize` -> `REGULARIZE_SERVICE_URL`
- `/fiscal` -> `FISCAL_SERVICE_URL`
- `/contabil` -> `CONTABIL_SERVICE_URL`
- `/ti` -> `TI_SERVICE_URL`

Quando `AUDIT_ENABLED=true`, o gateway tambem proxya `/audit` para `AUDIT_SERVICE_URL` e injeta o header interno com `AUDIT_SERVICE_TOKEN`.

## Desenvolvimento

```bash
pnpm --filter @workspace/gateway dev
```

Testes do pacote: `pnpm --filter @workspace/gateway test`.
