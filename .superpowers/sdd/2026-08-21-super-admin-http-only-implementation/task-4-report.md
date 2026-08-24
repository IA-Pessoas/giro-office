# Tarefa 4 — Consultas globais de usuários com escopo explícito

## Commit

- `95aaaa86 feat(platform): add scoped global user queries`
- `aac7bd3e fix(platform): harden global user pagination`
- `984d1319 fix(platform): align skip limit in OpenAPI`

## Arquivos

- `services/user-service/src/routes/platformUsers.routes.ts`
- `services/user-service/src/schemas/platformUsers.schemas.ts`
- `services/user-service/src/services/platformUsersService.ts`
- `services/user-service/src/test/platformUsersService.test.ts`
- `services/user-service/src/test/platformUsers.routes.test.ts`
- `services/user-service/src/app.ts`
- `services/user-service/src/openapi/spec.ts`
- `scripts/all-services-smoke.manifest.mjs`
- `infra/prisma/schema.prisma`
- `infra/prisma/migrations/20260824120000_add_users_organization_name_id_index/migration.sql`

## RED / GREEN

- RED: o teste de serviço falhou como esperado porque `PlatformUsersService` ainda não existia.
- GREEN: seis testes focados passaram, cobrindo filtro obrigatório por organização nas duas consultas, busca, paginação limitada, resposta `hasMore`, 200, 401, 403 e query inválida.

## Validações

- Biome escopado: 8 arquivos passaram.
- Vitest escopado: 6 testes passaram.
- Typecheck de `@workspace/user-service`: passou.
- `git diff --check`: passou.

## Riscos e bloqueios externos

- O comando prescrito `corepack pnpm --filter @workspace/user-service exec vitest ...` não encontra `vitest` neste worktree; o binário local equivalente executou RED e GREEN.
- O `check` completo de `user-service` falha por erros pré-existentes de organização/formatação em `permission.routes.ts`, `user.routes.ts`, `permission.schemas.ts`, `bootstrapPlatformAdmin.ts` e seu teste; os 8 arquivos desta tarefa passaram isoladamente.
- `pnpm smoke:coverage` permanece bloqueado por pendências pré-existentes: `services/src` ausente do registry e três operações DELETE de `fiscal-service` sem entradas no manifesto. A operação nova não aparece como pendência porque só será exposta pelo gateway em tarefa posterior.

## Complemento de paginação

- `skip` limitado a `10_000`, com teste HTTP para o limite excedido.
- Ordenação estabilizada por `name` e `id`, com expectativa atualizada no teste de serviço.
- Índice Prisma composto em `User(organization_id, name, id)` e migration forward-only contendo somente o `CREATE INDEX` equivalente.
- Nenhuma migration foi aplicada e nenhum banco externo foi acessado.
- Biome escopado: 4 arquivos passaram.
- `git diff --cached --check`: passou antes do commit.
- Vitest focado bloqueado: `'vitest' não é reconhecido como um comando interno ou externo, um programa operável ou um arquivo em lotes.`
- `prisma validate` com URL sintética bloqueado: `'prisma' não é reconhecido como um comando interno ou externo, um programa operável ou um arquivo em lotes.`
- Typecheck bloqueado: `EPERM: operation not permitted, mkdir 'C:\Users\Davi.Araujo.173CASTELO.000\Desktop\Repositorios\GIROOFFICE-issue-869\.turbo\prisma\generate.lock'`.

## Correção OpenAPI

- O parâmetro `skip` agora documenta `maximum: 10_000`, alinhado ao schema Zod do runtime.
- RED: o teste de spec falhou com `Expected maximum: 10000` ausente no schema recebido.
- GREEN: 6 testes passaram em `platformUsers.routes.test.ts`.
- Biome escopado: 2 arquivos passaram.
- `git diff --cached --check`: passou antes do commit.
