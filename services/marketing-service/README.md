# marketing-service

Serviço do dashboard inicial e gestão de eventos de Marketing por organização.

## Porta local

- Padrão: `3047` (`MARKETING_SERVICE_PORT`).

## Variáveis de ambiente

- `DATABASE_URL` e `JWT_SECRET` para consultas e autenticação.
- `MARKETING_SERVICE_INTERNAL_TOKEN` para autenticação encaminhada pelo gateway.
- `SERVICE_ALLOWED_ORIGINS` e `ENABLE_API_DOCS` para CORS e documentação.

## Gateway

O gateway expõe o prefixo público `/marketing`. Exemplos: `GET /marketing/dashboard`,
`GET /marketing/events/list`, `POST /marketing/events`, `PUT /marketing/events/{id}`,
`GET /marketing/events/{eventId}/editions`, `POST /marketing/events/{eventId}/editions` e
`PUT /marketing/events/{eventId}/editions/{editionId}`. Edições pertencem ao evento da organização
autenticada e guardam data, local, itens de orçamento e planejamento estruturado.
As rotas exigem autenticação e permissão do módulo Marketing; criação e edição requerem nível de
edição. Eventos são limitados à organização do contexto autenticado. Na criação, o status inicial
é `Novo`; ele pode ser alterado na edição.

## Desenvolvimento

```bash
pnpm --filter @workspace/marketing-service dev
pnpm --filter @workspace/marketing-service test
```

O smoke de integração do workspace é opt-in com `MARKETING_EVENTS_SMOKE_ENABLED=1`; ele cria um
evento e uma edição com nomes únicos na organização autenticada para testar criação, leitura e
edição dos respectivos dados.
