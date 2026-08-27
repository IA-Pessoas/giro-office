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
