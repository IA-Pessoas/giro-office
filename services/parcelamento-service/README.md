# Parcelamento Service

Servico responsavel pelos contratos modernos de parcelamento, competencias de parcelamento e
panoramas mensais. O pacote expoe health checks, readiness, documentacao OpenAPI e rotas HTTP de
dominio consumidas pelo gateway.

## Porta local

Porta padrao: `3043`.

## Variaveis de ambiente

As variaveis sao lidas em `src/config/env.ts`.

- `PORT`: porta HTTP, com default `3043`.
- `NODE_ENV`: ambiente de execucao, default `development`.
- `DATABASE_URL`: conexao Postgres usada pelo Prisma.
- `DATABASE_POOL_MAX`: teto do pool por processo, default `1`.
- `JWT_SECRET`: segredo JWT recebido por compatibilidade com o padrao dos services.
- `AUDIT_ENABLED`: habilita integracao de auditoria, default `true`.
- `AUDIT_SERVICE_URL`: URL do audit-service, default `http://localhost:3020`.
- `AUDIT_SERVICE_TOKEN`: token interno para auditoria, default local `audit-service-token`.
- `REPORTS_INTERNAL_TOKEN`: token interno aceito nas rotas de relatório.
- `REPORTS_GRANT_SECRET`: segredo HMAC dos grants de relatório.
- `LOG_LEVEL`: nivel do logger, default `info`.
- `LOG_PRETTY`: habilita logs legiveis fora de `production`, default `false`.
- `SERVICE_ALLOWED_ORIGINS`: origins CORS separadas por virgula, default local `*`.
- `ENABLE_API_DOCS`: controla `/docs`; por default fica ativo fora de `production`.

## Gateway

O prefixo publico no gateway e `/parcelamento`.

Configure o upstream com:

```bash
PARCELAMENTO_SERVICE_URL=http://localhost:3043
```

As rotas internas `/internal/reporting/catalog` e `/internal/reporting/extract` não passam pelo
gateway; ambas exigem token interno e grant HMAC de curta duração emitido pelo reports-service.

## Desenvolvimento

```bash
pnpm --filter @workspace/parcelamento-service dev
```

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
