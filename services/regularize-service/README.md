# regularize-service

Micro-servico de regularize. Centraliza rotas, validacao, OpenAPI e rotinas internas de reconciliacao do modulo legado. O gateway encaminha as rotas de negocio pelo prefixo publico **`/regularize`**.

## Porta local

Por defeito: **3039** (`PORT`).

## Variaveis de ambiente

Definicao e defaults em [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL` - PostgreSQL (Prisma)
- `DATABASE_POOL_MAX` - teto do pool por processo (default `1`)
- `JWT_SECRET` - validacao do Bearer nas rotas autenticadas
- `PORT` - porta HTTP (default `3039`)
- `MTK_ENCRYPTION_KEY` - chave usada para criptografar credenciais do legado
- `AUDIT_SERVICE_TOKEN` - token usado na integracao de auditoria
- `INTERNAL_SERVICE_TOKEN` - token exigido nas rotas `POST /internal/reconciliation/*` pelo header `x-internal-service-token` (opcional; se vazio, usa o mesmo valor que `AUDIT_SERVICE_TOKEN`)
- `REGULARIZE_REPORTING_TOKEN` e `REGULARIZE_REPORTING_GRANT_SECRET` - credenciais exclusivas do adapter interno de relatórios
- `SERVICE_ALLOWED_ORIGINS` - origens CORS aceitas; em producao nao pode ficar como `*`
- `ENABLE_API_DOCS` - documentacao OpenAPI em `/docs` (default ligado fora de producao)
- `LOG_LEVEL`, `LOG_PRETTY` - configuracao de logs
- `REGULARIZE_ENABLE_RECONCILIATION_SCHEDULE`
- `REGULARIZE_LICENSE_NOTIFICATION_CRON`
- `REGULARIZE_CLIENT_PF_STATUS_CRON`
- `REGULARIZE_CLIENT_PF_DOCUMENTS_CRON`
- `REGULARIZE_RECONCILIATION_TIMEZONE`

## Gateway

- URL upstream: `REGULARIZE_SERVICE_URL` (ex.: `http://localhost:3039`)
- Prefixo publico: `/regularize`
- Endpoints internos `/internal/*` nao devem ser expostos via gateway

Exemplos de paths publicos:

- `/regularize/passwords`
- `/regularize/pf`
- `/regularize/pfs`
  - aceita `status`, `search`, `page` e `limit`; retorna uma página com `data`, `total` e `hasMore`.
- `/regularize/partners`
- `/regularize/municipal-taxes`
- `/regularize/process`
- `/regularize/processes`
- `/regularize/guidance`
- `/regularize/license`
- `/regularize/licenses`

Infraestrutura direto no servico: `GET /health` e, quando habilitado, `GET /docs`.

## Rotas internas

As rotas internas ficam montadas diretamente no servico sob `/internal` e exigem `INTERNAL_SERVICE_TOKEN`:

- `POST /internal/reconciliation/run`
- `POST /internal/reconciliation/license-notifications/run`
- `POST /internal/reconciliation/client-pf-status/run`
- `POST /internal/reconciliation/client-pf-documents/run`
- `GET /internal/reporting/catalog` e `POST /internal/reporting/extract` (fontes `regularize.licenses` e
  `regularize.processes`, somente reports-service, fora do gateway; exigem token e grant de relatório)

## Reconciliacao agendada

- habilite com `REGULARIZE_ENABLE_RECONCILIATION_SCHEDULE=true`
- defaults legados:
  - alvaras: `30 4 * * *`
  - status PF: `* 5 * * *`
  - documentos PF: `30 5 * * *`
  - timezone: `America/Sao_Paulo`

## Desenvolvimento

```bash
pnpm --filter @workspace/regularize-service dev
```

Testes:

```bash
pnpm --filter @workspace/regularize-service test
```

Cobertura do manifesto smoke:

```bash
pnpm smoke:coverage
```

As operacoes OpenAPI do regularize estao no manifesto smoke, mas as probes runtime nao-health ficam desabilitadas por default ate existirem handlers com fixtures. Para habilitar uma execucao runtime dessas probes, configure `REGULARIZE_SMOKE_ENABLED=true`.
