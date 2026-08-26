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

As rotas internas `/internal/reporting/catalog` e `/internal/reporting/extract` não passam pelo
gateway; exigem token interno e grant HMAC de curta duração emitido pelo reports-service.

## Desenvolvimento

```bash
pnpm --filter @workspace/project-service dev
```

Gerar Prisma: `pnpm --filter @workspace/project-service prisma:generate`.
