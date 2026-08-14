# Monitoramento do audit log do GitHub

Este controle coleta, a cada cinco minutos, eventos do audit log da organizacao
`IA-Pessoas` usando o endpoint REST de auditoria. O objetivo e observar todos os
repositorios atuais, forks e repositorios criados no futuro sem executar mutacoes.

## Operacao

O workflow `.github/workflows/github-audit-monitor.yml` usa somente `contents: read`,
desabilita credenciais persistentes do checkout e executa Node.js 22. O unico segredo
necessario e o token de leitura `GITHUB_AUDIT_LOG_TOKEN`, criado e mantido por um
administrador da organizacao. O token e injetado apenas no processo e nunca e escrito
no relatorio, nos logs ou em artefatos.

A fonte autoritativa para nomes e campos de eventos e a documentacao do
[audit log do GitHub](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization).
O coletor usa REST para eventos Git; GraphQL nao e usado para essa finalidade.
O parametro `include=all` e enviado explicitamente para incluir eventos web e Git.
`--since` usa a frase documentada `created:>=<ISO>`; o cursor opaco da API e aceito
separadamente por `--cursor` e somente ele e enviado como `after`.
O workflow roda no cron de cinco minutos, sempre fixa o checkout em `develop` e
consulta uma janela sobreposta dos ultimos quinze minutos. Ele nao possui
`workflow_dispatch`: execucoes com token nao podem carregar codigo de uma ref
escolhida manualmente.

O payload REST oficial minimo de `git.push` nao promete ref, indicador de force-push,
delecao ou SHAs anterior/novo. Quando esses metadados nao estao presentes, o monitor
gera `metadata-insufficient` e falha a saude sem inventar valores. A confirmacao de
ref rewrite/force-push exige uma fonte complementar suportada (por exemplo, webhook
normalizado ou audit streaming contratado). A CLI aceita um envelope `--input` com
`{"source":"normalized-webhook","events":[...]}` para essa fonte complementar;
esse caminho preserva somente o contrato sanitizado e nao afirma que REST sozinho
fornece os campos ausentes.

O plano de polling depende da retencao e do plano do GitHub. Se a organizacao precisar
de entrega continua, o administrador deve avaliar audit log streaming e manter este
job como verificacao de saude e lacunas.

## Classificacao

| Severidade | Eventos observados | Acao |
| --- | --- | --- |
| Alta | `git.push` forcado, alteracoes ou bypass de branch protegida, exclusao de ref, bypass de push protection, concessao de PAT, alteracao de ruleset e alteracao de acesso do repositorio | Interromper a mudanca, preservar evidencias e escalar imediatamente |
| Media | Revogacao de PAT e eventos de credencial que nao indiquem concessao | Confirmar o operador, revisar o escopo e tratar dentro do SLA de seguranca |
| Baixa | `workflows.created_workflow_run` | Manter para correlacao e tendencia; nao falha o job sozinho |
| Nao classificada | Acao fora do catalogo versionado | Reter somente os campos permitidos, sem alerta automatico; revisar o catalogo |

Cada alerta preserva apenas tipo e identificador sanitizado do ator, organizacao,
repositorio, acao, ref, SHAs anterior e novo quando fornecidos, origem e timestamp.
Tambem inclui `alertKey`, um SHA-256 deterministico calculado somente desses campos
sanitizados e do request/ruleset quando presentes. Consumers downstream devem
deduplicar por essa chave; a janela sobreposta entre execucoes e intencional.
Alertas duplicados com a mesma acao, ator, repositorio, ref e timestamp sao
consolidados. Eventos recentes do mesmo ator, repositorio, ref e request sao
correlacionados de forma deterministica em uma janela de dez minutos, com no maximo
200 eventos e 50 grupos por relatorio. O coletor limita paginas para impedir
crescimento sem limite, valida o host/caminho HTTPS de cada `Link: rel="next"` e
falha quando a paginacao nao pode ser concluida.

## Redacao e evidencias

IDs e escopos de tokens, e-mails, IPs, headers de autenticacao, `data` bruto,
payloads desconhecidos e corpos de resposta nunca entram no relatorio. A evidencia
operacional deve guardar somente o relatorio sanitizado, a URL do workflow, o SHA da
execucao, o periodo consultado e o responsavel pela revisao. Restrinja os artefatos
ao time de seguranca e aplique a retencao aprovada pela organizacao; nao copie o
audit log bruto para issues, PRs ou chats.

## Operacao, owner, SLA e canal

O owner operacional e `Security Engineering`, com backup do owner do repositorio
afetado. Alertas altos tem SLA de triagem de cinco minutos e medios de trinta
minutos; falha de saude ou `metadata-insufficient` tem SLA de quinze minutos. O
canal e a verificacao `security/github-audit` no GitHub Actions, consumida pelo
on-call de seguranca e pelo processo de incidentes ja aprovado. Nao ha integracao
automatica inventada com Slack, e-mail ou abertura de issue, nem permissao de escrita
adicionada ao workflow.

O artefato sanitizado tem retencao configurada de sete dias (`retention-days: 7`),
mas ACL de artefatos, acesso de membros e qualquer estado persistente sao controles
administrativos do GitHub; nao sao inventados pelo workflow nem podem ser garantidos
por `permissions: contents: read`. O repositorio nao persiste cursor ou payload.
Se o owner habilitar um sink aprovado para `alertKey`/cursor, ele deve aplicar a
retencao e ACL corporativas sem armazenar payload bruto ou token.

### Procedimento verificavel

1. Um owner da organizacao confirma em GitHub Settings que o repositorio nao publica
   artefatos para fora do escopo autorizado e que a politica de membros/artefatos do
   repositorio corresponde ao time de seguranca; registra URL, data, owner e evidencia
   no registro de seguranca aprovado.
2. O owner executa duas coletas sobrepostas no cron e compara somente
   `.alerts[].alertKey` com `jq`; chaves repetidas devem ser consolidadas pelo
   consumer downstream. O resultado da comparacao e sanitizado e nao inclui o JSON
   bruto do audit log.
3. Um administrador verifica a expiracao de sete dias no artefato da execucao e
   testa acesso com uma identidade autorizada e uma identidade sem acesso, sem copiar
   o relatorio para fora do GitHub. Falha de ACL, retencao ou deduplicacao vira
   incidente operacional; nenhuma permissao adicional e concedida automaticamente.

Apos sete dias, preserve somente a chave sanitizada do evento, decisao, owner, SLA e
referencia do incidente conforme a politica de retencao corporativa; nunca retenha o
payload bruto ou o token.

## Resposta e lacunas

Para um alerta alto ou medio: confirmar o ator e o tipo de identidade, preservar o
relatorio, proteger ou bloquear a ref afetada, revogar/rotacionar a credencial se
necessario, revisar eventos correlatos recentes e escalar ao owner do repositorio e
ao administrador da organizacao. A equipe deve registrar severidade, owner, SLA,
horarios, evidencia sanitizada, contencao e decisao de encerramento.

Falha de autenticacao, resposta nao-2xx, JSON invalido, organizacao ausente, limite
de paginacao, `metadata-insufficient` ou atraso superior a dez minutos sao falhas de
saude. O atraso deve ser tratado como lacuna ate que uma coleta posterior prove
recuperacao.

Mensalmente, execute o fixture oficial minimo e o fixture complementar normalizado
como canario em um ambiente sandbox; confirme que o primeiro gera
`metadata-insufficient` e que a fonte complementar confirma um force-push em ate
cinco minutos. Trimestralmente, realize um tabletop com os owners para testar bypass
de protecao, exclusao de ref, alteracao de workflow, push protection e comprometimento
de token, incluindo a revisao de retencao e acesso aos relatorios.
