# Task 2 — Relatório de execução

## Status

**BLOCKED / NEEDS_CONTEXT**

A Task 2 não foi implementada porque a policy proposta em `public.users` não é compatível com o
fluxo de autenticação atual nem com os usuários legados que o serviço ainda suporta. Criar o
helper e a migration mesmo assim produziria uma primitive unitariamente testável, mas uma
ativação de RLS que não pode ser adotada pelo runtime sem indisponibilizar rotas públicas.

Nenhuma migration foi criada ou aplicada. Nenhum banco foi acessado. Nenhuma role, credencial,
dependência ou arquivo `.env` foi criado ou alterado.

## Worktree revisada

- Caminho: `C:\Users\Davi.Araujo.173CASTELO.000\Desktop\Repositorios\GIROOFFICE-issue-778`
- Branch: `codex/issue-778-tenant-rls-least-privilege`
- Base da Task 2: `d29b116d` (`feat(security): inventory tenant database ownership`)
- Estado inicial: limpo, um commit à frente de `origin/develop`
- Graphify: indisponível porque `services/graphify-out/graph.json` não existe; foi usada descoberta
  manual conforme `AGENTS.md`.

## Evidência do bloqueio

### 1. O login precisa ler `users` antes de conhecer um tenant autenticado

O contrato de login aceita somente `login` e `password`
(`services/user-service/src/schemas/auth.schemas.ts`). A rota pública passa esses campos para
`AuthService.login`, que executa `prismaClient.user.findFirst({ where: { login } })` antes de
validar senha, membership e organização (`services/user-service/src/services/authService.ts`).

A policy do brief é deny-by-default sem `app.organization_id`:

```sql
USING (organization_id = current_setting('app.organization_id', true))
```

Logo, a conexão de `giro_user_runtime` sem contexto não encontra usuário algum e nenhum login
consegue chegar à etapa que valida a membership e deriva a organização. Definir o GUC a partir do
body/query violaria explicitamente o limite de confiança da issue.

Não há outro client/role de banco no user-service: `src/prisma/index.ts` cria um único
`PrismaClient` com `getUserServiceEnv().databaseUrl`, e `src/config/env.ts` expõe uma única
`DATABASE_URL`.

### 2. O bootstrap público também exige acesso sem tenant

`POST /user/start-config` é público e `AuthService.firstCreate` consulta `users`, depois
`organizations` e `departments`, antes de criar o primeiro usuário. Ainda não existe identidade ou
membership autenticada nesse fluxo. A mesma policy impediria detectar banco vazio e criar o
primeiro usuário caso a conexão use a role protegida.

### 3. A policy proposta excluiria usuários legados válidos

`User.organization_id` é nullable no Prisma. `UserService.userOrganizationWhere` e os testes de
`authService`/`userService` preservam explicitamente usuários cujo tenant vem de
`department.organization_id` quando `users.organization_id IS NULL`.

A expressão proposta compara apenas `users.organization_id` ao GUC. Para registros legados o
resultado é `NULL`, portanto esses usuários não podem ler a própria linha, validar sessão nem
autenticar. A Task 2 não inclui backfill comprovado, constraint `NOT NULL` ou policy compatível com
esse vínculo indireto.

### 4. A troca efetiva para uma role de menor privilégio não está desenhada

A migration proposta referencia `giro_user_runtime`, mas o runtime só recebe uma URL de banco.
Não há configuração para selecionar uma role por fluxo autenticado/pré-autenticado, nem entrega de
credencial fora do repositório. Criar a policy sem provar que a conexão efetiva é uma role sem
owner/`BYPASSRLS` daria falsa segurança; trocar toda a URL para a role protegida quebraria os dois
fluxos acima.

### 5. Não há banco descartável para uma prova de integração

`TENANT_SECURITY_TEST_DATABASE_URL` não está presente no ambiente. A worktree também não possui
`node_modules`; nenhuma instalação foi feita porque o bloqueio é arquitetural e ocorre antes da
verificação de runtime. Não foi inventado resultado para o teste de integração exigido.

## Decisão de segurança

Foram deliberadamente omitidos:

- `withTenantTransaction`, porque usá-lo apenas onde a organização já existe não resolve login e
  bootstrap, e exportá-lo isoladamente faria a etapa parecer adotável sem ser;
- wiring parcial de `AuthService`/`UserService`, porque deixaria consultas a `users` fora do mesmo
  modelo de acesso;
- a migration RLS, porque ela não tem um caminho runtime seguro e demonstrado;
- role com owner, `BYPASSRLS` ou `CREATE`, policy `USING (true)`, contexto vindo de body/query,
  `SET` de sessão ou função privilegiada improvisada;
- script de integração que apenas inspecionasse SQL ou mocks; isso não prova isolamento no
  PostgreSQL real.

Essa decisão segue o corte do design: a primeira policy só pode ser aplicada depois que **todas**
as consultas afetadas permanecerem num fluxo seguro e testado. As recomendações atuais do
Supabase também exigem RLS com autorização real, role explícita na policy e testes de isolamento,
não apenas filtro de aplicação: <https://supabase.com/docs/guides/database/postgres/row-level-security>.

## Decisão arquitetural necessária

É necessário escolher e especificar um caminho de pré-autenticação antes de retomar a Task 2. Os
caminhos seguros plausíveis têm impactos de contrato e segurança que excedem este brief:

1. migrar autenticação para uma identidade externa confiável que forneça o tenant antes da consulta
   tenant-scoped;
2. criar um diretório global mínimo de identidade/login separado de `users`, sem dados de tenant,
   que resolva uma membership candidata antes da transação;
3. aprovar um endpoint SQL de pré-autenticação rigorosamente limitado (por exemplo, função privada
   e grants mínimos), com threat model e teste real — não deve ser introduzido implicitamente;
4. definir o tratamento de `users.organization_id IS NULL`: backfill + `NOT NULL`, ou policy
   explícita baseada na membership/department com índices e testes correspondentes;
5. definir como o user-service recebe a credencial da role não-owner em runtime e como o bootstrap
   administrativo é executado fora dessa role.

## Comandos e resultados

- `git worktree list --porcelain` / `git status --short --branch`: worktree e branch corretas,
  estado limpo.
- `corepack pnpm graphify:context:services -- "..."`: falhou porque o grafo local não existe;
  fallback manual aplicado.
- `Test-Path Env:TENANT_SECURITY_TEST_DATABASE_URL`: `False`.
- `rg` e leitura direta dos arquivos citados: confirmaram o fluxo circular, a única URL Prisma e o
  suporte legado nullable.
- Testes não executados: não houve produção implementada e as dependências da worktree estão
  ausentes. O bloqueio não é uma falha de teste; é uma precondição arquitetural não satisfeita.

## Critério de desbloqueio

A Task 2 pode voltar a `IN_PROGRESS` quando houver decisão explícita para os cinco itens acima e
uma URL PostgreSQL descartável. Só então o ciclo TDD deve provar: RED do helper; GREEN do contexto
transaction-local; todas as consultas `users` do runtime na transação correta; login/bootstrap no
modelo aprovado; own/cross/missing/alternating tenant no PostgreSQL; role sem owner,
`BYPASSRLS`/`CREATE`; e ausência de vazamento após commit/rollback.
