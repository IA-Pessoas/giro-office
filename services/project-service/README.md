# project-service

Microservico de projetos. O gateway encaminha esse servico pelo prefixo publico **`/project`**.

## Porta local

Por defeito: **3033** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `DATABASE_POOL_MAX` (default `1`)
- `JWT_SECRET`
- `AUDIT_*` quando a auditoria estiver ativa
- `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` para `/internal/reporting/*`; ambos devem
  coincidir com o reports-service.

## Gateway

- URL upstream: `PROJECT_SERVICE_URL` (ex.: `http://localhost:3033`)
- Prefixo publico: `/project`

Exemplos de paths publicos:

- `/project`
- `/project/list`
- `/project/progress`

`POST /project` aceita `end_date` opcional, igual ou posterior a `start_date`.
A resposta inclui `data.create.end_date` (ou `null` quando omitida); período invertido retorna 400.
`ProjectCrudService.createInTransaction(data, tx)` reutiliza as validações e persistência com
um `Prisma.TransactionClient` do chamador, sem abrir transação nem emitir auditoria.
O chamador coordena commit/rollback e auditoria pós-commit; a criação normal já faz isso,
com auditoria best-effort.

As rotas internas `/internal/reporting/catalog` e `/internal/reporting/extract` não passam pelo
gateway; exigem token interno e grant HMAC de curta duração emitido pelo reports-service.

## Desenvolvimento

```bash
pnpm --filter @workspace/project-service dev
```

Gerar Prisma: `pnpm --filter @workspace/project-service prisma:generate`.
