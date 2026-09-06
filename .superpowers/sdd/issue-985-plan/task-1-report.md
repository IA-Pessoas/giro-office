# Relatório da Task 1 — issue #985

## Status

Implementação concluída na branch `feat/issue-985-manual-wizard-tasks`, baseada em
`origin/develop@4162e205939f0d45388edcfb5d397422b9896f78`. Nenhum push ou PR foi feito.

Graphify não tinha grafo local em `services/graphify-out/graph.json`; a descoberta manual ficou
limitada ao seam HTTP do `task-service`, ao núcleo de criação manual e ao catálogo público do
gateway.

## Implementação

- `POST /task/project-wizard` agora exige `tasks`, aceita `[]` e valida cada item com nome,
  departamento e Modelo obrigatórios; prazo é opcional e responsável é opcional/anulável.
- O schema do item reutiliza os campos do contrato manual de `POST /task`, incluindo a validação
  de data calendário e a normalização dos opcionais.
- O command cria primeiro o Projeto e depois cada Tarefa pelo `TaskCrudService.createTask`, usando
  a organização autenticada, o id do Projeto retornado e o mesmo cliente do request.
- Cada principal recebe literalmente `status: "A Realizar"`; observações e urgência permanecem
  vazias porque não fazem parte desta fatia do contrato.
- `createDependencies: false` é o único seam interno novo no núcleo manual. O default continua
  expandindo dependências nos demais callers; somente o wizard desliga a expansão nesta issue.
- `counts.main` e `counts.unassigned` são derivados das linhas retornadas pela persistência;
  `counts.dependencies` permanece `0`.
- A integração com `project-service` passou a rejeitar envelope de sucesso sem `project.id`,
  necessário para vincular as Tarefas sem cast inseguro.
- OpenAPI, README e smoke foram alinhados ao novo corpo público.
- `POST /task/project-wizard` foi classificado no gateway como atividade visível:
  `criou um projeto com tarefas`.

## Arquivos alterados

- `services/task-service/src/schemas/projectWizard.schemas.ts`
- `services/task-service/src/services/projectWizardService.ts`
- `services/task-service/src/integrations/projectWizard.ts`
- `services/task-service/src/services/taskCrudService.ts`
- `services/task-service/src/openapi/spec.ts`
- `services/task-service/src/test/projectWizard.routes.test.ts`
- `services/task-service/src/test/projectWizardService.test.ts`
- `services/task-service/src/test/projectWizardIntegration.test.ts`
- `services/task-service/src/test/taskCrudService.test.ts`
- `services/task-service/README.md`
- `scripts/all-services-smoke.mjs`
- `services/gateway/src/audit/activityCatalog.ts`
- `services/gateway/src/test/activityCatalog.test.ts`

Observação: `projectWizard.routes.ts` não precisou de hunk porque já encaminhava o objeto validado
integralmente ao service; o teste HTTP prova esse comportamento no seam fixado pela spec #979.

## Evidência TDD

### RED

1. `pnpm --filter @workspace/task-service exec vitest run src/test/projectWizard.routes.test.ts src/test/projectWizardService.test.ts src/test/taskCrudService.test.ts`
   - exit `1`;
   - schema/OpenAPI ainda rejeitavam `tasks`;
   - o orquestrador não chamava o núcleo manual;
   - o núcleo tentou consultar/expandir dependências mesmo com o novo opt-out;
   - 61 testes existentes passaram e 10 novos/afetados falharam pela capacidade ausente.
2. `pnpm --filter @workspace/task-service exec vitest run src/test/projectWizardIntegration.test.ts -t "Projeto sem id"`
   - exit `1`;
   - a promise resolveu `{ name: "Projeto" }` quando deveria rejeitar o envelope sem id.
3. `pnpm --filter @workspace/gateway exec vitest run src/test/activityCatalog.test.ts src/test/activityCatalogCoverage.test.ts`
   - exit `1`;
   - o teste específico recebeu `null` e a cobertura listou exatamente
     `POST /task/project-wizard` como desconhecida.

### GREEN e regressão

- Testes focados do `task-service`: `4` arquivos, `78/78` testes passaram.
- Testes focados do gateway: `2` arquivos, `86/86` testes passaram.
- Suíte completa do `task-service`: `34` arquivos, `225/225` testes passaram.
- Suíte completa do gateway: `19` arquivos, `390/390` testes passaram.
- `pnpm --filter @workspace/task-service typecheck`: exit `0`.
- `pnpm --filter @workspace/gateway typecheck`: exit `0`.
- `pnpm --filter @workspace/task-service check`: `89` arquivos, sem erros.
- `pnpm --filter @workspace/gateway check`: `44` arquivos, sem erros.
- `pnpm smoke:coverage`: `417/419` operações mapeadas com pares de expectativas.
- `git diff --check`: exit `0`.

As mensagens de erro vistas nas suítes são saídas esperadas dos cenários negativos; os runners
encerraram com exit `0`.

## Self-review e limites preservados

- Nenhuma regra de elegibilidade foi duplicada: departamento, Modelo, candidato padrão/único,
  múltiplos candidatos e ausência continuam resolvidos pelo núcleo manual existente.
- Os callers existentes continuam com expansão de dependências por default; busca de call sites
  confirmou `createDependencies: false` somente no wizard e no teste correspondente.
- Não foi adicionada dependência, migration, UI, preview de dependências, transação conjunta ou
  idempotência persistida.
- Concern deliberado: se uma Tarefa intermediária falhar, o Projeto e as Tarefas anteriores podem
  permanecer persistidos. Atomicidade e replay/concorrência pertencem explicitamente à #987.
- Dependências de Modelo permanecem sem persistência e com contador zero nesta entrega; isso
  pertence explicitamente à #986.
