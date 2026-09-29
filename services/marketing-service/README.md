# marketing-service

Dashboard, controles de uso de IA e credenciais criptografadas do módulo Marketing.

## Porta local

- Padrão: `3047` (`MARKETING_SERVICE_PORT`).

## Variáveis de ambiente

- `DATABASE_URL` e `JWT_SECRET` para consultas e autenticação.
- `MARKETING_SERVICE_INTERNAL_TOKEN` para autenticação encaminhada pelo gateway.
- `MTK_ENCRYPTION_KEY` para compatibilidade criptográfica com as credenciais legadas do Office
  (chave base64 de 32 bytes; usar a mesma chave configurada no serviço legado).
- `SERVICE_ALLOWED_ORIGINS` e `ENABLE_API_DOCS` para CORS e documentação.

## Gateway

O gateway encaminha `/marketing` para este serviço. As credenciais usam `GET /passwords/list` e
`GET /passwords/:id` para metadados sem segredo. Criar, editar, importar, revelar, exportar e
consultar a quarentena exigem permissão de edição; revelar e exportar também exigem confirmação
explícita. Segredos e payloads de quarentena usam o formato Office e nunca são incluídos em logs.
Todas as consultas e gravações usam a organização do contexto autenticado.

## Desenvolvimento

```bash
pnpm --filter @workspace/marketing-service dev
pnpm --filter @workspace/marketing-service test
```
