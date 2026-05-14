# user-service

Microserviço de utilizadores, sessão e permissões. Integra com o **gateway** antes do fallback para o legado.

## Porta local

Por defeito: **3030** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, logging, etc.

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
