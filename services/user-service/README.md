# user-service

Microserviço de utilizadores, sessão e permissões. Integra com o **gateway** antes do fallback para o legado.

## Porta local

Por defeito: **3030** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, logging, etc.

Para o limite distribuído de autenticação, configure também `AUTH_RATE_LIMIT_KEY_SECRET` (ao
menos 32 caracteres em produção e igual ao do gateway), `AUTH_RATE_LIMIT_IP_MAX`,
`AUTH_RATE_LIMIT_ACCOUNT_MAX`, `AUTH_RATE_LIMIT_IP_ACCOUNT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`,
`AUTH_RATE_LIMIT_TIMEOUT_MS`, `AUTH_RATE_LIMIT_DEGRADATION_MODE` e `TRUSTED_PROXY_CIDRS`.
O [runbook de rollout](../../docs/security/distributed-auth-rate-limits.md) descreve a migration,
canário, observabilidade e rollback sem fallback local.

## Gateway

O encaminhamento para `USER_SERVICE_URL` usa o prefixo público **`/user`** — ver [`gateway/src/config/serviceRegistry.ts`](../gateway/src/config/serviceRegistry.ts) (`USER_SERVICE_PREFIXES`).

Exemplos de caminhos expostos pelo **user-service** (via gateway): `/user/session`, `/user/start-config`, `/user/me`, `/user`, `/user/:id`, `/user/:id/photo`, `/user/permission/:userId`.

- **`GET /user/:id/photo`:** `200` com envelope padrão e `data.url` (URL pública da foto no storage).

Configurar no `.env` da raiz ou do gateway: `USER_SERVICE_URL=http://localhost:3030`.

## Desenvolvimento

```bash
pnpm --filter @workspace/user-service dev
```

Requer Prisma gerado (o pacote sincroniza a partir do legado no `predev` / `prebuild`).
