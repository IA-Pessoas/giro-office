# Relatório final do fix — issue #994

Base: `4f1706a1`

## Arquivos

- `app/src/modules/integracao/components/ProjectFormModal.tsx`
  - substitui os dois usos de `window.confirm` pelo `ConfirmationDialog` compartilhado;
  - preserva propostas/fonte ao cancelar a troca;
  - remove somente propostas da IA ao confirmar a troca;
  - encaminha Cancelar, botão Fechar, Escape e overlay para a confirmação de descarte;
  - mantém o bloqueio de fechamento durante loading e o reset do rascunho no fechamento real.
- `app/src/modules/integracao/run-project-wizard-browser-smoke.mjs`
  - observa os diálogos acessíveis por role, nome, descrição e botões;
  - cobre cancelamento e confirmação da troca de fonte;
  - cobre descarte iniciado por Cancelar, botão Fechar, overlay e Escape;
  - usa `toContainText` no diálogo acessível para não depender das duas renderizações intencionais da descrição;
  - aguarda a confirmação anterior ficar oculta antes de acionar a próxima forma de fechamento.
- `.superpowers/sdd/issue-994-plan/final-fix-report.md`
  - registra escopo, evidências e limitações desta correção.

`app/AGENTS.md` e `app/next-env.d.ts`, alterados automaticamente por `next dev`, foram revertidos.

## TDD e comandos

- `pnpm graphify:context:ui -- "Issue #994: ..."`
  - exit `2`: Graphify sem grafo local em `app/graphify-out/graph.json`; descoberta manual usada conforme fallback do repositório.
- `pnpm --filter @workspace/app run test:project-wizard-browser` durante o fix original
  - duas primeiras execuções não chegaram ao seam novo: falharam no `toHaveURL` preexistente da linha 462 usando o cache `.next` local;
  - após isolar o cache e usar `PROJECT_WIZARD_BROWSER_PORT=3127`, o RED esperado foi observado: `getByRole('dialog', { name: 'Descartar propostas da IA?' })` não encontrou o componente em `ProjectFormModal.tsx` ainda baseado em `window.confirm`;
  - o GREEN não foi iniciado naquele momento, em respeito à instrução operacional posterior de não iniciar testes adicionais.
- validação pós-fix informada antes desta correção
  - falhou na antiga linha 793: `getByText(...).toBeVisible()` encontrou as duas descrições intencionais do `ConfirmationDialog` — a `sr-only` do `Dialog` e o parágrafo visível — e entrou em strict mode.
- `PROJECT_WIZARD_BROWSER_PORT=3127 pnpm --filter @workspace/app run test:project-wizard-browser`
  - primeira execução não alcançou as asserções: `page.goto("/projects")` expirou após 30 segundos;
  - após isolar o cache `.next`, avançou e revelou uma corrida do próprio smoke na antiga linha 844: a próxima ação começava durante a animação de saída da confirmação anterior;
  - após aguardar cada confirmação ficar oculta, exit `0` com:
    - `PASS wizard revisa tarefas manuais, aceita lista vazia e preserva edição direta`;
    - `PASS wizard limita extração, preserva estado transitório e confirma descartes`.
- `pnpm --filter @workspace/app run test:projects`
  - exit `0`; todas as verificações listadas passaram, incluindo uso do diálogo compartilhado, regras do wizard, pré-validação e formatos de Ata.
- `pnpm --filter @workspace/app typecheck`
  - exit `0`: `tsc --noEmit` e `tsc -p tsconfig.usefetch-types.json --noEmit` passaram no estado final.
- `git diff --check`
  - exit `0` no estado final.

## Decisão sobre 10 MiB

O limite foi mantido. O código real entregue por #993 (`e9ecf3e5`, merge da PR #1011) já o tornou contrato público da extração:

- `services/task-service/src/schemas/projectWizardExtraction.schemas.ts`: valida texto UTF-8 até `10 * 1024 * 1024` bytes;
- `services/task-service/src/routes/projectWizard.routes.ts`: limita upload ao mesmo valor e retorna erro acima de 10 MB;
- `services/task-service/src/openapi/spec.ts`: documenta texto de até 10 MiB e arquivo de até 10 MB;
- `services/task-service/README.md`: documenta os mesmos limites e formatos;
- `services/gateway/src/app.ts`: reserva o limite público da fonte em `10 * 1024 * 1024` bytes.

Remover a pré-validação do frontend afrouxaria uma validação de trust boundary e enviaria ao servidor entradas que o contrato público rejeita.

## Concerns

- O primeiro browser smoke pós-correção sofreu timeout de inicialização e exigiu isolar o cache `.next`; a repetição limpa passou.
- `test:projects` emite o warning existente `MODULE_TYPELESS_PACKAGE_JSON`, sem falha.
- Nenhuma API, dependência, ordem assíncrona ou regra de 10 MiB foi alterada.
- `ProjectFormModal.tsx` não foi alterado na correção pós-fix.
