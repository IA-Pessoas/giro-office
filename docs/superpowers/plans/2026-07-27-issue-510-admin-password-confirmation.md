# Issue #510 - confirmacao antes de alterar senha

## Contexto
- Worktree: `.worktrees/issue-510-admin-password-confirmation`
- Branch: `fix/issue-510-admin-password-confirmation`
- Issue: https://github.com/IA-Pessoas/giro-office/issues/510
- Escopo: frontend, modulo Administracao/Usuarios.

## Causa provavel
`AdminUserDetailsPanel` envia `password` no payload assim que o campo "Nova senha" tem valor. O fluxo nao diferencia alteracao comum de dados cadastrais e troca de senha, entao a troca ocorre sem confirmacao explicita.

## Plano
1. Adicionar teste estatico focado em `app/src/modules/users/run-users-tests.mjs` cobrindo:
   - uso de `Dialog` no painel de detalhes;
   - abertura da confirmacao quando `formData.password.trim()` tem valor;
   - caminho sem senha continua salvando direto;
   - copy da confirmacao nao expoe a senha.
2. Alterar `app/src/modules/users/components/AdminUserDetailsPanel.tsx` com o menor diff:
   - manter montagem do payload atual;
   - extrair apenas a persistencia compartilhada entre salvar direto e confirmar;
   - abrir dialog quando houver senha preenchida;
   - cancelar fecha o dialog sem chamar update;
   - confirmar chama a persistencia existente.
3. Validar:
   - `pnpm --filter @workspace/app run test:users`
   - `pnpm --filter @workspace/app typecheck`
   - screenshot Playwright do fluxo visivel.
4. Rodar revisao local do diff antes de commit.
5. Commit, `git push --no-verify` e PR draft com evidencias.

## Fora de escopo
- Redesenhar o modal/painel.
- Alterar contrato do backend.
- Alterar metadata da issue.
