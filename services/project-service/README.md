# project-service

Microservico de projetos. O gateway encaminha esse servico pelo prefixo publico **`/project`**.

## Porta local

Por defeito: **3033** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `JWT_SECRET`
- `AUDIT_*` quando a auditoria estiver ativa

## Gateway

- URL upstream: `PROJECT_SERVICE_URL` (ex.: `http://localhost:3033`)
- Prefixo publico: `/project`

Exemplos de paths publicos:

- `/project`
- `/project/list`
- `/project/progress`

## Desenvolvimento

```bash
pnpm --filter @workspace/project-service dev
```

Gerar Prisma: `pnpm --filter @workspace/project-service prisma:generate`.
