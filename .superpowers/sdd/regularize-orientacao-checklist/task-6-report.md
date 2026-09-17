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

## Fix round 1 — contrato ponta a ponta

Esta rodada ampliou explicitamente o escopo de produto para o cliente frontend e
para o contrato backend de guidance. Além dos seis arquivos originais, foram
alterados os schemas, serviço, rota, OpenAPI e testes focados de
`services/regularize-service`, sem tocar Prisma ou `shared`.

### Ajustes implementados

- A entrada e a resposta agora têm tipos distintos: create/update usam
  `checklist` com os 17 itens `{ code, status, observation? }`, enquanto a
  resposta mantém `checklist_items` com id, label, metadados e observação
  nullable.
- A entrada usa `RegularizeGuidanceManualSnapshot` com `source: "manual"`;
  `RegularizeGuidanceSnapshot` continua reservado à resposta e snapshots
  originados de cadastro não são aceitos como snapshot manual de entrada.
- `UpdateRegularizeGuidancePayload` exige somente `id`; os demais campos,
  incluindo `type`, `status`, campos legados, `process_id` nullable, checklist,
  snapshot manual e branch_data não-null, são parciais.
- O GET de guidance/list aceita `target_type` (`PJ`, `PF`, `SEM_CLIENTE`) e o
  serviço aplica o filtro junto com `organization_id`, preservando isolamento.
  O OpenAPI documenta o parâmetro.
- O POST envia o payload completo com `checklist`; o caller legado nomeado
  `LegacyGuidanceDraft` é rejeitado antes do HTTP com erro explícito que aponta
  a migração da Task 7. O hook permanece temporariamente compatível com a união
  apenas para manter a tela antiga compilando.
- A consulta independente só é habilitada quando `useRegularizeGuidance()` é
  chamada com `{ enabled: true }`; as chaves e os parâmetros distinguem
  processo e alvo e omitem `process_id` vazio.

### RED adicional

O runner estático foi ampliado antes dos ajustes para exigir a separação entre
`checklist` e `checklist_items`, o snapshot manual, update parcial, filtro por
`target_type`, rejeição do draft legado e ausência de consulta independente
implícita. Os testes backend também foram ampliados para schema, isolamento da
listagem, rota e OpenAPI.

### Evidências do fix

| Comando | Resultado |
| --- | --- |
| `corepack pnpm --filter @workspace/app test:regularize` | Passou; runner completo verde. |
| `corepack pnpm --filter @workspace/regularize-service exec vitest run ...` | Shim falhou: `'vitest' não é reconhecido como um comando interno ou externo`. |
| `services/regularize-service/node_modules/.bin/vitest.CMD run ...` | Fallback local passou: 4 arquivos, 92 testes. |
| `corepack pnpm --filter @workspace/app typecheck` | Passou. |
| `corepack pnpm --filter @workspace/regularize-service typecheck` | Passou. |
| `corepack pnpm --filter @workspace/regularize-service build` | Passou. |
| `corepack pnpm --filter @workspace/app exec biome check ...` | Shim falhou: `'biome' não é reconhecido como um comando interno ou externo`. |
| `node_modules/.bin/biome.CMD check` nos arquivos backend | Passou: 8 arquivos, sem ajustes. |
| `node_modules/.bin/biome.CMD check` nos arquivos app | Configuração raiz ignora `app/`: `No files were processed`. |
| `corepack pnpm --filter @workspace/app lint` | Fallback do pacote passou, registrando `Skipping app lint (Biome ignored for now)`. |
| `git diff --check` | Passou, sem whitespace errors. |

Os comandos pnpm mantiveram os avisos ambientais já registrados: Node local
`v24.13.1` enquanto `services/src` pede Node 22, além de avisos de configuração
do pnpm fora da raiz.

## Fix round 2 — filtros e payload de update

- `useRegularizeGuidance` agora só habilita consulta escopada quando existe
  `process_id` ou `target_type` não vazio, rejeitando `{}`, `process_id: ""`,
  `target_type: ""` e combinações com qualquer filtro vazio. Consulta geral
  permanece exclusiva de `filters === undefined` com `options.enabled === true`.
- O runner estático ganhou assertions para a função de política, os dois
  filtros vazios e a consulta geral explicitamente habilitada.
- `economic_activities` e `partners` foram separados dos campos de update e
  não fazem parte de `UpdateRegularizeGuidancePayload`. Antes do PUT, o serviço
  também os remove em runtime para proteger chamadas JavaScript não tipadas;
  as mutações específicas de atividade/sócio não foram alteradas.
- O relatório e o commit desta rodada ficam separados do fix round 1.

### Evidências do fix round 2

| Comando | Resultado |
| --- | --- |
| Runner estático antes da implementação (RED) | Falhou nas novas assertions de collections e política de filtros. |
| `corepack pnpm --filter @workspace/app test:regularize` | Passou. |
| `corepack pnpm --filter @workspace/app typecheck` | Passou. |
| `corepack pnpm --filter @workspace/regularize-service exec vitest run ...` | Shim falhou: `'vitest' não é reconhecido como um comando interno ou externo`. |
| `services/regularize-service/node_modules/.bin/vitest.CMD run ...` | Fallback local passou: 4 arquivos, 92 testes. |
| `corepack pnpm --filter @workspace/regularize-service typecheck` | Passou. |
| `corepack pnpm --filter @workspace/regularize-service build` | Passou. |
| Biome local nos 8 arquivos backend | Passou, sem ajustes. |
| Biome app via shim | Shim falhou; fallback local encontrou os arquivos ignorados pela configuração raiz. |
| `corepack pnpm --filter @workspace/app lint` | Passou registrando `Skipping app lint (Biome ignored for now)`. |
| `git diff --check` | Passou. |

## Fix round 3 — habilitação explícita da consulta

- `useRegularizeGuidance` preserva `options.enabled === false` para qualquer
  filtro escopado válido.
- O guard combina `hasExplicitAllFilters` ou
  `hasEffectiveGuidanceFilter` com `(options?.enabled ?? true)`, mantendo
  `{}`, `process_id` vazio e `target_type` vazio desabilitados.
- O runner estático exige esses nomes e a combinação de habilitação, evitando
  regressão para o comportamento que ignorava `enabled: false`.

### Evidências do fix round 3

| Comando | Resultado |
| --- | --- |
| Runner estático antes da implementação (RED) | Falhou na ausência da combinação explícita de `enabled`. |
| `corepack pnpm --filter @workspace/app test:regularize` | Passou. |
| `corepack pnpm --filter @workspace/app typecheck` | Passou. |
| `git diff --check` | Passou. |
