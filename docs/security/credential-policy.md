# Política de credenciais e workflows

O `scripts/credential-policy.mjs` verifica workflows ativos e literais de credenciais
no repositório. O relatório contém somente regra, caminho, linha, severidade e
remediação; valores de segredos, payloads e trechos de origem nunca são gravados.

## Regras locais

- Todo workflow ativo declara `permissions` no topo e usa somente escopos `read` ou `none`.
- Todo `actions/checkout` usa `persist-credentials: false`.
- Segredos podem ser referenciados por `env` ou `with`, mas não podem ser impressos,
  persistidos em arquivos, expostos por `set -x` ou incluídos em headers no código.
- Tokens, chaves privadas e headers de autorização literais são bloqueados.
- `.env*`, `node_modules`, `.git`, `dist`, `.next`, `.turbo` e `graphify-out` não são
  lidos pelo scanner.

O workflow de política roda em pull requests, pushes para `develop`, `main` e
`staging`, diariamente e sob demanda. Ele usa Node.js 22, permissões somente leitura,
checkout sem credenciais persistidas e publica apenas o relatório sanitizado.

## Controles de organização e administração

Código no repositório não consegue habilitar sozinho controles de organização. Um
administrador deve configurar e auditar, no GitHub da organização, os pontos abaixo:

- bloquear PATs clássicos para automações e exigir PATs fine-grained com aprovação,
  escopo mínimo, expiração e rotação;
- preferir GitHub Apps com permissões mínimas e OIDC para acesso a nuvem, sem PAT
  pessoal em workflows;
- separar identidades humanas, Apps, Actions, deploy, backup, registry e break-glass;
- manter CI com permissões somente leitura por padrão e sem segredos de produção em
  estações de desenvolvimento ou etapas de build;
- habilitar push protection e secret scanning, revisar exceções e registrar sua
  justificativa;
- exigir revisão trimestral de identidades, permissões, expirações e acessos;
- proteger break-glass com aprovação dupla, expiração curta, auditoria e rotação;
- executar um exercício de revogação: uma credencial de teste comprometida não pode
  fazer force-push em refs protegidas nem alterar rulesets.

## Operação e resposta

1. Corrija primeiro findings de severidade alta e revogue/rotacione qualquer credencial
   que tenha sido exposta.
2. Confirme no histórico do GitHub que não houve uso indevido e registre o incidente
   sem copiar o segredo para tickets, logs ou artefatos.
3. Para exceções temporárias, registre proprietário, escopo, justificativa, data de
   expiração e revisão; nunca desabilite o scanner globalmente.
4. Faça uma revisão trimestral e uma simulação de comprometimento de token, guardando
   somente evidências sanitizadas e metadados de auditoria.
