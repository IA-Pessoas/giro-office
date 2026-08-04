# Relatório final — issue #712

## Status

- Onda final de correção aplicada nesta worktree.
- Escopo mantido no frontend/runners da issue.
- Nenhum push ou PR realizado.

## Findings tratados nesta onda

1. Standards — catch do `waitForTasksRedirect`
   - O runner `app/src/modules/auth/run-auth-sidebar-browser-smoke.mjs` agora registra a mensagem diagnóstica antes de relançar o erro.

2. Standards — teste acoplado a formatação/chamadas do `AppShell`
   - Removi a asserção textual redundante em `app/src/modules/auth/run-auth-tests.mjs`.
   - A cobertura da regressão permaneceu no teste comportamental já existente sobre `isIntegrationTasksOnlyRouteBlocked(...)`.

3. Spec — smoke real de `/contabil` fraco
   - Fortaleci o smoke real para exigir sinais observáveis da tela Contábil:
     - `h1` “Contábil”;
     - descrição do módulo;
     - aba “Controle” selecionada;
     - empty state “Selecione um cliente para começar”;
     - ausência do heading global “Acesso indisponível”.
   - O runner agora também clica no link “Contábil” da sidebar e revalida a tela após voltar de `/tasks`.

4. Spec — cobertura perdida de dashboard sem módulos
   - Restaurei o cenário de smoke que confirma que “Dashboard” não aparece na sidebar quando o usuário não possui acesso a módulos.

## Mudanças de código

- `app/src/modules/auth/run-auth-sidebar-browser-smoke.mjs`
  - logging explícito no catch;
  - helper de assertions observáveis da página Contábil;
  - navegação via link da sidebar;
  - restauração do cenário “dashboard hidden without module access”;
  - falha antecipada e honesta quando o Next não compila por `Module not found`.
- `app/src/modules/auth/run-auth-tests.mjs`
  - remoção da asserção textual frágil acoplada ao source do `AppShell`.

## Validação executada

### Verde

```text
pnpm --filter @workspace/app test:auth
```

- Suite verde após a remoção da asserção textual redundante.

```text
pnpm graphify:update:ui
```

- Grafo do frontend atualizado com sucesso.

### Vermelho honesto de baseline

```text
pnpm --filter @workspace/app test:auth-sidebar
```

- Falha real de compilação do app:
  - `Module not found: Can't resolve '@workspace/api'`
  - import trace: `src/shared/hooks/useMe.ts` → `src/shared/hooks/index.ts` → `src/context/AuthContext.tsx` → `src/pages/_app.tsx`
- O runner agora encerra cedo com essa evidência, sem mascarar a falha como timeout genérico.

```text
pnpm --filter @workspace/app typecheck
```

- Continua falhando pelo mesmo baseline de ambiente:
  - `TS2307 Cannot find module '@workspace/api'`

## Preocupações remanescentes

- O smoke real fortalecido não pode fechar verde nesta terça-feira, 4 de agosto de 2026, enquanto a worktree continuar sem resolver `@workspace/api`.
- Não alterei a correção funcional do `AppShell` nesta onda; o diff desta rodada ficou restrito aos runners/testes e ao relatório.
