# Task 2 Report - Issue #522

## Status

Implementado somente o escopo da issue #522 na branch `fix/issue-522-contabil-viewer-read`.

## Mudancas

- Gateway libera `GET /client/list` para viewer com permissao modular relacionada, incluindo `contabil: 0`, sem reduzir a exigencia das demais rotas `/client`.
- Gateway encaminha para o `contabil-service` o token interno e a permissao modular `contabil`.
- `contabil-service` adiciona `requireContabilWritePermission` e bloqueia `POST`, `PUT`, `PATCH` e `DELETE` para permissao menor que 1.
- UI do controle contabil usa `GET /contabil/controls` para viewer e preserva bootstrap `POST` apenas para editores.

## TDD

- Red do app confirmado: `@workspace/app test:contabil` falhou em `viewer control section reads existing control without bootstrap write` por ausencia de `useContabilControlDetail`.
- Reds de gateway/servico foram escritos, mas o Vitest nao executou nenhum teste por erro de bootstrap do runner no Node `v24.13.1`: `ERR_PACKAGE_IMPORT_NOT_DEFINED: #module-evaluator`.
- Green do app confirmado depois do production code.

## Validacao

- `corepack pnpm install --frozen-lockfile`: passou.
- `corepack pnpm --filter @workspace/shared build`: passou.
- `corepack pnpm --filter @workspace/api build`: passou.
- `corepack pnpm --filter @workspace/app run test:contabil`: passou.
- `corepack pnpm --filter @workspace/gateway typecheck`: passou.
- `corepack pnpm --filter @workspace/app typecheck`: passou.
- `corepack pnpm --filter @workspace/contabil-service prisma:generate` com `DATABASE_URL` dummy e escalado: passou.
- `corepack pnpm --filter @workspace/contabil-service exec tsc --noEmit`: passou.
- `corepack pnpm --filter @workspace/contabil-service check`: passou.
- `corepack pnpm --filter @workspace/gateway exec biome check src/security/policies.ts src/config/serviceRegistry.ts src/app.routes.test.ts`: passou.
- `corepack pnpm --filter @workspace/contabil-service exec biome check ...arquivos tocados...`: passou.
- `corepack pnpm --filter @workspace/app exec tsc --noEmit --pretty false`: passou.
- `git diff --check`: passou.

## Bloqueios

- `corepack pnpm --filter @workspace/gateway test -- src/app.routes.test.ts` falhou antes dos testes por erro de bootstrap do Vitest: `ERR_PACKAGE_IMPORT_NOT_DEFINED: #module-evaluator`.
- `corepack pnpm --filter @workspace/contabil-service test -- src/test/control.routes.test.ts src/test/responsible.routes.test.ts src/test/relationship.routes.test.ts` falhou pelo mesmo erro de bootstrap do Vitest.
- `corepack pnpm --filter @workspace/gateway check` completo falhou em `src/app.ts` por organizeImports preexistente em arquivo nao alterado nesta issue.

## Auto-revisao

- `rg` confirmou guard em todos os `POST`, `PUT`, `PATCH` e `DELETE` de controle, responsavel e relacionamento contabil.
- `git status --short` antes do commit mostrava apenas arquivos da issue e este relatorio.
- Nenhum push ou PR foi feito.
