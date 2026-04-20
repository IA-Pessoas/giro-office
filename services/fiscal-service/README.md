# fiscal-service

Microservico fiscal. Na PR 1, este servico expoe apenas o CRUD de NCM e o health check. O gateway encaminha esse servico pelo prefixo publico **`/fiscal`**.

## Porta local

Por defeito: **3037** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `JWT_SECRET`
- `AUDIT_*` quando a auditoria estiver ativa

## Gateway

- URL upstream: `FISCAL_SERVICE_URL` (ex.: `http://localhost:3037`)
- Prefixo publico: `/fiscal`

Exemplos de paths publicos:

- `/fiscal/ncm`
- `/fiscal/ncm/list`
- `/health`

## Desenvolvimento

```bash
pnpm --filter @workspace/fiscal-service dev
```

Gerar Prisma: `pnpm --filter @workspace/fiscal-service prisma:generate`.
