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

## Desenvolvimento

```bash
pnpm --filter @workspace/parcelamento-service dev
```
