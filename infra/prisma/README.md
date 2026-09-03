# Preflight de colisões globais de login

Execute antes da migration que tornará `users.login` globalmente único:

```sh
pnpm --filter @workspace/infra prisma:preflight:global-login
```

O script abre uma transação `REPEATABLE READ READ ONLY` e retorna somente login, IDs e status
de usuários e organizações. Ele nunca modifica dados, não imprime a URL de conexão e não seleciona
nomes, senhas, hashes, cookies ou tokens.

- Código `0`: `migrationStatus` é `READY`; a migration pode prosseguir.
- Código `2`: `migrationStatus` é `BLOCKED_BY_GLOBAL_LOGIN_COLLISIONS`; não aplique a migration.
- Código `1`: houve falha técnica; corrija a conectividade/configuração e repita o preflight.

Quando estiver bloqueado, trate cada login listado pelo fluxo administrativo autorizado, escolhendo
e atribuindo logins distintos aos usuários envolvidos. Em seguida, execute o preflight novamente;
aplique a migration somente com relatório vazio.

## Migration e rollback

A migration também verifica colisões no próprio banco antes de criar o índice único, portanto ela
falha sem alterar o schema se um login duplicado surgir entre o preflight e a aplicação. Ela adiciona
`users.version`, iniciado em `1`, para permitir compare-and-swap nas edições.

Em uma reversão operacional, interrompa escritores da aplicação e execute manualmente o
`rollback.sql` da migration para remover somente o índice. A coluna de versão é preservada para não
descartar histórico de concorrência; versões anteriores da aplicação a ignoram com segurança.
