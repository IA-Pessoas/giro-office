# task-service

Microservico de tarefas. O gateway encaminha esse servico pelo prefixo publico **`/task`**.

Tarefas aceitam `responsible_id: null` na criação, edição e conclusão. Na criação, omitir responsáveis mantém os defaults do modelo; `null` explícito remove a atribuição. Modelos continuam exigindo responsável. A expansão não altera atribuições ou vínculos legados.

## Porta local

Por defeito: **3032** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `DATABASE_POOL_MAX` (default `1`)
- `JWT_SECRET`
- `PROJECT_SERVICE_URL`
- `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` para fonte interna de relatórios
- `AUDIT_*` quando a auditoria estiver ativa

## Gateway

- URL upstream: `TASK_SERVICE_URL` (ex.: `http://localhost:3032`)
- Prefixo publico: `/task`

Exemplos de paths publicos:

- `/task`
- `/task/list`
- `/task/model`
- `/task/model/list`
- `/task/project-plan`
- `/task/project-plan/list`
- `/task/deps/list`

`/internal/reporting` é contrato direto interno, não roteado pelo gateway.

## Desenvolvimento

```bash
pnpm --filter @workspace/task-service dev
```
