# commercial-service

Serviço responsável pelo catálogo mínimo de configurações de proposta do módulo Comercial.

## Operação local

- Porta padrão: `3045` (`COMMERCIAL_SERVICE_PORT`).
- Banco e autenticação: `DATABASE_URL`, `JWT_SECRET`.
- Auditoria: `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN`.
- CORS e documentação: `SERVICE_ALLOWED_ORIGINS`, `ENABLE_API_DOCS`.

```bash
pnpm --filter @workspace/commercial-service prisma:generate
pnpm --filter @workspace/commercial-service dev
pnpm --filter @workspace/commercial-service test
```

## Contrato público

O gateway publica o serviço sob `/commercial` e exige a permissão de módulo `comercial`.
Leitura exige nível 1; criação e edição exigem nível 2.

- `GET /commercial/proposal-configs`
- `GET /commercial/proposal-configs/:id`
- `POST /commercial/proposal-configs`
- `PATCH /commercial/proposal-configs/:id`

Cada consulta filtra `proposal.config` por `organization_id` derivado do contexto autenticado.
O serviço não cria propostas transacionais nem altera o catálogo de Clientes.
