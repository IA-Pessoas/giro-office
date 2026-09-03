# Reconciliação das sessões do Super Admin legado

## Escopo e estado

Reparo **manual e específico para o schema legado**, fora de `prisma/migrations/`.
Preparado e testado localmente; isso não significa que foi aplicado no banco remoto.
Não executar junto com o deploy geral nem usar `prisma:migrate` (esse script chama `migrate dev`).

A migration `20260821200000_add_platform_auth_sessions` cria `PlatformRole`,
`platform_users` e seu índice de e-mail. O banco legado já possui esses objetos,
criados por `20260713100000_platform_super_admin`, mas não possui `session_version`
nem `platform_auth_sessions`. Executar a migration integralmente conflita no enum.

O arquivo [reconcile-platform-auth-sessions.sql](../../infra/prisma/repairs/reconcile-platform-auth-sessions.sql):

- Confere enum, as oito colunas antigas, defaults, nulabilidade, PK e unicidade do e-mail.
- Adiciona somente `platform_users.session_version INTEGER NOT NULL DEFAULT 0` e
  `platform_auth_sessions`, com PK, dois índices e FK `ON DELETE/UPDATE CASCADE`.
- Preserva usuários, senhas, enum existente e dependências de `platform_support_sessions`.
- Usa transação, `lock_timeout = 5s` e `statement_timeout = 30s`. Falhas abortam o reparo.
- Recusa schemas diferentes, reparos parciais e reaplicação; não usa `IF NOT EXISTS`
  para esconder objetos incompatíveis. Não altera `_prisma_migrations`.
- Habilita RLS na nova tabela e revoga acesso de `PUBLIC`, `anon` e `authenticated`
  (quando os papéis existem). Não muda permissões ou políticas das tabelas antigas.

A migration original permanece intacta para instalações sem o legado e para não
alterar checksums de ambientes que já a aplicaram. Este reparo não resolve os outros
arquivos ausentes do histórico nem aplica índices ou migrations de relatórios.

## Antes de qualquer escrita remota

1. Obter autorização para o ambiente alvo e confirmar backup com restauração testada.
2. Revalidar o schema e `_prisma_migrations` em leitura: em 26/08/2026 a migration
   nova estava pendente, e três migrations concluídas estavam ausentes do checkout:
   `20260713100000_platform_super_admin`, `20260819140000_require_user_organization`
   e `20260819150000_user_service_tenant_rls`. Não apagar ou reclassificar esses registros.
3. Confirmar o destino efetivo do Prisma. `infra/prisma.config.ts` prefere `DIRECT_URL`
   a `DATABASE_URL` e carrega dotenv. Usar conexão direta aprovada; não imprimir URLs
   ou copiar credenciais para arquivos versionados. A consulta antiga de `DATABASE_URL`
   não comprova que `DIRECT_URL` aponta ao mesmo banco.
4. Testar primeiro numa cópia isolada e coordenar uma janela sem deploy concorrente.
   O lock exclusivo de `platform_users` bloqueia leituras/gravações até o commit;
   o timeout limita a espera, não elimina indisponibilidade.
5. Identificar o papel de banco usado pelo user-service. A nova tabela deve ser acessível
   apenas ao backend. O proprietário e papéis com BYPASSRLS podem passar pelo RLS;
   um backend com outro papel precisa de permissões e política específicas revisadas.
   Não resolver falta de acesso desabilitando RLS ou concedendo acesso público.

## Aplicação controlada (somente após as verificações acima)

Os comandos abaixo **gravam no banco configurado**. Não fazem parte do teste local.
No diretório `infra`, com as variáveis do destino já configuradas com segurança:

```powershell
node node_modules/prisma/build/index.js db execute --config prisma.config.ts --file prisma/repairs/reconcile-platform-auth-sessions.sql
```

O arquivo contém `BEGIN`/`COMMIT`; executar inteiro e sem transação externa.
Se falhar, não executar `resolve`. Uma conexão interativa que ficou em transação
abortada deve receber `ROLLBACK`. Se o resultado do commit for incerto, conferir o
schema antes de repetir. Reaplicação falha deliberadamente sem resetar sessões.

## Verificação antes de reconciliar o histórico

Conferir no mesmo destino, em leitura, os campos com seus tipos/defaults/nulabilidade,
índices válidos e FK, comparando com a migration original. Não consultar ou imprimir
senhas, hashes de CSRF ou identificadores de sessões em logs.

```sql
SELECT table_name, column_name, data_type, datetime_precision, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('platform_users', 'platform_auth_sessions')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS index_name, i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid IN ('public.platform_users'::regclass, 'public.platform_auth_sessions'::regclass);

SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.platform_auth_sessions'::regclass,
                  'public.platform_support_sessions'::regclass);

SELECT relname, relrowsecurity, pg_get_userbyid(relowner) AS owner
FROM pg_class
WHERE oid = 'public.platform_auth_sessions'::regclass;
```

Resultado esperado: `session_version` inteiro obrigatório com default zero; seis colunas
da tabela de sessões; PK e índices `idx_platform_auth_sessions_user_state` e
`idx_platform_auth_sessions_expiry` válidos; FK nova com CASCADE e FKs antigas de suporte
preservadas com RESTRICT na exclusão; RLS habilitado na tabela nova. Verificar também
as permissões efetivas de `anon`, `authenticated` e do papel real do backend, e a
preservação dos registros antigos contra o snapshot anterior, sem expor seu conteúdo.

**Somente com todos os efeitos da migration confirmados**, registrar sua aplicação
pelo fluxo oficial de hotfix do Prisma, no mesmo diretório `infra` e mesmo destino:

```powershell
node node_modules/prisma/build/index.js migrate resolve --config prisma.config.ts --applied 20260821200000_add_platform_auth_sessions
node node_modules/prisma/build/index.js migrate status --config prisma.config.ts
```

`resolve` registra a migration; não cria os objetos ausentes. Não executá-lo antes
do reparo nem editar `_prisma_migrations` diretamente. `status` ainda pode reportar as
outras pendências; isso não autoriza `migrate deploy`, `reset`, `db push` ou seu descarte.

O SQL não desfaz mudanças já confirmadas. Após commit, uma reversão deve ser planejada
com os serviços parados e considerando sessões criadas desde então; não apagar a tabela
nem remover a coluna automaticamente. Testar login/logout do Super Admin com o backend
real antes de declarar a integração pronta.

## Teste local sem credenciais

Na raiz do worktree:

```powershell
node --test scripts/reconcile-platform-auth-sessions.test.mjs
```

Usa PGlite em memória, já transitivo do Prisma 7.9.1 fixado no lockfile; não carrega `.env`,
não abre conexão remota e não adiciona dependências. Sua resolução passa pelas dependências
do Prisma, sem caminho fixo para `.pnpm`; revisar esse teste ao atualizar o Prisma.
O gate foi adicionado ao workflow existente `super-admin-v2-ci.yml`.

Verifica compatibilidade com a instalação nova, preservação de registros/OID/FKs,
reaplicação recusada, drift recusado, rollback por falha intermediária e privacidade da
tabela nova. PGlite não valida carga, concorrência real nem as permissões do projeto Supabase.

Referências: [hotfix e histórico Prisma](https://docs.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing),
[RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security),
[PGlite em memória](https://pglite.dev/docs/).
