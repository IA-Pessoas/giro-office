# fiscal-service

Microservico fiscal. Até a PR 2, este servico expoe CRUD de NCM, CRUD de ICMS e o health check. O gateway encaminha esse servico pelo prefixo publico **`/fiscal`**.

## Porta local

Por defeito: **3037** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `DATABASE_POOL_MAX` (default `1`)
- `JWT_SECRET`
- `AUDIT_*` quando a auditoria estiver ativa
- `REPORTS_INTERNAL_TOKEN` e `REPORTS_GRANT_SECRET` para as rotas internas de relatórios

## Gateway

- URL upstream: `FISCAL_SERVICE_URL` (ex.: `http://localhost:3037`)
- Prefixo publico: `/fiscal`

Exemplos de paths publicos:

- `/fiscal/ncm`
- `/fiscal/ncm/list`
- `/fiscal/icms`
- `/fiscal/icms/list`
- `/health`

As rotas `/internal/reporting/catalog` e `/internal/reporting/extract` são internas, não passam
pelo gateway e exigem token de serviço e grant HMAC emitido pelo `reports-service`.

## Desenvolvimento

```bash
pnpm --filter @workspace/fiscal-service dev
```

Gerar Prisma: `pnpm --filter @workspace/fiscal-service prisma:generate`.
