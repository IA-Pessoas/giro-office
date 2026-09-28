# marketing-service

Serviço do dashboard inicial e cadastro de eventos de Marketing.

## Porta local

- Padrão: `3047` (`MARKETING_SERVICE_PORT`).

## Variáveis de ambiente

- `DATABASE_URL` e `JWT_SECRET` para consultas e autenticação.
- `MARKETING_SERVICE_INTERNAL_TOKEN` para autenticação encaminhada pelo gateway.
- `SERVICE_ALLOWED_ORIGINS` e `ENABLE_API_DOCS` para CORS e documentação.

## Gateway

O serviço prepara `GET /marketing/dashboard`, que exige permissão Marketing de nível 1. O gateway
mantém `/marketing` bloqueado com 404 até a reconciliação do módulo. Todas as consultas usam a
organização do contexto autenticado. O serviço não altera solicitações, clientes ou colaboradores.

## Desenvolvimento

```bash
pnpm --filter @workspace/marketing-service dev
pnpm --filter @workspace/marketing-service test
```
