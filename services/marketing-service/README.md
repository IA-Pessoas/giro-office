# marketing-service

Serviço de Marketing para dashboard, pesquisas de uso de IA, credenciais criptografadas, eventos e
edições, com dados isolados por organização.

## Porta local

- Padrão: `3047` (`MARKETING_SERVICE_PORT`).

## Variáveis de ambiente

- `DATABASE_URL` e `JWT_SECRET` para consultas e autenticação.
- `MARKETING_SERVICE_INTERNAL_TOKEN` para autenticação encaminhada pelo gateway.
- `MTK_ENCRYPTION_KEY` para compatibilidade criptográfica com as credenciais legadas do Office
  (chave base64 de 32 bytes; usar a mesma chave configurada no serviço legado).
- `SERVICE_ALLOWED_ORIGINS` e `ENABLE_API_DOCS` para CORS e documentação.
- `AUDIT_ENABLED`, `AUDIT_SERVICE_URL` e `AUDIT_SERVICE_TOKEN` para a trilha exigida de eventos,
  edições e avaliações: sem auditoria, essas alterações respondem 503 e não são salvas. No Worker,
  o envio usa o binding `AUDIT_SERVICE` e o secret `AUDIT_SERVICE_TOKEN`.

## Gateway

O gateway encaminha `/marketing` para este serviço. As credenciais usam `GET /passwords/list` e
`GET /passwords/:id` para metadados sem segredo. Criar, editar, importar, revelar, exportar e
consultar a quarentena exigem permissão de edição; revelar e exportar também exigem confirmação
explícita. Segredos e payloads de quarentena usam o formato Office e nunca são incluídos em logs.
O gateway expõe o prefixo público `/marketing`. Exemplos: `GET /marketing/dashboard`,
`GET /marketing/events/list`, `POST /marketing/events`, `PUT /marketing/events/{id}`,
`GET /marketing/events/{eventId}/editions`, `POST /marketing/events/{eventId}/editions` e
`PUT /marketing/events/{eventId}/editions/{editionId}`. Também disponibiliza
`POST /marketing/events/{eventId}/editions/{editionId}/feedback` para registrar uma avaliação única
(nota de 1 a 5 e observação opcional) e
`GET /marketing/events/{eventId}/editions/{editionId}/report` para consultar os dados da edição
em formato adequado para impressão. Edições pertencem ao evento da organização autenticada e
guardam data, local, itens de orçamento, planejamento estruturado e período opcional de avaliação.
As rotas exigem autenticação e permissão do módulo Marketing. Criação e edição de eventos e edições,
assim como registro de avaliação, requerem nível de edição; leitura do relatório requer acesso de
leitura ao módulo. Eventos e edições são limitados à organização do contexto autenticado. Na criação,
o status inicial do evento é `Novo`; ele pode ser alterado na edição. Todas as consultas e gravações
usam a organização do contexto autenticado.

## Desenvolvimento

```bash
pnpm --filter @workspace/marketing-service dev
pnpm --filter @workspace/marketing-service test
```

O smoke de integração do workspace é opt-in com `MARKETING_EVENTS_SMOKE_ENABLED=1`; ele cria um
evento e uma edição com nomes únicos na organização autenticada para testar criação, leitura e
edição dos respectivos dados.
