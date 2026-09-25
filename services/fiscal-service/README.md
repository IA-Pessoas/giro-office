# fiscal-service

Microservico fiscal. Este servico expoe CRUD de NCM, CRUD de ICMS, CRUD de IPI, registro manual de alíquotas ISS/ICMS por empresa, catálogo/extração interna governada e o health check. O gateway encaminha esse servico pelo prefixo publico **`/fiscal`**.

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
- `/fiscal/rates` (POST: alíquota informada manualmente)
- `/fiscal/rates/list?client_id=<uuid>`
- `/fiscal/rates/<uuid>/pdf`
- `/health`

As rotas `/internal/reporting/catalog` e `/internal/reporting/extract` são internas, não passam
pelo gateway e exigem token de serviço e grant HMAC emitido pelo `reports-service`.

## Desenvolvimento

```bash
pnpm --filter @workspace/fiscal-service dev
```

Gerar Prisma: `pnpm --filter @workspace/fiscal-service prisma:generate`.

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
