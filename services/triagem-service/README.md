# triagem-service

Serviço oficial das competências mensais e operações do módulo Triagem.

## Porta local

`3046` por padrão.

## Variáveis de ambiente

Consulte `src/config/env.ts`. O serviço exige `DATABASE_URL` e `JWT_SECRET` e usa `AUDIT_SERVICE_TOKEN` para chamadas internas.
O principal de `DATABASE_URL` deve ser membro de `giro_user_runtime`; cada transação aplica essa role e o contexto `app.organization_id` antes de acessar dados tenant-scoped. A migration concede essa membership ao principal que a aplica, e o bootstrap recusa iniciar quando a credencial do serviço não atende essa condição. Portanto, execute a migration com o mesmo principal não-superuser usado pelo serviço; a provisionamento de credenciais separado pertence ao fluxo de deploy.

## Gateway

O prefixo público será `/triagem`. A ativação do upstream fica controlada pela registry do gateway.

## Desenvolvimento

```bash
pnpm --filter @workspace/triagem-service dev
```

Para executar a verificação real de PostgreSQL em banco descartável, use `TRIAGEM_POSTGRES_INTEGRATION=1`, `TRIAGEM_POSTGRES_DISPOSABLE=1`, `TRIAGEM_POSTGRES_ADMIN_URL` e `TRIAGEM_POSTGRES_RUNTIME_URL`. A credencial runtime deve estar previamente provisionada como membro de `giro_user_runtime`; o teste não concede essa permissão.
