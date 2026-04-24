# contabil-service

Microserviço contábil (scaffold PR 1). Por ora expõe apenas o health check; as rotas `/contabil/*` serão adicionadas nas PRs seguintes.

## Porta local

Por padrão: **3038** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `JWT_SECRET`
- `AUDIT_*` quando a auditoria estiver ativa

## Desenvolvimento

```bash
pnpm --filter @workspace/contabil-service dev
```

Gerar Prisma: `pnpm --filter @workspace/contabil-service prisma:generate`.
