# Task 6 — tipos, serviço e cache do frontend

## Escopo

- Worktree: `C:\Users\Davi.Araujo.173CASTELO.000\Desktop\Repositorios\GIROOFFICE LIMPO\.worktrees\codex-issue-1125`
- Branch: `codex/issue-1125`
- Base inicial: `0c0d9e75`

Foram alterados somente os seis arquivos de produto/teste permitidos e este relatório.
O Graphify do frontend não estava presente neste worktree (`app/graphify-out/AGENT_BRIEF.md`
inexistente), então a descoberta foi manual e limitada ao brief, plano, contrato
`@workspace/shared/regularize` e arquivos de escopo.

## RED

1. Ampliei `run-regularize-tests.mjs` antes do código de produção para exigir:
   - tipos de guidance consumindo `@workspace/shared/regularize`;
   - checklist, alvo, snapshot, filial e processo anulável;
   - filtros vazios omitidos e filtros por processo/alvo preservados;
   - query keys separadas por processo e `target_type`;
   - consulta independente habilitada pela opção da tela;
   - `updateGuidance` enviando `process_id` no payload.
2. Executei `corepack pnpm --filter @workspace/app test:regularize`.
3. Resultado: falha esperada na nova verificação, com `AssertionError` porque
   `types.ts` não correspondia a `/@workspace\/shared\/regularize/`.

## GREEN e refatoração

- `RegularizeGuidanceListFilters` agora aceita `process_id` e `target_type`
  opcionais.
- Os tipos de guidance usam o contrato compartilhado para alvo, snapshot,
  filial, código e status de checklist; `process_id` da resposta é anulável.
- Criação aceita processo opcional/nulo e payload completo; update mantém `id`
  e permite `process_id: RegularizeId | null`.
- `buildRegularizeGuidanceListParams` retorna `{}` sem filtros e nunca emite
  `process_id: ""`.
- A chave de guidance usa tanto `process_id` quanto `target_type`, distinguindo
  listagem total, processual e por alvo.
- `useRegularizeGuidance` envia `{}` para a consulta independente e respeita
  `options.enabled`; não constrói o filtro vazio legado.
- `updateGuidance` envia o payload recebido sem remover `process_id`. As quatro
  mutações legadas de atividade/sócio continuam preservando seu comportamento.
- A invalidação existente pela raiz `regularize` mantém cobertura de listas e
  detalhes sob o mesmo namespace de cache.
- Para preservar a compilação entre as Tasks 6 e 7 sem editar o formulário
  fora de escopo, a criação aceita a união temporária entre o payload legado
  processual e o payload completo novo; o payload completo exige alvo,
  snapshot e checklist. A Task 7 elimina o caminho legado no formulário.

## Validações

| Comando | Resultado |
| --- | --- |
| `corepack pnpm --filter @workspace/app test:regularize` (RED) | Falhou como esperado pela ausência do novo contrato compartilhado. |
| `corepack pnpm --filter @workspace/app test:regularize` (GREEN) | Passou: todas as verificações do runner, incluindo a nova cobertura. |
| `corepack pnpm --filter @workspace/app typecheck` | Primeiro revelou o payload legado do formulário e seis imports sem `@workspace/api`; após a união transitória de tipos, restaram apenas os imports. |
| `corepack pnpm --filter @workspace/api build` | Fallback local: gerou `packages/api/dist`, ausente no worktree. |
| `corepack pnpm --filter @workspace/app typecheck` (após build) | Passou (`tsc --noEmit && pnpm run typecheck:usefetch`). |
| `corepack pnpm --filter @workspace/app exec biome check ...` | Shim falhou: `'biome' não é reconhecido como um comando interno ou externo`. |
| `node_modules\\.bin\\biome.CMD check ...` | Executável local encontrado, mas a configuração raiz ignora `app/`: `No files were processed in the specified paths`. |
| `corepack pnpm --filter @workspace/app lint` | Fallback local executado; o script do pacote registrou `Skipping app lint (Biome ignored for now)`. |

Os comandos pnpm também emitiram avisos preexistentes: Node local `v24.13.1`
enquanto `services/src` pede Node 22, e `resolutions` fora da raiz do workspace.
Não foram alterados porque estão fora do escopo.
