# Issues #517/#518 - Fiscal listagem, paginacao e busca dinamica

## Contexto
- Worktree: `.worktrees/issues-517-518-fiscal-pagination-dynamic-search`
- Branch: `fix/issues-517-518-fiscal-pagination-dynamic-search`
- Issues:
  - https://github.com/IA-Pessoas/giro-office/issues/517
  - https://github.com/IA-Pessoas/giro-office/issues/518
- Escopo: frontend Fiscal e fiscal-service.

## Causa provavel
As abas NCM, ICMS e IPI so chamam a API depois de uma busca submetida e os services retornam `[]` quando a lista de termos vem vazia. Alem disso, os filtros usam `in`, entao a busca exige valores exatos e nao preserva paginacao de resultados parciais.

## Plano
1. Adicionar teste focado em `app/src/modules/fiscal/run-fiscal-tests.mjs` cobrindo:
   - hooks habilitados sem termo inicial;
   - params de pagina e `page_size` no contrato app;
   - UI usando debounce e `PaginationControls`;
   - schemas/routes/services do fiscal-service aceitando termos opcionais e usando `contains` paginado.
2. Backend:
   - adicionar schema simples de paginacao em fiscal-service;
   - tornar `ncmCodes`, `icmsCodes`, `ipiCodes` opcionais;
   - manter os nomes de query params atuais;
   - retornar `{ data, total, page, limit, hasMore }`;
   - usar busca parcial case-insensitive com `contains`.
3. Frontend:
   - fazer as tres abas carregarem a primeira pagina ao abrir;
   - aplicar busca dinamica com debounce;
   - limpar busca voltando para listagem paginada;
   - preservar termo atual ao paginar;
   - remover validacao de tamanho fixo do IPI.
4. Validar:
   - `pnpm --filter @workspace/app run test:fiscal`
   - `pnpm --filter @workspace/app run typecheck`
   - `pnpm --filter @workspace/fiscal-service test` (registrar bloqueio se o runner Vitest continuar falhando no ambiente)
   - `pnpm --filter @workspace/fiscal-service typecheck`
   - screenshot Playwright das abas fiscais com listagem/busca/paginacao.
5. Revisao local, commit, push `--no-verify` e PR draft.

## Fora de escopo
- Redesenhar a Central Fiscal.
- Alterar endpoints publicos alem de aceitar pagina/termos opcionais.
- Adicionar dependencias.
