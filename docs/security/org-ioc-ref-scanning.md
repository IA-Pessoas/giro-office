# Varredura organizacional de IOCs e refs

O workflow `.github/workflows/org-ioc-ref-scan.yml` inventaria todos os
repositorios visiveis da organizacao `IA-Pessoas` — inclusive privados, publicos,
arquivados, desabilitados, forks, templates e mirrors — e varre refs de branches,
tags e pull requests abertos. Ele usa clones `--mirror`, sem checkout, e somente
comandos Git de leitura. Nenhum hook, script ou configuracao do repositorio alvo e
executado.

## Credencial e permissões

`GITHUB_ORG_SCANNER_TOKEN` deve ser um token de instalacao de GitHub App dedicado,
mantido por administrador, com acesso minimo de leitura aos repositorios em escopo.
O workflow tem apenas `contents: read`, fixa todas as actions por SHA e desabilita
credenciais persistentes no checkout. O token existe somente no ambiente do processo;
ele, URLs autenticadas, conteudo de blobs e caminhos temporarios nao entram em logs,
relatorios ou artefatos.

`ORG_IOC_REF_PREVIOUS_REPORT` e o baseline sanitizado aprovado da coleta anterior.
O Node le o valor diretamente do ambiente, sem interpolacao em shell ou arquivo
temporario. O processo humano que atualiza esse segredo deve validar o JSON, registrar
a decisao e nunca armazenar conteudo de blob. Se o baseline estiver ausente ou invalido,
o job falha em vez de ignorar anomalias de refs.

O scanner usa a API REST paginada com `type=all`, limita a inventariacao a 500
repositorios/cinco paginas, e limita espelhos simultaneos a dois. Falha de API,
limite de cobertura, clone ou leitura de repositorio gera um codigo sanitizado no
relatorio e falha a verificacao para evitar lacunas silenciosas. Um operador deve
aumentar os limites de forma revisada se a organizacao ultrapassa essa cobertura.

## O que é reportado

Cada blob elegivel e lido diretamente do objeto Git e analisado uma vez por espelho;
o relatorio associa cada achado a repositorio, ref, caminho, SHA do blob, regra e
linha quando aplicavel. O conteudo nunca e incluido. As regras compartilhadas cobrem
IOCs conhecidos, configuracoes executaveis, fontes mascaradas e comandos perigosos de
editor. Achados possuem uma chave SHA-256 deterministica para deduplicacao no processo
de triagem aprovado.

Mudancas de objeto de ref em relacao ao relatorio sanitizado anterior sao marcadas
como substituicao de raiz/historico. O registro conserva somente o SHA anterior como
`cleanRecoverySha`, `backupStatus=unknown`, um caminho de rollback manual e
`approver=human-approval-required`. Isso e uma suspeita de anomalia: a confirmacao de
non-fast-forward e a preservacao de backup pertencem ao processo de resposta aprovado.

O job e estritamente somente leitura. Ele nao cria issue, alerta externo, comentario,
backup, tag, branch, merge, push ou force-push. Um writer separado, com aprovacao
humana e permissao minima especifica, pode consumir a chave de deduplicacao para abrir
uma tarefa de remediacao sem anexar conteudo sensivel. Nenhuma mudanca destrutiva e
automatica.

## Operação e rollout

1. Execute primeiro em sandbox com uma GitHub App de leitura e repositorios fixture;
   confirme cobertura, limites, redacao e artefato de sete dias.
2. Rode em producao no modo report-only e revise o relatorio sanitizado com Security
   Engineering e o owner do repositorio.
3. Habilite o cron em dias uteis. Finding, anomalia de ref, erro ou cobertura limitada
   deixa a verificacao vermelha para acionar o on-call; trate isso como alerta de
   saude ate uma coleta completa subsequente.
4. Somente depois de aprovar o consumer de triagem, habilite criacao/deduplicacao de
   issues fora deste workflow. Registre owner, decisao, SLA e referencia sanitizada;
   nunca copie blob, token ou URL autenticada para a issue.

Para investigação, preserve apenas o artefato sanitizado, URL da execucao, SHA da
execucao, janela e responsavel. A recuperacao de uma ref exige confirmacao do SHA
limpo, backup aprovado e aprovacao humana documentada antes de qualquer rollback.
