# Commercial Worker

Worker Hono do `commercial-service`, usando o PostgreSQL/Supabase existente por
`HYPERDRIVE` ou `DATABASE_URL`.

## Outbox agendado

O `wrangler.jsonc` declara o cron `*/1 * * * *`, que invoca o handler `scheduled` e
processa um evento por execução. O handler falha explicitamente se faltar PostgreSQL,
`INTERNAL_REQUEST_ORIGIN` ou as bindings/tokens de client/task necessárias para
projetar o evento. A ausência do adapter de email não é mascarada: o evento de
notificação é persistido em `commercial.email_notifications` como `failed`, com
`last_error`, e o outbox continua observável por `/commercial/outbox/status`.

O cron é apenas configuração local/versionada. Provisionamento de Hyperdrive, secrets,
bindings reais e aceite de entrega continuam externos; não há Queue ID nem secret
inventado neste Worker.

O adapter de email aceita HTTP apenas quando `NODE_ENV` é `test` ou `development`;
fora desses ambientes exige endpoint HTTPS. O `x-request-id` é normalizado no início
de cada request, reutilizado no payload das mutações/outbox e propagado às bindings;
a resposta devolve o mesmo valor.

## Desenvolvimento

```text
pnpm --filter @workspace/commercial-worker test
pnpm --filter @workspace/commercial-worker typecheck
pnpm --filter @workspace/commercial-worker build
```
