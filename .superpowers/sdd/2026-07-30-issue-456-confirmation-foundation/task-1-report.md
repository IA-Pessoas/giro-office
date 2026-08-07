# Task 1 Report - Issue #456

## Status

Implementada exclusivamente a Task 1 na branch `feat/456-confirmation-dialog-foundation`.

## Escopo

- Criado `app/src/shared/components/ui/ConfirmationDialog.tsx`.
- Alterado `app/src/shared/components/ui/Dialog.tsx`.
- Alterado `app/src/shared/components/index.ts`.
- Alterado `app/src/shared/components/run-a11y-overlays-tests.mjs`.
- Nenhum fluxo produtivo foi migrado.
- Nenhum contrato HTTP, autorização ou dependência foi alterado.

## TDD

### RED

1. O runner a11y passou na linha de base com 12 casos.
2. Foram adicionadas verificações para:
   - composição pelo `Dialog` compartilhado;
   - controles nativos de cancelar e confirmar;
   - ambos os controles desabilitados durante `isConfirming`;
   - erro com `role="alert"`;
   - rejeição sem fechamento do diálogo;
   - bloqueio de Escape, overlay e botão de fechar durante confirmação.
3. Comando:
   - `pnpm --filter @workspace/app test:a11y-overlays`
4. Resultado RED:
   - falhou com exit code 1;
   - motivo esperado: `ENOENT` para
     `app/src/shared/components/ui/ConfirmationDialog.tsx`.

### GREEN

1. `ConfirmationDialog` foi criado com todos os props explícitos do plano e variante opcional
   `destructive | neutral`.
2. O componente:
   - aguarda `onConfirm`;
   - fecha somente após sucesso;
   - mantém aberto e exibe fallback contextual quando há rejeição;
   - combina erro local com `errorMessage`;
   - bloqueia cancelamento e fechamento durante `isConfirming`.
3. O `Dialog` recebeu o prop opcional e retrocompatível `preventClose`, aplicado ao callback
   controlado, Escape, interação no overlay e botão de fechar.
4. O componente foi exportado pelo barrel compartilhado.
5. Comando GREEN:
   - `pnpm --filter @workspace/app test:a11y-overlays`
6. Resultado:
   - 15 casos passaram, 0 falhas.

## Verificações

- `pnpm install --frozen-lockfile`
  - passou usando o store local;
  - a consulta de metadados encontrou `EAI_AGAIN`, mas nenhum download foi necessário e a
    instalação terminou com exit code 0.
- `pnpm --filter @workspace/api build`
  - passou;
  - necessário porque `@workspace/app` resolve os tipos a partir de `packages/api/dist`.
- `pnpm --filter @workspace/app typecheck`
  - passou, incluindo `typecheck:usefetch`.
- `git diff --check`
  - passou.
- `pnpm exec biome check <arquivos da Task 1>`
  - não processou arquivos porque o frontend está ignorado pela configuração atual do Biome.

## Auto-revisão

- Conferi o diff e os call sites: `ConfirmationDialog` ainda não possui consumidor produtivo, como
  exigido pela Task 1.
- Conferi os usos de `preventClose`: somente o novo componente o ativa; os consumidores existentes
  do `Dialog` preservam o comportamento anterior pelo default `false`.
- Conferi que rejeição não chama `onOpenChange(false)` e que sucesso chama.
- Conferi que cancelar, confirmar e o botão de fechar ficam inoperantes durante loading.
- Conferi que Escape e overlay mantêm o diálogo aberto durante loading.
- Conferi que o erro é anunciado com `role="alert"`.
- Não alterei APIs, autorização, lockfile, fluxos de domínio ou arquivos fora do escopo e deste
  relatório.

## Preocupações

- A cobertura comportamental agora usa uma fixture Next isolada e Chromium real, sem expor rota no
  app produtivo e sem adicionar dependências.
- O Biome não oferece evidência de formatação para estes arquivos enquanto o frontend permanecer
  ignorado na configuração.

## Rodada de correção 1

### Feedback verificado

1. `localError ?? errorMessage` fazia o fallback local mascarar uma mensagem controlada e mais
   específica do consumidor.
2. O erro local só era limpo pelos handlers internos; fechar o componente externamente e reabri-lo
   para outro contexto preservava o fallback antigo.
3. As verificações anteriores desses comportamentos eram regex sobre o código-fonte, sem executar
   React ou Radix.

### RED

- Foi criada uma fixture Next exclusivamente de teste em
  `app/src/shared/components/confirmation-dialog-test-fixture/`.
- Foi criado `run-confirmation-dialog-behavior-tests.mjs` usando o Playwright já instalado; nenhuma
  dependência ou rota produtiva foi adicionada.
- O runner renderiza `ConfirmationDialog` e `Dialog` reais e interage com botões, Escape e overlay.
- `pnpm --filter @workspace/app test:a11y-overlays` reproduziu duas falhas:
  - após fechamento externo e reabertura, havia 1 alerta quando o esperado era 0;
  - após rejeição, o texto visível era o fallback local em vez de
    `Erro específico informado pelo consumidor.`.
- No mesmo RED, os cenários de loading e `Dialog preventClose={false}` passaram, isolando a causa no
  estado de erro do `ConfirmationDialog`.

### GREEN

- `errorMessage` agora tem prioridade sobre `localError`.
- Um efeito limpa `localError` quando `open` muda para `false`, incluindo fechamento controlado
  externamente.
- Os regex de falha/guards foram substituídos por cinco cenários comportamentais:
  - rejeição mantém o diálogo aberto e mostra fallback;
  - fechamento externo limpa fallback para o próximo contexto;
  - erro controlado tem prioridade após rejeição;
  - cancelar, Escape e overlay não fecham durante loading;
  - `Dialog` normal continua fechando por Escape e overlay.
- Resultado GREEN: 18 casos passaram, 0 falhas.

### Verificações da rodada

- `pnpm --filter @workspace/app test:a11y-overlays`
  - passou fora do sandbox, necessário para bind local do Next e execução do Chromium.
- `pnpm --filter @workspace/app typecheck`
  - passou, incluindo `typecheck:usefetch`.
- `git diff --check`
  - passou.

### Auto-revisão da rodada

- Nenhum `package.json` ou lockfile foi alterado.
- A fixture está fora de `app/src/pages`; não cria rota no app produtivo.
- Nenhum consumidor produtivo de `ConfirmationDialog` foi adicionado ou modificado.
- A cobertura executa os componentes reais, sem mockar `ConfirmationDialog`, `Dialog` ou Radix.
