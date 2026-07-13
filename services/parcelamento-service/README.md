# Parcelamento Service

Servico responsavel pela fundacao dos contratos modernos de parcelamento. Nesta fase, o pacote
expoe apenas infraestrutura de saude, readiness e documentacao OpenAPI.

## Porta local

Porta padrao: `3043`.

## Variaveis de ambiente

As variaveis sao lidas em `src/config/env.ts`.

- `PORT`: porta HTTP, com default `3043`.
- `DATABASE_URL`: conexao Postgres usada pelo Prisma.
- `JWT_SECRET`: segredo JWT recebido por compatibilidade com o padrao dos services.
- `AUDIT_ENABLED`: habilita integracao de auditoria, default `true`.
- `AUDIT_SERVICE_URL`: URL do audit-service, default `http://localhost:3020`.
- `AUDIT_SERVICE_TOKEN`: token interno para auditoria, default local `audit-service-token`.
- `SERVICE_ALLOWED_ORIGINS`: origins CORS separadas por virgula, default local `*`.
- `ENABLE_API_DOCS`: controla `/docs`; por default fica ativo fora de `production`.

## Gateway

O prefixo publico previsto no gateway e `/parcelamento`.

Configure o upstream com:

```bash
PARCELAMENTO_SERVICE_URL=http://localhost:3043
```

## Desenvolvimento

```bash
pnpm --filter @workspace/parcelamento-service dev
```
