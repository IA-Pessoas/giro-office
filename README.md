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

## Deploy

O procedimento do ambiente VPS está documentado em [docs/vps-deploy.md](docs/vps-deploy.md).
