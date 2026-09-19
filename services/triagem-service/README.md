# triagem-service

Serviço oficial das competências mensais e operações do módulo Triagem.

## Porta local

`3046` por padrão.

## Variáveis de ambiente

Consulte `src/config/env.ts`. O serviço exige `DATABASE_URL` e `JWT_SECRET` e usa `AUDIT_SERVICE_TOKEN` para chamadas internas.
O despacho da outbox usa `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN` e `AUDIT_ENABLED`; eventos só recebem `dispatched_at` após confirmação do audit-service.
O principal de `DATABASE_URL` deve ser membro de `giro_user_runtime`; cada transação aplica essa role e o contexto `app.organization_id` antes de acessar dados tenant-scoped. A migration concede essa membership ao principal que a aplica, e o bootstrap recusa iniciar quando a credencial do serviço não atende essa condição. Portanto, execute a migration com o mesmo principal não-superuser usado pelo serviço; a provisionamento de credenciais separado pertence ao fluxo de deploy.

## Gateway

O prefixo público será `/triagem`. A ativação do upstream fica controlada pela registry do gateway;
quando habilitado, `TRIAGEM_SERVICE_URL` aponta para o upstream (por exemplo,
`http://localhost:3046`).

Endpoints públicos principais via gateway:

- `GET|POST /triagem/catalogs`
- `PATCH /triagem/catalogs/<id>` e `PATCH /triagem/catalogs/<id>/archive`
- `GET|POST /triagem/external-links`
- `GET /triagem/overview` com filtros de cliente, competência e status, paginação e indicadores
- `GET /triagem/competencies/<id>/history` para timeline append-only da competência
- `POST /internal/triagem/audit/reconcile` para reconciliação e despacho idempotentes do outbox interno

Os catálogos aceitam `JUSTIFICATION`, `LINK_TYPE`, `DELIVERY_METHOD` e `STATE_SITE`, sempre
escopados à organização. Competências preservam os valores catalogados em snapshots imutáveis;
arquivar uma opção impede novos usos fora do snapshot, sem apagar o histórico.

## Desenvolvimento

```bash
pnpm --filter @workspace/triagem-service dev
```

Para executar a verificação real de PostgreSQL em banco descartável, use `TRIAGEM_POSTGRES_INTEGRATION=1`, `TRIAGEM_POSTGRES_DISPOSABLE=1`, `TRIAGEM_POSTGRES_ADMIN_URL` e `TRIAGEM_POSTGRES_RUNTIME_URL`. A credencial runtime deve estar previamente provisionada como membro de `giro_user_runtime`; o teste não concede essa permissão.
