# contabil-service

Microserviço contábil. Health em `/health`. Domínio **controls** (checklist por cliente e competência) em `/contabil/controls` — ver OpenAPI na PR 5. Demais prefixos `/contabil/*` nas PRs 3–4.

Rotas atuais de controls (autenticação obrigatória):

- `POST /contabil/controls` — corpo JSON: `client_id` (UUID), `competence` (texto não vazio); cria ou retorna existente (`201` / `200`).
- `GET /contabil/controls` — query: `client_id`, `competence`.
- `PATCH /contabil/controls/:id` — corpo: `field` (whitelist) e `value` (boolean ou string para `notes`).

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
