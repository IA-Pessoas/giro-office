# Giro Office

O Giro Office é uma plataforma de gestão operacional para escritórios. O projeto reúne uma
aplicação web em Next.js, um gateway HTTP e serviços TypeScript para áreas como clientes,
tarefas, projetos, fiscal, contábil, RH e TI.

## Arquitetura

Este repositório é um monorepo gerenciado com pnpm e Turborepo:

- `app/`: interface web em Next.js;
- `services/gateway/`: API pública e roteamento para os serviços;
- `services/*-service/`: serviços de domínio;
- `infra/`: schema, migrations e seeds do Prisma;
- `packages/` e `shared/`: código compartilhado.

Em desenvolvimento, a aplicação web usa `http://localhost:3000` e o gateway usa
`http://localhost:3010`.

## Pré-requisitos

- Node.js 22;
- pnpm 9.15.0, conforme definido em `package.json`;
- PostgreSQL acessível pelos serviços;
- um projeto Supabase para os recursos que usam Auth ou Storage.

## Ambiente local

1. Ative a versão de pnpm do projeto e instale as dependências:

   ```bash
   corepack enable
   corepack prepare pnpm@9.15.0 --activate
   pnpm install --frozen-lockfile
   ```

2. Crie os arquivos de ambiente a partir dos exemplos:

   ```bash
   cp .env.example .env
   cp app/.env.example app/.env.local
   cp infra/.env.example infra/.env

   for env_file in services/*/.env.example; do
     cp "$env_file" "${env_file%.example}"
   done
   ```

   `regularize-service`, `ti-service` e `parcelamento-service` não possuem `.env.example`.
   Eles carregam as variáveis do `.env` da raiz; crie `services/<nome>/.env` somente quando
   precisar sobrescrever valores para um serviço.

3. Preencha os valores reais nos arquivos criados. Use a mesma `DATABASE_URL` e o mesmo
   `JWT_SECRET` nos componentes que compartilham banco e autenticação. Também configure
   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nos serviços que dependem do Supabase.

   Nunca exponha a `SUPABASE_SERVICE_ROLE_KEY` em variáveis `NEXT_PUBLIC_*` ou no código do
   cliente.

4. Gere os clientes Prisma e aplique as migrations:

   ```bash
   pnpm prisma:generate
   pnpm prisma:migrate
   ```

5. Inicie o ambiente de desenvolvimento:

   ```bash
   pnpm dev
   ```

6. Acesse:

   - aplicação: <http://localhost:3000>;
   - saúde do gateway: <http://localhost:3010/health>;
   - documentação OpenAPI: <http://localhost:3010/docs>.

`pnpm dev` inicia a aplicação, o gateway e os serviços do workspace. Para trabalhar em uma
parte isolada, use:

```bash
pnpm dev:app
pnpm dev:gateway
pnpm --filter @workspace/user-service dev
```

O último comando aceita qualquer pacote listado em `pnpm-workspace.yaml`.

## Verificações

Antes de abrir uma pull request, execute:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Pre-push

O hook seleciona os pacotes alterados e seus dependentes pelo grafo do Turbo.
Documentação dispensa verificações de código; mudanças globais validam todo o workspace.
O fluxo mantém lint, typecheck e testes. Mudanças em manifestos, lockfiles ou configuração
do gerenciador também executam a auditoria de dependências. No escopo global, os testes
dos scripts da raiz e o QA de integração continuam obrigatórios.

Os testes dos serviços executam os fontes e dispensam o build de produção do próprio
serviço. As dependências `^build` permanecem para preparar as bibliotecas e invalidar os
caches. O app mantém seu build porque os testes de navegador usam `next start`. Instale
o navegador local com `pnpm --filter @workspace/app exec playwright install chromium`.

A configuração do hook é derivada de `turbo.json` em `.turbo/git-hooks/turbo.pre-push.json`,
um artefato local ignorado pelo Git. `pnpm test` mantém a validação completa com builds.
O hook mostra o tempo de cada comando e suprime a repetição de logs de tarefas em cache.

```bash
# Inspecionar o plano sem executar as verificações
node scripts/git-hook-scope.mjs pre-push --dry-run
# Executar audit:ci, check, typecheck e test, inclusive sem alterações
node scripts/git-hook-scope.mjs pre-push --full
# Validar a seleção e o grafo de tarefas do hook
pnpm hooks:test
```

Sem uma base de comparação confiável, o hook conserva a sequência completa como fallback.
Falhas continuam bloqueando o push; os pré-requisitos locais devem estar instalados.

## Deploy

O procedimento do ambiente VPS está documentado em [docs/vps-deploy.md](docs/vps-deploy.md).
