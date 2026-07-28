# Task 3 Report - Issue #525

## Status

Implementado na branch `fix/issue-525-ti-viewer-dashboard`.

## Mudancas

- `GET /ti/dashboard` agora aceita `TiPermissionLevel.Viewer`.
- `TiDashboardService.getSummary` recebe o contexto completo de TI.
- Para `Viewer`, todos os contadores de chamados usam `requester_id: context.userId`.
- Para `Viewer`, o payload retorna `scope: "self"` e somente metricas de chamados:
  - `openRequests`
  - `criticalRequests`
  - `resolvedLastSevenDays`
  - `closedRequests`
- Para tecnico/admin, o payload retorna `scope: "organization"` e preserva as metricas globais existentes, com `closedRequests` adicionado.
- Schema Zod, OpenAPI e tipo frontend foram alinhados ao contrato por `scope`.
- Self-service agora mostra a aba Dashboard.
- `TiDashboardTab` renderiza a visao `self` sem metricas globais e usa erro amigavel fixo.

## Testes e verificacoes

- `corepack pnpm --filter @workspace/app exec node src/modules/ti/run-ti-tests.mjs`: passou.
- `corepack pnpm --filter @workspace/app typecheck`: passou.
- `corepack pnpm --filter @workspace/ti-service exec tsc --noEmit`: passou.
- `corepack pnpm --filter @workspace/ti-service check`: passou.
- `corepack pnpm --filter @workspace/app check`: passou; script do pacote informa `Skipping app check (Biome ignored for now)`.
- `git diff --check`: passou.

## Teste bloqueado

- `corepack pnpm --filter @workspace/ti-service test -- src/test/tiDashboardService.test.ts src/test/tiDashboard.routes.test.ts`: bloqueado antes de executar testes por erro de startup do Vitest:
  - `TypeError [ERR_PACKAGE_IMPORT_NOT_DEFINED]: Package import specifier "#module-evaluator" is not defined`
  - Ambiente observado: `node v24.13.1`, `vitest@4.1.9`, `vite@7.3.5`.
  - O `vite@7.3.5` instalado nao declara o import interno `#module-evaluator` esperado pelo runner.

## Auto-revisao

- Sem achados criticos.
- Confirmado que a visao `self` retorna antes de consultar `department`, inventario, termos, estoque ou robos.
- Confirmado que permissao `0` continua negada; no codigo real `TiPermissionLevel.Viewer` e `1`.
- Risco residual: a regressao Vitest de service/route foi escrita, mas nao executou por incompatibilidade do runner/dependencia nesta worktree.
