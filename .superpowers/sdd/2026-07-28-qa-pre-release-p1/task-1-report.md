# Task 1 Report - Issue #521

## Status

Implementado na branch `fix/issue-521-rh-own-evaluations`.

## Escopo

- Alterado `services/rh-service/src/services/scoreEvaluationService.ts`.
- Alterado `services/rh-service/src/routes/scoreEvaluation.routes.ts`.
- Alterado `services/rh-service/src/test/scoreEvaluationService.test.ts`.
- Alterado `services/rh-service/src/test/scoreEvaluation.routes.test.ts`.
- Alterado `services/rh-service/src/test/rhTestUtils.ts` para permitir testar `rh_permission` 1 e 3 nas rotas.

## TDD

### RED

1. Adicionei teste de service para garantir que usuário RH não gestor lista apenas avaliações com:
   - `organization_id` da requisição;
   - `evaluator_id` igual ao usuário autenticado;
   - `scoreQuarter.user_id` igual ao usuário autenticado.
2. Adicionei teste de service para rejeitar submit self-service de avaliação cujo score pertence a outro usuário.
3. Adicionei testes de rota para provar repasse de `can_manage: false` em self-service e `true` em gestão RH.
4. Rodei o comando focado do brief:
   - `corepack pnpm --filter @workspace/rh-service vitest run src/test/scoreEvaluationService.test.ts src/test/scoreEvaluation.routes.test.ts`
   - Resultado: falhou porque o pacote não possui script `vitest`.
5. Instalei dependências via lockfile e rodei a forma equivalente:
   - `corepack pnpm --filter @workspace/rh-service test -- src/test/scoreEvaluationService.test.ts src/test/scoreEvaluation.routes.test.ts`
   - Resultado: Vitest falhou no startup antes de carregar testes com `ERR_PACKAGE_IMPORT_NOT_DEFINED: Package import specifier "#module-evaluator" is not defined` em Node `v24.13.1`.
6. Como evidência RED alternativa, rodei `corepack pnpm --filter @workspace/rh-service exec tsc --noEmit`.
   - Resultado: além de erros ambientais de módulos workspace/Prisma ainda não gerados, os testes novos falharam contra a assinatura antiga:
     - `Expected 2 arguments, but got 3.`
     - `'can_manage' does not exist in type 'SubmitScoreEvaluationInput'.`

### GREEN

1. `listPendingEvaluations(organizationId, userId, canManage)` agora usa escopo self-service quando `canManage` é falso:
   - `evaluator_id: uid`;
   - `scoreQuarter: { user_id: uid }`;
   - sem resolver papéis genéricos.
2. Gestão RH mantém a resolução anterior por `resolveGenericEvaluatorRoles`.
3. `submitEvaluation` agora recebe `can_manage`.
4. Para self-service, `submitEvaluation` exige simultaneamente:
   - `evaluation.evaluator_id === user_id`;
   - `evaluation.scoreQuarter.user_id === user_id`.
5. Para gestão RH, o fluxo anterior de `userCanActOnEvaluation` foi preservado.
6. As rotas `GET /pending` e `POST /submit` passam `canManageRh(req)` ao service.

## Verificações

- `corepack pnpm install --frozen-lockfile`
  - Passou.
  - Necessário porque não havia `node_modules` na worktree.
- `corepack pnpm --filter @workspace/shared build`
  - Passou.
  - Necessário porque `@workspace/rh-service typecheck` depende de `@workspace/shared/dist`.
- `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/db'; corepack pnpm --filter @workspace/rh-service typecheck`
  - Passou.
  - `DATABASE_URL` dummy usado apenas para permitir `prisma:generate`; não houve acesso a banco real.
- `corepack pnpm exec biome check services/rh-service/src/services/scoreEvaluationService.ts services/rh-service/src/routes/scoreEvaluation.routes.ts services/rh-service/src/test/scoreEvaluationService.test.ts services/rh-service/src/test/scoreEvaluation.routes.test.ts services/rh-service/src/test/rhTestUtils.ts`
  - Passou.
- `corepack pnpm --filter @workspace/rh-service test`
  - Não executou testes por falha de startup do Vitest:
    - `ERR_PACKAGE_IMPORT_NOT_DEFINED: Package import specifier "#module-evaluator" is not defined`.
    - Ambiente observado: Node `v24.13.1`.

## Auto-revisão

- Conferi call sites de `listPendingEvaluations` e `submitEvaluation`; só as rotas e testes relevantes usam essas assinaturas.
- Conferi `git diff --stat`; mudanças restritas aos 5 arquivos da issue.
- Não alterei OpenAPI, gateway, migrations, schemas ou outras worktrees.
- Não fiz push nem PR.

## Riscos

- A suíte Vitest não pôde ser executada nesta máquina por erro de startup do runner no Node atual.
- O typecheck oficial passou, mas a confirmação runtime dos testes adicionados depende de rodar Vitest em ambiente compatível.

## Complemento da revisao - POST submit gerencial

### Alteracao

- Adicionado teste explicito em `services/rh-service/src/test/scoreEvaluation.routes.test.ts` para `POST /rh/score/evaluations/submit` com `rh_permission=3`, verificando que `scoreEvaluationServiceMock.submitEvaluation` recebe `can_manage: true`.
- Nenhum arquivo de producao foi alterado.

### Verificacoes

- `corepack pnpm --filter @workspace/rh-service test -- src/test/scoreEvaluation.routes.test.ts`
  - Nao executou testes por falha de startup do Vitest:
    - `ERR_PACKAGE_IMPORT_NOT_DEFINED: Package import specifier "#module-evaluator" is not defined`.
    - Ambiente observado: Node `v24.13.1`.
- `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/db'; corepack pnpm --filter @workspace/rh-service typecheck`
  - Passou.
- `corepack pnpm exec biome check services/rh-service/src/test/scoreEvaluation.routes.test.ts`
  - Passou.

### Riscos

- A cobertura foi adicionada, mas a execucao runtime do Vitest continua bloqueada pelo Node 24 nesta maquina.
## Complemento da re-revisao - fixture POST submit gerencial

### Alteracao

- Corrigido `services/rh-service/src/test/scoreEvaluation.routes.test.ts` para usar `setRhRoutePermission(3)` no teste gerencial de `POST /rh/score/evaluations/submit`, alinhando o fixture com `canManageRh` (`rh_permission >= 3`) e mantendo a prova de `can_manage: true`.
- Nenhum arquivo de producao foi alterado.

### Verificacoes

- `corepack pnpm --filter @workspace/rh-service test -- src/test/scoreEvaluation.routes.test.ts`
  - Nao executou testes por falha de startup do Vitest:
    - `ERR_PACKAGE_IMPORT_NOT_DEFINED: Package import specifier "#module-evaluator" is not defined`.
    - Ambiente observado: Node `v24.13.1`.
- `corepack pnpm exec biome check services/rh-service/src/test/scoreEvaluation.routes.test.ts .superpowers/sdd/2026-07-28-qa-pre-release-p1/task-1-report.md`
  - Passou; Biome checou 1 arquivo TS e nao aplicou fixes.
- `$env:DATABASE_URL='postgresql://user:pass@localhost:5432/db'; corepack pnpm --filter @workspace/rh-service typecheck`
  - Passou.

### Riscos

- A execucao runtime do Vitest continua bloqueada pelo Node 24 nesta maquina; a validacao automatizada executavel nesta rodada ficou em Biome e typecheck.
