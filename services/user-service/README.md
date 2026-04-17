# user-service

Microserviço de utilizadores, sessão e permissões. Integra com o **gateway** antes do fallback para o legado.

## Porta local

Por defeito: **3030** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, logging, etc.

## Gateway

O gateway encaminha estes prefixos/caminhos para `USER_SERVICE_URL` (ver [`gateway/src/utils/routeUtils.ts`](../gateway/src/utils/routeUtils.ts) — `isUserServiceRoute`):

- `/session`, `/start-config` (públicos no gateway para `POST`, conforme políticas)
- `/me`
- `/users`, `/users/*`
- `/permission/*`

Configurar no `.env` da raiz ou do gateway: `USER_SERVICE_URL=http://localhost:3030`.

## Desenvolvimento

```bash
pnpm --filter @workspace/user-service dev
```

Requer Prisma gerado (o pacote sincroniza a partir do legado no `predev` / `prebuild`).
