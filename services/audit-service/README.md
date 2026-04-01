# audit-service

Ingestão e consulta de pedidos de auditoria. O gateway pode proxyar `/audit` e enviar eventos de ciclo de vida HTTP.

## Porta local

Por defeito: **3336** (variável específica do serviço em `src/config/env.ts`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `AUDIT_SERVICE_TOKEN`, logging, etc.

## Gateway

Comportamento controlado **só no gateway**:

- `AUDIT_ENABLED=true` — monta `app.use("/audit", …)` com proxy para `AUDIT_SERVICE_URL` e injeta o header interno com `AUDIT_SERVICE_TOKEN` antes do upstream.
- `AUDIT_ENABLED=false` — rotas `/audit/*` respondem 404 no gateway (middleware dedicado).

O gateway também usa `AUDIT_SERVICE_URL` e `AUDIT_SERVICE_TOKEN` no **recorder** de auditoria (`createAuditRecorder`) para registar pedidos que passam pelo gateway, independentemente do proxy `/audit`.

Ordem relevante no gateway: autenticação e autorização aplicam-se antes do proxy; ver [`gateway/src/app.ts`](../gateway/src/app.ts).

## Desenvolvimento

```bash
pnpm --filter @workspace/audit-service dev
```

Testes do pacote: `pnpm --filter @workspace/audit-service test`.
