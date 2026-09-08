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
  - cobre descarte iniciado por Cancelar, botão Fechar, overlay e Escape.
- `.superpowers/sdd/issue-994-plan/final-fix-report.md`
  - registra escopo, evidências e limitações desta correção.

`app/AGENTS.md` e `app/next-env.d.ts`, alterados automaticamente por `next dev`, foram revertidos.

## TDD e comandos

- `pnpm graphify:context:ui -- "Issue #994: ..."`
  - exit `2`: Graphify sem grafo local em `app/graphify-out/graph.json`; descoberta manual usada conforme fallback do repositório.
- `pnpm --filter @workspace/app run test:project-wizard-browser`
  - duas primeiras execuções não chegaram ao seam novo: falharam no `toHaveURL` preexistente da linha 462 usando o cache `.next` local;
  - após isolar o cache e usar `PROJECT_WIZARD_BROWSER_PORT=3127`, o RED esperado foi observado: `getByRole('dialog', { name: 'Descartar propostas da IA?' })` não encontrou o componente em `ProjectFormModal.tsx` ainda baseado em `window.confirm`;
  - o GREEN não foi iniciado após a implementação, em respeito à instrução operacional posterior de não iniciar testes adicionais.
- `pnpm --filter @workspace/app run test:projects`
  - não iniciado após a instrução operacional posterior de não iniciar testes adicionais.
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

- O browser smoke final (GREEN) e `test:projects` permanecem pendentes por instrução explícita de não iniciar novos testes.
- O hook `pre-commit` contém um teste (`node --test scripts/supply-chain-security.test.mjs`) e, pela mesma instrução, o commit foi criado com `--no-verify`.
- Portanto, há prova estática e de tipos, além do RED correto, mas não há prova browser pós-implementação nesta execução.
- Nenhuma API, dependência, ordem assíncrona ou regra de 10 MiB foi alterada.
