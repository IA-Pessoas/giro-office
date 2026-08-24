# Tarefa 4 — Consultas globais de usuários com escopo explícito

## Commit

`97f12806 feat(platform): add scoped global user queries`

## Arquivos

- `services/user-service/src/routes/platformUsers.routes.ts`
- `services/user-service/src/schemas/platformUsers.schemas.ts`
- `services/user-service/src/services/platformUsersService.ts`
- `services/user-service/src/test/platformUsersService.test.ts`
- `services/user-service/src/test/platformUsers.routes.test.ts`
- `services/user-service/src/app.ts`
- `services/user-service/src/openapi/spec.ts`
- `scripts/all-services-smoke.manifest.mjs`

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
