# department-service

Gestao de departamentos. Montado no gateway no prefixo **`/department`**.

## Porta local

Por defeito: **3036** (`DEPARTMENT_SERVICE_PORT`, com fallback para `PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`, `DEPARTMENT_SERVICE_PORT`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN` e `AUDIT_ENABLED`.

## Gateway

- URL upstream: `DEPARTMENT_SERVICE_URL` (ex.: `http://localhost:3036`), definida no [env do gateway](../gateway/src/config/env.ts).
- Paths publicos:
  - `GET /department/list`
  - `GET /department`
  - `POST /department`
  - `PUT /department`

## Desenvolvimento

```bash
pnpm --filter @workspace/department-service dev
```

Gerar Prisma: `pnpm --filter @workspace/department-service prisma:generate`.
