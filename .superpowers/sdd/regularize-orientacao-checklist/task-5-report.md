# Task 5 — API de orientação Regularize

## Escopo

Alterações de produto limitadas a:

- `services/regularize-service/src/routes/guidance.routes.ts`
- `services/regularize-service/src/openapi/spec.ts`
- `services/regularize-service/src/test/remaining.routes.test.ts`
- `services/regularize-service/src/test/status.schemas.test.ts`

Este relatório é o único artefato fora desses quatro arquivos, autorizado explicitamente para a Task 5.

## TDD

### RED

Primeiro foram adicionados testes de rota para criação independente, atualização com resposta completa, listagem sem `process_id`, preservação do filtro, erro de filial e conflito 409. Também foi adicionado o teste de OpenAPI para alvo, snapshot, checklist de 17 itens, filial, erros e segurança.

Após corrigir expectativas dos casos negativos para o envelope de erro existente, a execução local da suíte falhou exatamente nos comportamentos ausentes:

- `GET /regularize/guidance/list` sem `process_id`: esperado 200, recebido 400;
- OpenAPI de guidance: `additionalProperties` ainda era `true`.

### GREEN e refatoração

- A rota passou a usar a versão parcial do schema estrito existente, mantendo a rejeição de queries desconhecidas e encaminhando `undefined` quando `process_id` está ausente.
- O OpenAPI passou a reutilizar schemas fechados para checklist, alvo, filial, orientação e envelopes de resposta; documenta `process_id` anulável/opcional, respostas completas e erros 404/409/422.
- As rotas legadas de atividade e sócio foram preservadas e marcadas como compatibilidade na documentação.
- O Biome aplicou apenas a formatação indicada em `spec.ts` e `remaining.routes.test.ts`.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `corepack pnpm graphify:context:services -- "Task 5: evolve Regularize guidance routes, OpenAPI, route tests and status schema tests; GET list process_id optional and full guidance responses."` | Falhou com exit 2: não há grafo local em `services/graphify-out/graph.json`; usada descoberta manual. |
| `corepack pnpm --filter @workspace/regularize-service exec vitest run src/test/remaining.routes.test.ts src/test/status.schemas.test.ts src/test/internalReporting.openapi.test.ts` | Shim falhou: `'vitest' não é reconhecido ...`; `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found`. |
| `services/regularize-service/node_modules/.bin/vitest.cmd run src/test/remaining.routes.test.ts src/test/status.schemas.test.ts src/test/internalReporting.openapi.test.ts` | Equivalente local executado fora do sandbox após o esbuild ser bloqueado pelo sandbox; GREEN: 3 arquivos, 58 testes aprovados. |
| `corepack pnpm --filter @workspace/regularize-service build` | Aprovado. |
| `corepack pnpm smoke:coverage` | Aprovado: `463/465 operations mapped with paired expectations`. |
| `corepack pnpm --filter @workspace/regularize-service typecheck` | Aprovado. |
| `corepack pnpm exec biome check ...` | Shim falhou: `'biome' não é reconhecido ...`. |
| `node_modules/.bin/biome.cmd format --write ...` e `node_modules/.bin/biome.cmd check ...` | Equivalente local usado; arquivos formatados e checados. |
| `git diff --check` | Aprovado. |

## Limitações de ambiente

- O worktree declara Node 22 em `services/src`, mas o ambiente local executa Node 24.13.1; build e typecheck concluíram com aviso de engine.
- Os shims `pnpm exec vitest` e `pnpm exec biome` não resolveram os binários neste worktree. Os binários locais equivalentes foram usados; o Vitest exigiu execução fora do sandbox porque o esbuild não pôde percorrer a árvore de diretórios dentro do sandbox.

## Fix round 1

### RED

Antes da implementação do fix foram adicionados:

- teste explícito de `GET /regularize/guidance/list?process_id=null`, exigindo resposta 200 e encaminhamento de `undefined` ao serviço;
- assertions dos campos reais no schema OpenAPI de resposta, incluindo `organization_id`, campos legados, snapshots PJ/PF, metadados de `checklist_items` e contrato de resposta fechado.

O RED reproduziu os dois defeitos:

- query nula era rejeitada com 400 (`process_id invalido.`), porque o schema anterior não aceitava o valor serializado pelo Supertest;
- a resposta OpenAPI não descrevia o retorno completo do `GuidanceService`, incluindo os campos legados e os metadados dos itens.

### GREEN e refatoração

- `guidanceListQuerySchema` agora permanece estrito e aceita `process_id` ausente ou nulo; o valor vazio produzido por query string é normalizado para nulo e valores nulos/ausentes seguem como `undefined` ao serviço, que é o contrato atual de `listByProcess`.
- Os schemas OpenAPI de guidance foram fechados com `additionalProperties: false` e alinhados ao retorno real: `organization_id`, campos legados aceitos/retornados, arrays de atividades e sócios, snapshots PJ/PF, `branch_data`, checklist exato de 17 itens e metadados de cada item, com `observation` anulável.
- `status.schemas.test.ts` agora valida o envelope fechado, o contrato de resposta realista, campos legados, snapshots, coleções e metadados; `remaining.routes.test.ts` cobre ausência, presença e nulo em `process_id`, além de POST/PUT completos.

### Validação do fix round

| Comando | Resultado |
| --- | --- |
| `corepack pnpm --filter @workspace/regularize-service exec vitest run src/test/remaining.routes.test.ts src/test/status.schemas.test.ts src/test/internalReporting.openapi.test.ts` | Shim limitado: `'vitest' não é reconhecido`; `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found`. |
| `services/regularize-service/node_modules/.bin/vitest.cmd run src/test/remaining.routes.test.ts src/test/status.schemas.test.ts src/test/internalReporting.openapi.test.ts` | GREEN: 3 arquivos, 59 testes aprovados. |
| `corepack pnpm --filter @workspace/regularize-service build` | Aprovado; apenas avisos de Node 22/Node 24 e configuração `pnpm` já existentes. |
| `corepack pnpm --filter @workspace/regularize-service typecheck` | Aprovado; mesmos avisos de ambiente. |
| `corepack pnpm smoke:coverage` | Aprovado: `463/465 operations mapped with paired expectations`. |
| `services/regularize-service/node_modules/.bin/biome.cmd check` nos quatro arquivos de produto/teste | Aprovado: 4 arquivos verificados, nenhum ajuste. |
| `git diff --check` | Aprovado. |
