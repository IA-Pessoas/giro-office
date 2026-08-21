# Rollout dos rulesets de refs protegidas

## Escopo

`.github/security/rulesets-policy.json` é a fonte versionada da política local. O verificador compara somente campos aprovados e não cria, altera ou remove rulesets.

O workflow `Ruleset Policy Drift` valida a política local em pull requests e exporta os rulesets efetivos com `gh api` em modo somente leitura nos agendamentos/manuais. O token do workflow tem apenas `contents: read` e nenhum segredo de produção.

## Sequência operacional

1. Aplicar a política em um repositório sandbox.
2. Validar push normal, force-push, exclusão de branch, push direto protegido, revisão ausente, conversa não resolvida, check ausente e movimentação de tag.
3. Repetir em um repositório não produtivo.
4. Expandir para os repositórios ativos da organização, registrando o export e os eventos de auditoria.
5. Confirmar que o check `security/supply-chain` da issue #771 e a revisão de Code Owners da #769 estão exigidos nos refs protegidos.

## Limitação de disponibilidade

O endpoint de rulesets para repositórios privados depende do plano GitHub aplicável e de um token com permissão suficiente. Se `gh api repos/<owner>/<repo>/rulesets` retornar 403, o rollout fica bloqueado até habilitar o recurso/plano ou fornecer a exportação efetiva por um operador autorizado; não se deve substituir a verificação por uma suposição local.

## Bypass e rollback

O único bypass previsto é a identidade break-glass documentada na política, com autenticação forte, finalidade, proprietário e revisão periódica. Rollback pode relaxar somente uma regra específica por exceção aprovada e expirada; nunca desabilite a proteção contra force-push ou exclusão.
