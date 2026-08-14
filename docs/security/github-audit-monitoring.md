# Monitoramento do audit log do GitHub

Este controle coleta, a cada cinco minutos, eventos do audit log da organização
`IA-Pessoas` usando o endpoint REST de auditoria. O objetivo é observar todos os
repositórios atuais, forks e repositórios criados no futuro sem executar mutações.

## Operação

O workflow `.github/workflows/github-audit-monitor.yml` usa somente `contents: read`,
desabilita credenciais persistentes do checkout e executa Node.js 22. O único segredo
necessário é o token de leitura `GITHUB_AUDIT_LOG_TOKEN`, criado e mantido por um
administrador da organização. O token é injetado apenas no processo e nunca é escrito
no relatório, nos logs ou em artefatos.

A fonte autoritativa para nomes e campos de eventos é a documentação do
[audit log do GitHub](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization).
O coletor usa REST para eventos Git; GraphQL não é usado para essa finalidade. O
plano de polling depende da retenção e do plano do GitHub: se a organização precisar
de entrega contínua, o administrador deve avaliar audit log streaming e manter este
job como verificação de saúde e lacunas.

## Classificação

| Severidade | Eventos observados | Ação |
| --- | --- | --- |
| Alta | `git.push` forçado, alterações ou bypass de branch protegida, exclusão de ref, bypass de push protection, concessão de PAT e alteração de acesso do repositório | Interromper a mudança, preservar evidências e escalar imediatamente |
| Média | Revogação de PAT e eventos de credencial que não indiquem concessão | Confirmar o operador, revisar o escopo e tratar dentro do SLA de segurança |
| Baixa | `workflows.created_workflow_run` | Manter para correlação e tendência; não falha o job sozinho |
| Não classificada | Ação fora do catálogo versionado | Reter somente os campos permitidos, sem alerta automático; revisar o catálogo |

Cada alerta preserva apenas tipo e identificador sanitizado do ator, organização,
repositório, ação, ref, SHAs anterior e novo quando fornecidos, origem e timestamp.
Alertas duplicados com a mesma ação, ator, repositório, ref e timestamp são
consolidados. O coletor limita páginas para impedir crescimento sem limite e falha
quando a paginação não pode ser concluída.

## Redação e evidências

IDs e escopos de tokens, e-mails, IPs, headers de autenticação, `data` bruto,
payloads desconhecidos e corpos de resposta nunca entram no relatório. A evidência
operacional deve guardar somente o relatório sanitizado, a URL do workflow, o SHA da
execução, o período consultado e o responsável pela revisão. Restrinja os artefatos
ao time de segurança e aplique a retenção aprovada pela organização; não copie o
audit log bruto para issues, PRs ou chats.

## Resposta e lacunas

Para um alerta alto ou médio: confirmar o ator e o tipo de identidade, preservar o
relatório, proteger ou bloquear a ref afetada, revogar/rotacionar a credencial se
necessário, revisar eventos correlatos recentes e escalar ao owner do repositório e
ao administrador da organização. A equipe deve registrar severidade, owner, SLA,
horários, evidência sanitizada, contenção e decisão de encerramento.

Falha de autenticação, resposta não-2xx, JSON inválido, organização ausente, limite
de paginação ou atraso superior a dez minutos são falhas de saúde. O atraso deve ser
tratado como lacuna até que uma coleta posterior prove recuperação.

Mensalmente, execute o fixture seguro como canário em um ambiente sandbox e confirme
que um force-push controlado gera alerta alto em até cinco minutos. Trimestralmente,
realize um tabletop com os owners para testar bypass de proteção, exclusão de ref,
alteração de workflow, push protection e comprometimento de token, incluindo a
revisão de retenção e acesso aos relatórios.
