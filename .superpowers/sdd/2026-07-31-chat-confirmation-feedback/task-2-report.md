# Task 2 — migração mínima de UI do Chat

## Status

Concluída, com os contratos de Chat em estado GREEN.

## Alterações

- `GroupInfoSidebar` agora mantém o participante pendente em estado e usa o
  `ConfirmationDialog` exportado por `@shared/components`.
- Cancelar/fechar o diálogo limpa o participante pendente; confirmar executa o handler nomeado
  que contém a única chamada a `removeMemberFromGroup(...)` e protege o diálogo durante a
  operação.
- `ConversationWindow` usa `toast.error` de `react-toastify` no erro de microfone, preservando a
  limpeza de recorder, stream, timer e estado.
- `ChatListPanel` usa `toast.error` de `react-toastify` para nome vazio e ausência de
  participantes, preservando os guards anteriores à criação do grupo.
- `alert`, `confirm` e `prompt` foram eliminados dos três componentes em escopo.

## Evidência de validação

### Testes de Chat

Comando:

```text
pnpm --filter @workspace/app test:chat
```

Resultado: exit code `0`; 22 contratos passaram:

- `test:socket`: 3;
- `test:chat-context`: 8;
- `test:chat-window`: 11.

O runner ainda emite o aviso preexistente `MODULE_TYPELESS_PACKAGE_JSON`.

### Checagens de diff e escopo

- `git diff --check`: exit code `0`.
- Busca de `alert`, `confirm` e `prompt` nos três componentes: nenhum resultado.
- Busca de chamadas a `removeMemberFromGroup(...)` em `GroupInfoSidebar`: exatamente uma, no
  handler entregue a `onConfirm`.
- Arquivos de produção alterados: somente `GroupInfoSidebar.tsx`, `ConversationWindow.tsx` e
  `ChatListPanel.tsx`.
- `ChatContext.tsx` e o fluxo de upload da issue #257 não foram alterados.

## Validações indisponíveis

- Typecheck não executado: este worktree não possui `node_modules` na raiz nem em `app/`.
- Evidência visual não capturada: sem dependências instaladas para iniciar o app/navegador local.
- Atualização do Graphify não executada: o worktree não possui o grafo local do frontend.

## Preocupações residuais

- A suíte exercita contratos de fonte e preservação do fluxo de gravação, mas não substitui uma
  interação visual do diálogo em navegador.
- A ausência de dependências impede confirmação estática adicional via TypeScript neste worktree.
