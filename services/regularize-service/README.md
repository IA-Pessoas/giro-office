# regularize-service

Micro-servico de regularize. Centraliza rotas, validacao, OpenAPI e rotinas internas de reconciliacao do modulo legado.

## Porta local

Por defeito: **3411** (`PORT`).

## Variaveis de ambiente

- `DATABASE_URL`
- `JWT_SECRET`
- `MTK_ENCRYPTION_KEY`
- `AUDIT_SERVICE_TOKEN`
- `REGULARIZE_SERVICE_INTERNAL_TOKEN`
- `REGULARIZE_ENABLE_RECONCILIATION_SCHEDULE`
- `REGULARIZE_LICENSE_NOTIFICATION_CRON`
- `REGULARIZE_CLIENT_PF_STATUS_CRON`
- `REGULARIZE_CLIENT_PF_DOCUMENTS_CRON`
- `REGULARIZE_RECONCILIATION_TIMEZONE`

## Gateway

- URL upstream: `REGULARIZE_SERVICE_URL` (ex.: `http://localhost:3411`)
- prefixo publico: `/regularize`
- endpoints internos `/internal/*` nao devem ser expostos via gateway

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
