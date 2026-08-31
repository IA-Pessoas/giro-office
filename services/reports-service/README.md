# Reports Service

Servico responsavel pelo catálogo e pela execução futura de relatórios.

## Porta local

Porta padrão: `3044`.

## Variáveis de ambiente

Consulte [`src/config/env.ts`](src/config/env.ts).

- Banco e autenticação: `DATABASE_URL`, `DATABASE_POOL_MAX` (default `1`), `JWT_SECRET`.
- Tokens e segredo interno: `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET`.
- RH: `RH_SERVICE_URL` (default `http://localhost:3034`).
- Tecnologia: `TI_SERVICE_URL` (padrão `http://localhost:3040`).
- Regularize: `REGULARIZE_SERVICE_URL`, `REGULARIZE_REPORTING_TOKEN`, `REGULARIZE_REPORTING_GRANT_SECRET`.
- Certificados PF: `CERTIFICATE_REPORTING_TOKEN`, `CERTIFICATE_REPORTING_GRANT_SECRET`.
- URLs upstream: `USER_SERVICE_URL`, `PARCELAMENTO_SERVICE_URL`, `CLIENT_SERVICE_URL`,
  `PROJECT_SERVICE_URL`, `TASK_SERVICE_URL`, `CONTABIL_SERVICE_URL`, `CERTIFICATE_SERVICE_URL`,
  `FISCAL_SERVICE_URL` (default `http://localhost:3037`), `PESSOAL_SERVICE_URL`
  (default `http://localhost:3042`).
- Timeout de fontes internas: `REPORTS_SOURCE_TIMEOUT_MS`.
- Worker e CORS: `REPORTS_WORKER_POLL_INTERVAL_MS`, `REPORTS_WORKER_CONCURRENCY`,
  `REPORTS_WORKER_LEASE_SECONDS`, `SERVICE_ALLOWED_ORIGINS`.

## Gateway

Prefixo público: `/reports`.

`GET /reports/catalog` expõe somente fontes e campos de adapters internos habilitados para a
organização e permissões atuais. `POST /reports/preview` valida a mesma definição e devolve uma
amostra limitada; não cria job, snapshot, arquivo ou registro persistido.

`POST /reports/models` cria um modelo pessoal. `GET /reports/models/list`,
`GET /reports/models/:id`, `PATCH /reports/models/:id` e `DELETE /reports/models/:id` atendem
somente o autor. Cada criação ou edição revalida a definição declarativa contra o catálogo e as
permissões atuais; a edição cria uma nova versão e nunca compartilha o modelo com departamento.

`GET /reports/snapshots/:id/export?format=csv|xlsx` revalida o acesso atual e gera um arquivo
efêmero somente das linhas materializadas no snapshot. O arquivo não é salvo em storage nem
registrado como exportação persistida; a auditoria conserva apenas formato, resultado, job, versão
e contagens seguras.

## Desenvolvimento

```bash
pnpm --filter @workspace/reports-service dev
pnpm --filter @workspace/reports-service worker
pnpm --filter @workspace/reports-service test
```

O bootstrap registra adapters internos de Parcelamento, Clientes, Projetos, Tarefas, Controle Contábil,
relacionamentos e responsáveis contábeis, Certificados PF e PJ, ICMS, IPI, NCM fiscal, LDD,
Solicitações e Feriados de RH, Licenças e Processos do Regularize. Os adapters de RH consultam exclusivamente
`/internal/reporting/extract` do rh-service, com grant HMAC curto e projeção dos campos seguros de
`rh.requests` e `rh.holidays`.
Eles consultam somente rotas internas governadas dos serviços de origem e assinam grants HMAC de curta duração.
Os adapters de Tecnologia incluem inventário, chamados e ramais, sempre com projeção de campos
seguros e sem chaves internas no catálogo público.

O smoke de Projetos fica desativado por padrão; exija `PROJECT_REPORTING_SMOKE_ENABLED=true` e
`REPORTS_GRANT_SECRET` apenas em ambiente isolado com os dois segredos configurados.

`GET /reports/jobs/list` lista o histórico pessoal ou o acervo departamental com filtros. `GET` e
`PUT /reports/retention` administram a retenção organizacional para jobs futuros e exigem owner.
`POST /reports/snapshots/:id/delete` remove antecipadamente um snapshot com justificativa e exige
Admin 3 do departamento do job.

O smoke de Controle Contábil fica desativado por padrão; exija
`CONTABIL_REPORTING_SMOKE_ENABLED=true` e `REPORTS_GRANT_SECRET` apenas em ambiente isolado com
os dois segredos configurados.

O smoke de Tarefas fica desativado por padrão; exija `TASK_REPORTING_SMOKE_ENABLED=true` e
`REPORTS_GRANT_SECRET` apenas em ambiente isolado com os dois segredos configurados.

O smoke fiscal fica desativado por padrão; exija `FISCAL_REPORTING_SMOKE_ENABLED=true` e
`REPORTS_GRANT_SECRET` apenas em ambiente isolado com os dois segredos configurados.

Os adapters de LDD, folha e obrigações de Departamento Pessoal usam `PESSOAL_SERVICE_URL`,
`REPORTS_INTERNAL_TOKEN` e `REPORTS_GRANT_SECRET` para consultar exclusivamente o contrato interno
governado do pessoal-service. Em folha, `client_id`, responsável e sindicato permanecem como chaves
internas do catálogo.
