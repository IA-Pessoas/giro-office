# Reports Service

Servico responsavel pelo catálogo e pela execução futura de relatórios.

## Porta local

Porta padrão: `3044`.

## Variáveis de ambiente

Consulte [`src/config/env.ts`](src/config/env.ts).

- Banco e autenticação: `DATABASE_URL`, `DATABASE_POOL_MAX` (default `1`), `JWT_SECRET`.
- Tokens e segredo interno: `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET`.
- RH: `RH_SERVICE_URL` (default `http://localhost:3034`).
- Tecnologia: `TI_SERVICE_URL` (default `http://localhost:3040`).
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

`POST /reports/definitions/validate` aceita `{ definition: { version: 2, areas: [{ source,
fields }] } }` para revisar áreas independentes, além da definição legada. Revalida todas as
áreas e campos contra o acesso atual; não consulta registros nem persiste modelos ou execuções.
A ordem das áreas determina somente apresentação. Exige áreas/campos únicos e não vazios,
até 32 áreas e 100 campos por área. Catálogo fornece `department_label` e `description` para
apresentação, sem mapeamento de códigos no frontend.

Este contrato de revisão prepara #1016; prévia, modelos e geração continuam recebendo o
contrato legado até suas entregas específicas. Não há migração de banco nesta etapa.

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

O bootstrap registra adapters internos de Parcelamento, Clientes, Projetos, Tarefas, Inventário de TI,
Estoque de TI, Controle Contábil,
relacionamentos e responsáveis contábeis, Certificados PF e PJ, ICMS, IPI, NCM fiscal, LDD,
situações e folha de Departamento Pessoal, Solicitações e Feriados de RH, Licenças e Processos do
Regularize. Os adapters de RH consultam exclusivamente
`/internal/reporting/extract` do rh-service, com grant HMAC curto e projeção dos campos seguros de
`rh.requests` e `rh.holidays`.
Eles consultam somente rotas internas governadas dos serviços de origem e assinam grants HMAC de curta duração.
Os adapters de Tecnologia, incluindo inventário, estoque, chamados e ramais, usam o contrato combinado
do ti-service e publicam somente campos selecionáveis, sem as chaves internas do catálogo.

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

O adapter de situações de Departamento Pessoal usa as mesmas credenciais e publica somente status,
título e datas de registro/conclusão; `client_id`, registrador e concluidor permanecem como chaves
internas do catálogo.
