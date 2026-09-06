# Relatório da Task 1 — elegibilidade departamental e filtros de Tarefas (#982/#983)

## Status

`DONE_WITH_CONCERNS`

A fatia integrada foi implementada, verificada nos pacotes afetados e commitada sem push. Os testes
focados, typechecks, smoke de cobertura e smoke real de navegador passaram. A suíte completa do
workspace foi executada, mas não ficou verde por falhas fora do diff desta task em `pessoal-service`
e `ti-service`, detalhadas abaixo.

## Base, escopo e commits

- Worktree: `.worktrees/issues-982-983-main`
- Branch: `feat/issues-982-983-main`
- Base funcional de revisão: `origin/develop` em `754d941b`
- Pré-requisito já incorporado ao HEAD: `399af5d3 merge: sync develop prerequisites for issues #982 and #983`
- `44e17210 test(task): define client assignment filter contract` — RED público no seam HTTP.
- `9ec4bf2d feat(integracao): apply task eligibility and filters` — reaproveitamento seguro do objeto `4671bb60`.
- `3a134600 fix(integracao): protect task eligibility boundaries` — reaproveitamento seguro do objeto `05b3862f`.
- `2a66fe59 fix(integracao): reject empty client task filters` — fechamento fail-closed, cobertura de navegador e simplificação.

Não houve push. Nenhuma dependência foi adicionada. A outra worktree não foi modificada.

## Descoberta e regras aplicadas

Foram lidos antes das alterações: `AGENTS.md`, `app/AGENTS.md`, `services/AGENTS.md`,
`.codex/config.toml` e as regras escopadas de default, frontend/UI, validação frontend, rotas Express,
schemas Zod, testes e TypeScript de services. `CONTEXT.md` não existe nesta worktree nem no entorno
pesquisado; isso foi tratado como limite documental, sem inventar conteúdo.

O escopo é frontend + backend + contrato compartilhado. Como não há `app/graphify-out/` nem
`services/graphify-out/`, a descoberta foi manual, conforme autorizado pelo brief: busca de todos os
callers de criação/edição/listagem de Tarefas, modelos, hooks, query keys, schemas, OpenAPI, política de
autorização e smokes existentes, seguida da leitura dos arquivos reais. Ponytail full foi aplicado:
reuso do contrato e componentes existentes, sem nova dependência, camada ou abstração paralela.

## Implementação

### #982 — fluxo manual de Tarefas

- O fluxo manual é identificado pela presença de `department_id`; o fluxo automático/legado continua
  com os três responsáveis herdados do modelo.
- Criação e troca de modelo/departamento consultam somente modelo da organização, do departamento,
  tipo `Projeto` e departamento `Ativo`.
- Elegibilidade de responsável é centralizada em `responsibleUserContext.ts`: usuário ativo, do mesmo
  departamento, pertencente à organização ativa ou global, e administrador ou liderança de RH com
  permissão `>= 3` na organização.
- A resolução escolhe, nesta ordem: escolha explícita válida, padrão elegível do modelo, candidato
  único, `null` quando não há candidato; múltiplos sem escolha e `null` voluntário com candidato
  retornam 422.
- No fluxo manual, responsáveis secundário/terciário são sempre limpos. O fluxo automático preserva o
  comportamento legado.
- Edição sem mudança de departamento/modelo preserva vínculos legados. Mudança revalida modelo,
  recalcula o responsável e limpa vínculos incompatíveis; tarefa sem responsável aceita edição de
  outros campos e atribuição posterior válida.
- O formulário filtra modelos por projeto/departamento ativo, usa a lista elegível fornecida pelo
  backend, aplica padrão/único/múltiplos/nenhum candidato e exibe `Sem responsável` quando cabível.

### #983 — filtros por cliente e atribuição

- `GET /task/list` aceita `client_id` UUID e `assignment=assigned|unassigned` por schema Zod strict;
  OpenAPI, tipos e contrato do app foram alinhados.
- O serviço sempre compõe os filtros com `organization_id` e com a visibilidade de tarefas próprias
  para acesso básico. Cliente é validado dentro da organização antes da consulta de tarefas.
- A resposta não expõe IDs de responsáveis; entrega `isOwn` e `isUnassigned` calculados.
- `/tasks?clientId=<id>` restaura o cliente e envia `client_id`; limpar o picker remove `clientId` e
  volta à listagem permitida. O seletor de atribuição oferece todas, atribuídas e sem responsável.
- Valor vazio e parâmetros `clientId` repetidos não são descartados: são enviados literalmente ao
  backend para rejeição. A query key distingue ausência de filtro de valor vazio, evitando reutilizar
  cache de uma listagem ampla.

## Arquivos alterados

### App

- `app/package.json`
- `app/src/modules/integracao/components/TaskFormModal.tsx`
- `app/src/modules/integracao/components/TasksWorkspace.tsx`
- `app/src/modules/integracao/components/taskFormModalUi.ts`
- `app/src/modules/integracao/hooks/queryKeys.ts`
- `app/src/modules/integracao/hooks/useTaskModels.helpers.ts`
- `app/src/modules/integracao/run-project-tests.mjs`
- `app/src/modules/integracao/run-task-eligibility-filters-browser-smoke.mjs` (novo)
- `app/src/modules/integracao/services/integracaoTasksService.contract.ts`
- `app/src/modules/integracao/types/integracaoTask.ts`
- `app/src/modules/integracao/types/taskModel.ts`

### Task service

- `services/task-service/src/openapi/spec.ts`
- `services/task-service/src/routes/taskCrud.routes.ts`
- `services/task-service/src/schemas/integracaoTaskCreate.schema.ts`
- `services/task-service/src/schemas/integracaoTaskUpdate.schema.ts`
- `services/task-service/src/schemas/taskList.schemas.ts`
- `services/task-service/src/services/responsibleUserContext.ts`
- `services/task-service/src/services/taskCrudService.ts`
- `services/task-service/src/services/taskModelService.ts`
- `services/task-service/src/test/taskCrud.routes.test.ts`
- `services/task-service/src/test/taskCrudService.test.ts`
- `services/task-service/src/test/taskEligibility.http.test.ts` (novo)
- `services/task-service/src/test/taskList.schemas.test.ts`
- `services/task-service/src/test/taskModelService.test.ts`
- `services/task-service/src/test/taskNullableResponsible.test.ts`

### Contrato compartilhado

- `shared/src/auth/integracao.ts`
- `shared/tests/integracao-policy.test.ts`

## TDD — RED

### RED 1 — seam HTTP público

Preparação necessária para o pacote no ambiente local:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/giro_test \
  pnpm --filter @workspace/task-service prisma:generate
```

Comando RED:

```sh
pnpm --filter @workspace/task-service exec vitest run src/test/taskCrud.routes.test.ts
```

Saída relevante: `13 tests`, `1 failed`, `12 passed`; o teste esperava HTTP 200 e recebeu 400. O erro
Zod dizia `Unrecognized key(s) in object: 'client_id', 'assignment'`. Era a falha esperada: a interface
pública ainda não aceitava os filtros. O teste foi commitado isoladamente em `44e17210` antes da
implementação. Ao reaproveitar os commits, chegou um teste final equivalente; no self-review a cópia
foi removida, mantendo um único teste final e preservando o RED no histórico.

### RED 2 — `clientId` vazio não pode ampliar a consulta

Comando:

```sh
pnpm --filter @workspace/app test:projects
```

Saída relevante no novo teste `task list contract preserves an empty client filter for explicit
rejection`: `undefined !== ""`. Motivo esperado: a condição truthy omitia `client_id`, transformando
um filtro inválido em listagem ampla.

### RED 3 — URL vazia e cache

Comando de navegador:

```sh
pnpm --filter @workspace/app test:tasks-browser
```

Saída relevante: o polling esperava nova requisição após `/tasks?clientId=`, mas permaneceu em 4.
Diagnóstico: `router.query`/query key colapsavam vazio e ausência. Um teste de contrato adicional
confirmou o problema com `assert.notDeepEqual`: as duas chaves eram idênticas. O fechamento passou a
ler a query literal de `router.asPath`, preservar o vazio no request e usar `null` só para ausência na
query key.

## GREEN e verificações focadas

| Comando | Resultado |
|---|---|
| `pnpm --filter @workspace/task-service exec vitest run src/test/taskCrud.routes.test.ts` | GREEN inicial: `22/22` |
| `pnpm --filter @workspace/task-service test` | GREEN final: `30 files passed`, `171/171 tests` |
| `pnpm --filter @workspace/shared test` | `47/47` |
| `pnpm --filter @workspace/app test:projects` | Todos os contratos do módulo passaram; apenas warning conhecido `MODULE_TYPELESS_PACKAGE_JSON` |
| `pnpm --filter @workspace/app test:tasks-browser` | PASS: `tarefas preservam clientId, combinam atribuição e resolvem responsável elegível` |
| `pnpm --filter @workspace/app typecheck` | PASS |
| `pnpm --filter @workspace/task-service typecheck` | PASS |
| `pnpm --filter @workspace/shared typecheck` | PASS |
| `pnpm --filter @workspace/task-service check` | PASS: 80 arquivos, nenhuma correção |
| `pnpm smoke:coverage` | PASS: `416/418 operations mapped with paired expectations` |
| `git diff --check origin/develop...HEAD` | PASS, sem whitespace inválido |

O smoke de navegador iniciou um Next real e exercitou a UI renderizada com rede interceptada de modo
determinístico: restauração de `clientId`, request combinado com `assignment=unassigned`, rótulo
`Sem responsável`, remoção do parâmetro, rejeição fail-closed de parâmetros repetidos/vazios e os
quatro ramos do formulário (padrão, único, múltiplos e nenhum candidato).

## Suíte completa

A suíte raiz foi executada uma vez e repetida com concorrência limitada para separar flake de carga:

```sh
pnpm test
TURBO_CONCURRENCY=4 pnpm test
```

Evidência:

- As políticas de segurança da raiz passaram `86/86`.
- O build de produção do app concluiu; houve warnings preexistentes de dependência dinâmica em
  `featureFlags/client.ts` e de módulo sem `type` para Tailwind.
- Na primeira execução, `@workspace/pessoal-service` teve timeout de 5 s em
  `src/test/internalReporting.routes.test.ts:176`; o pacote ficou em `128/129`.
- Rerun isolado do arquivo: `pnpm --filter @workspace/pessoal-service exec vitest run
  src/test/internalReporting.routes.test.ts` passou `7/7` em 610 ms, caracterizando sensibilidade à
  carga da execução paralela.
- Na repetição limitada, `@workspace/ti-service` falhou fora do escopo e o Turbo cancelou irmãos com
  exit 130. Rerun isolado do pacote (`pnpm --filter @workspace/ti-service test`) reproduziu 2 falhas:
  `src/test/app.test.ts:341`, esperado 200/recebido 404, e timeout de 5 s em
  `src/test/tiPassword.routes.test.ts:120`; total `280/282`.
- Nenhum dos arquivos com falha está no diff `origin/develop...HEAD`. Não foram alterados para mascarar
  os problemas.

## Self-review e simplificação

- Revisei o diff completo contra `origin/develop`, os callers de rota/serviço/hook/formulário e as
  consultas Prisma que recebem os novos filtros.
- Confirmei que o isolamento é estrutural no mesmo `where`: `organization_id`, filtro de cliente,
  atribuição e regras de responsabilidade/permissão são compostos antes de `findMany` e dos totais.
- Confirmei que IDs inválidos, vazios e repetidos falham no schema, e cliente ausente/de outra
  organização retorna 404 antes de consultar tarefas; nenhum caso cai para consulta ampla.
- Confirmei que criação manual limpa secundário/terciário, enquanto criação automática e edição sem
  mudança preservam legado; isso evita migração oportunista de registros antigos.
- Removi a duplicação do teste de rota introduzido pela sobreposição entre o RED e o commit
  reaproveitado. Não introduzi helper, estado ou dependência adicional para essa simplificação.
- Limpei somente alterações geradas pela execução (`app/AGENTS.md` e `app/next-env.d.ts`) e preservei
  os artefatos preexistentes. A árvore ficou limpa após o commit de código.
- O hook de commit passou: 6 testes de supply-chain, 4.616 arquivos inspecionados, zero achados, e
  lint-staged/Biome verde.

## Matriz de aceite — issue #982

| Critério | Status | Evidência concreta |
|---|---|---|
| Nova Tarefa aceita só modelo ativo, Projeto, da organização e departamento | PASS | `taskCrudService.ts` consulta os quatro predicados; testes `listModel limita modelos de projeto a departamentos ativos`, `createTask rejeita departamento de outra organização...` e smoke troca departamentos/modelos. |
| Padrão do modelo é selecionado se líder/admin elegível do departamento | PASS | `resolveEligibleTaskResponsible`; HTTP `resolve padrão elegível`; browser verifica `model-default -> responsible-default`. |
| Único é automático; múltiplos exigem escolha | PASS | HTTP `resolve candidato único` e `resolve múltiplos sem escolha`; unitários homônimos; browser verifica campo desabilitado no único e vazio/habilitado no múltiplo. |
| Sem candidatos cria `null` e aparece `Sem responsável` | PASS | HTTP `resolve nenhum candidato`, unitário `createTask mantém Sem responsável...`, resposta `isUnassigned` e browser confirma texto na tabela/formulário. |
| Não permite `Sem responsável` voluntário com candidato | PASS | HTTP `resolve desatribuição voluntária` e unitário `createTask rejeita desatribuição voluntária...`, ambos 422. |
| Comum/inativo/outro departamento/outra organização é rejeitado | PASS | `taskResponsibleEligibilityWhere` restringe status, organização, departamento e admin/RH>=3; HTTP `resolve usuário inelegível`; unitários validam responsável/departamento e organização. |
| Tarefa sem responsável aceita outras edições e atribuição posterior | PASS | Unitários `updateTask permite editar outros campos...` e `updateTask atribui posteriormente...`; schemas/OpenAPI aceitam `null`. |
| Troca de departamento limpa incompatíveis sem migrar legado intocado | PASS | Unitários `updateTask troca modelo e departamento...`, `...edita...sem migrar vínculos legados` e `...preserva legado`; serviço revalida só quando departamento/modelo/atribuição muda. |
| HTTP e interface cobrem ramos e autorização | PASS | `taskEligibility.http.test.ts` cobre 7 ramos + 403; `shared/tests/integracao-policy.test.ts` cobre política; smoke de navegador cobre quatro ramos do formulário. |

## Matriz de aceite — issue #983

| Critério | Status | Evidência concreta |
|---|---|---|
| API aceita cliente e atribuição com validação explícita | PASS | `taskListQuerySchema`: UUID + enum strict; testes de schema e rota cobrem válido, cliente inválido e assignment inválido. |
| Filtros não cruzam organização/permissão | PASS | `listTasks` inicia com `organization_id` e compõe visibilidade básica; unitários `compõe cliente...com o escopo da organização`, `mantém responsabilidade própria...` e `reutiliza...nos totais`. |
| Página restaura `/tasks?clientId=<id>` e consulta só suas tarefas | PASS | `TasksWorkspace` deriva a URL e monta `listParams`; browser exige que todas as requisições iniciais tenham exatamente o UUID. |
| Limpar seleção remove parâmetro e restaura lista permitida | PASS | Browser seleciona `Sem cliente selecionado`, comprova ausência de `clientId` na URL e request sem `client_id`. |
| UI identifica e filtra `Sem responsável` | PASS | Seletor `Atribuição`, coluna `Responsável`, campo `isUnassigned`; browser confirma célula e request `assignment=unassigned`. |
| Cliente inexistente/inválido/outra organização não vaza | PASS | UUID inválido/vazio/repetido retorna 400 no seam; cliente não encontrado na organização retorna 404 antes de `task.findMany`; unitário confirma ausência da consulta. |
| OpenAPI, HTTP e navegação cobrem positivo, negativo e combinado | PASS | OpenAPI expõe `client_id` UUID e enum; `taskCrud.routes.test.ts` valida positivo/negativos; browser valida cliente+atribuição, limpeza e URLs inválidas. |

## Preocupações e limites

1. A suíte completa não está verde por 1 timeout de `pessoal-service` e 2 falhas reproduzidas em
   `ti-service`, todos fora do diff; por isso o status é `DONE_WITH_CONCERNS`, não `DONE`.
2. `CONTEXT.md` solicitado não existe na worktree.
3. A prova de UI usa navegador/Next reais com API mockada; não é prova contra banco, ambiente publicado,
   produção ou aceite humano. Não houve deploy nem autorização para isso.
4. Warnings de build citados acima são preexistentes e não foram alterados fora do escopo fechado.
