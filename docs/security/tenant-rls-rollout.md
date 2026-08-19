# Rollout de RLS por tenant

## Estado atual

O RLS global permanece bloqueado. Nenhuma policy ou alteração de RLS é aplicada por esta etapa:
os serviços ainda precisam estabelecer o contexto transacional de tenant antes da ativação.

`infra/prisma/tenant-ownership.json` é o inventário versionado de cada tabela de aplicação, com a
classificação `tenant`, `global` ou `system` e seus serviços responsáveis. Ele é a entrada para as
próximas etapas de rollout.

## Auditoria de catálogo

Use somente uma URL de banco efêmero ou de ambiente controlado:

```sh
node scripts/verify-tenant-security.mjs --database-url "$TENANT_SECURITY_TEST_DATABASE_URL"
```

O verificador exige a URL explicitamente, abre uma transação `READ ONLY` e consulta apenas
`pg_class` e `pg_namespace`. O relatório contém somente nomes de tabelas, classificação,
responsáveis e flags de RLS; nunca consulta nem emite valores de linhas de aplicação.

Falhas por tabela inventariada ausente no catálogo devem bloquear o rollout até o inventário ou a
migration correspondente serem corrigidos. A ausência da URL também bloqueia a execução.

## Próximas etapas e reversão

Antes de habilitar RLS, cada serviço responsável deve propagar a organização autenticada para a
mesma transação das consultas e ter testes de isolamento. Esta etapa não tem reversão de banco,
pois não altera dados, schema ou policies; reverter significa apenas restaurar o inventário e o
verificador junto ao commit que os introduziu.
