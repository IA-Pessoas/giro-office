# Reports Service

Servico responsavel pelo catálogo e pela execução futura de relatórios.

## Porta local

Porta padrão: `3044`.

## Variáveis de ambiente

Consulte [`src/config/env.ts`](src/config/env.ts).

- Banco e autenticação: `DATABASE_URL`, `DATABASE_POOL_MAX` (default `1`), `JWT_SECRET`.
- Tokens e segredo interno: `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET`.
- URLs upstream: `USER_SERVICE_URL`, `PARCELAMENTO_SERVICE_URL`, `CLIENT_SERVICE_URL`,
  `PROJECT_SERVICE_URL`, `TASK_SERVICE_URL`.
- Timeout de fontes internas: `REPORTS_SOURCE_TIMEOUT_MS`.
- Worker e CORS: `REPORTS_WORKER_POLL_INTERVAL_MS`, `REPORTS_WORKER_CONCURRENCY`,
  `REPORTS_WORKER_LEASE_SECONDS`, `SERVICE_ALLOWED_ORIGINS`.

## Gateway

Prefixo público: `/reports`.

`GET /reports/catalog` expõe somente fontes e campos de adapters internos habilitados para a
organização e permissões atuais. `POST /reports/preview` valida a mesma definição e devolve uma
amostra limitada; não cria job, snapshot, arquivo ou registro persistido.

## Desenvolvimento

```bash
pnpm --filter @workspace/reports-service dev
pnpm --filter @workspace/reports-service worker
pnpm --filter @workspace/reports-service test
```

O bootstrap registra adapters internos de Parcelamento, Clientes, Projetos e Tarefas. Eles consultam
somente rotas internas governadas dos serviços de origem e assinam grants HMAC de curta duração.

O smoke de Projetos fica desativado por padrão; exija `PROJECT_REPORTING_SMOKE_ENABLED=true` e
`REPORTS_GRANT_SECRET` apenas em ambiente isolado com os dois segredos configurados.

O smoke de Tarefas fica desativado por padrão; exija `TASK_REPORTING_SMOKE_ENABLED=true` e
`REPORTS_GRANT_SECRET` apenas em ambiente isolado com os dois segredos configurados.
