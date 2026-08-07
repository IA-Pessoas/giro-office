# Regras de Validação Frontend

## Validação de Fechamento

- Para mudanças frontend relevantes, rodar typecheck e teste escopado do módulo quando existir.
- Para UI, validar manualmente o fluxo principal no navegador quando aplicável.
- Bridge final deve revisar mocks antigos, helpers compartilhados, CTAs sem ação, guards, loading/error/empty/success, campos sensíveis e padrões visuais.
- Não declarar a entrega como pronta sem evidência da validação rodada ou motivo claro para não rodar.

## Automação de Navegador e Sandbox

- Em tarefas frontend com screenshots, smoke visual ou automação de navegador, executar comandos de automação fora do sandbox quando houver erro `spawn EPERM` ao iniciar Chromium/headless.
- `spawn EPERM` ao lançar `chrome-headless-shell.exe` indica bloqueio do sandbox, não falha do app ou da ferramenta.
- Repetir com permissão escalada antes de investigar código, configuração ou dependências.
- Prefixos úteis: `["pnpm", "--filter", "@workspace/app", "exec", "playwright"]` e `["pnpm", "--filter", "@workspace/app", "exec", "next"]`.
- Não alterar código, configuração ou dependências para contornar sandbox sem evidência de falha real do projeto.
