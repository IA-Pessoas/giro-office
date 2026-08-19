# Rollout de RLS por tenant

## Estado atual

O RLS global permanece bloqueado. A primeira migration cobre apenas o domínio do user-service:
`users`, `departments`, `permissions`, `permissions.specific`, `organizations` e `logs`.
As demais tabelas seguem sem RLS até seus serviços responsáveis propagarem o contexto transacional
e receberem migrations e testes próprios.

`giro_user_runtime` é uma role-grupo `NOLOGIN`; o deploy deve conectar com uma role LOGIN dedicada
que seja membro dela (ou assuma essa role). A credencial administrativa ou `postgres` não prova RLS,
pois pode possuir `BYPASSRLS`. A troca da `DATABASE_URL` do user-service para essa credencial é uma
fronteira de configuração do deploy futuro: esta mudança não altera nenhuma variável de ambiente.

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

## Teste de integração opt-in

Após aplicar a migration em um banco isolado e criar dois tenants de teste, execute explicitamente:

```sh
node scripts/verify-user-service-rls.mjs \
  --admin-database-url "$TENANT_SECURITY_ADMIN_DATABASE_URL"
```

O script não é executado automaticamente e recebe somente a URL administrativa. Ele cria uma role
LOGIN aleatória, sem imprimir a senha, como membro de `giro_user_runtime`; autentica uma conexão com
essa role para validar membership, negação sem contexto e limpeza do contexto após `COMMIT`.

O seed de dois tenants, usuários, permissão e log é criado em uma única transação administrativa,
que sempre recebe `ROLLBACK`. Como PostgreSQL não expõe linhas não confirmadas a uma segunda conexão,
o teste de acesso ao tenant próprio, bloqueio entre tenants, login válido/inválido e insert de log
intencionalmente assume a role LOGIN temporária com `SET LOCAL ROLE` nessa mesma transação: isso
preserva o rollback do seed e ainda aplica as permissões e policies da role. A role e a conexão
temporárias são removidas no `finally`; o script não persiste linhas de aplicação.

O teste pressupõe que a migration já tenha sido aplicada e que a conta administrativa possa criar
roles. Ele nunca altera a configuração do user-service.

## Próximas etapas e reversão

Como `public` é um schema compartilhado pelos serviços atuais, a revogação global de `CREATE` e de
privilégios padrão de `PUBLIC` deve ocorrer em uma migration de hardening separada, após inventariar
todas as roles e grants de runtime. Antecipá-la nesta migration poderia interromper serviços ainda
dependentes dos privilégios herdados. A migration atual concede apenas os privilégios explícitos do
domínio do user-service.

Antes de habilitar RLS, cada serviço responsável deve propagar a organização autenticada para a
mesma transação das consultas e ter testes de isolamento. A migration do user-service altera schema,
roles, grants, RLS e a função privada de login; ela não altera dados de aplicação quando os
preflights passam. Uma reversão exige migration explícita, revisada e aplicada após confirmar que
nenhum runtime ainda usa `giro_user_runtime`: remover policies ou grants prematuramente pode expor
ou interromper acessos. O verificador opt-in sempre reverte apenas seu seed temporário e não reverte
a migration nem substitui validação em banco isolado.
