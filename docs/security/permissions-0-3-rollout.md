# Rollout e rollback das permissões modulares 0–3

Este runbook é a evidência operacional da issue #567. A janela deve ser executada com as escritas
bloqueadas e com backend, migration e frontend publicados como uma unidade compatível.

## Pré-condições e backup

1. Confirmar a SHA do backend/frontend que será publicada e registrar o operador, horário e ambiente.
2. Bloquear novas escritas no gateway e confirmar que o bloqueio está ativo.
3. Criar o backup do banco usando o procedimento oficial do ambiente.
4. Validar que o arquivo do backup pode ser lido e registrar seu checksum:

```sh
sha256sum /path/para/backup.sql
```

5. Registrar as contagens anteriores por módulo e valor antes de aplicar a migration:

```sql
SELECT 'fiscal' AS module, fiscal AS level, count(*)
FROM permissions GROUP BY fiscal
UNION ALL
SELECT 'integracao', integracao, count(*)
FROM permissions GROUP BY integracao;
```

Executar a mesma consulta para todos os módulos ativos listados em `shared/src/auth/modules.ts`.

## Aplicação e validação

1. Aplicar as migrations Prisma com o release que contém `20260727160000_normalize_permission_levels`.
2. Publicar o backend e o frontend compatíveis antes de liberar as escritas.
3. Executar as evidências automatizadas:

```sh
pnpm --filter @workspace/shared build
pnpm --filter @workspace/shared exec tsx --test tests/auth-policy.test.ts tests/module-permissions.test.ts
pnpm --filter @workspace/gateway exec vitest run src/test/modulePermissionRegression.test.ts
pnpm --filter @workspace/user-service exec vitest run src/test/authService.test.ts src/test/auth.routes.test.ts src/test/permissionService.test.ts src/test/permission.routes.test.ts
pnpm --filter @workspace/app test:auth
pnpm --filter @workspace/app test:users
command -v psql
PERMISSION_MIGRATION_REQUIRED=1 PERMISSION_MIGRATION_DATABASE_URL="$DATABASE_URL" \
  node --test scripts/permission-normalization.test.mjs
pnpm smoke:coverage
```

4. Confirmar que cada módulo ativo contém somente `0..3`, que as colunas são `NOT NULL` com default
   `0`, que os módulos `atendimento`, `pec` e `wiki` não existem e que as contagens pós-migration
   correspondem à transformação `null → 0`, `0 → 1`, `1 → 2`, `2 → 3`.
5. Executar smoke autenticado para níveis `0`, `1`, `2`, `3` e `owner`, incluindo organização A/B,
   sessão revogada, tentativa de alteração por não-owner, URL protegida direta e navegação visível.
6. Liberar as escritas somente após os checks anteriores e registrar os resultados na issue #567.

O teste PostgreSQL deve terminar sem `skipped`; se `DATABASE_URL` ou `psql` não estiverem disponíveis,
a janela deve permanecer bloqueada. O modo padrão local pode pular esse ensaio por não ter um banco,
mas não substitui a evidência do ambiente controlado.

## Falha antes da reabertura

Se qualquer validação falhar antes de liberar as escritas:

1. manter o bloqueio;
2. publicar a versão anterior compatível;
3. restaurar o backup validado;
4. repetir contagens, smoke e a matriz de autorização;
5. registrar a causa e a evidência antes de encerrar a janela.

Depois de novas escritas, não restaurar um backup antigo. Fazer roll-forward com migration de reparo,
preservando as novas escritas e registrando a decisão operacional.
