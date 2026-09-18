# Estado geral da migração

Atualização: 15/09/2026 02:55:59 UTC. **Rodada concluída com pendências para revisão.** Este marco não declara o encerramento do objetivo global nem que todos os dados foram migrados.

**5.951 linhas de origem migradas e 5.951 INSERTs físicos nesta rodada**, com recibos independentes.

Antes desta rodada: **321.774 fontes e 320.201 INSERTs recentes**. Agora, somando as rodadas recentes: **327.725 fontes e 326.152 INSERTs**.

Permanecem **319.481 linhas sem mapeamento completo ou com dependências** e **257 mapeadas não carregadas**. As **26.123 pendências anteriores** continuam em categoria própria.

Foram reavaliadas **66.439** das **325.432** linhas da lista anterior. As outras **258.993** mantêm a análise anterior; não foram novamente examinadas nesta rodada. Pendência de mapeamento não significa impossibilidade definitiva de migração.

Backup de **560.914 linhas anteriores**, com [restauração integral: PASS](./dry-run/legacy-resume-20260915/load-restore-result.json) e [preservação de todas as linhas e campos: PASS](./dry-run/legacy-resume-20260915/load-preservation-result.json). [Acesso e ambiente finais: PASS](./dry-run/legacy-resume-20260915/final-access-environment.json): proteção das **3 tabelas** mantida e **7 serviços** preservados. [Base isolada e dois papéis de ensaio removidos](./dry-run/legacy-resume-20260915/load-trial-cleanup.json); [contêiner e PGDATA próprios removidos](./dry-run/legacy-resume-20260915/owned-trial-cleanup.json).

[Retomada da carga de históricos legados em 15/09](./CARGA-RETOMADA-LEGADO-2026-09-15.md); [percentuais atuais e nove categorias](./PROGRESSO-MIGRACAO.md); [Resumo final com hashes](./dry-run/legacy-resume-20260915/post-load/summary.json).

Resumo final SHA256: `42d0c6b8b74da1f78d55bfc9b853b26c7ccdb437bb2e5a1f5a00e905dfe020fc`.

## Histórico preservado — marcos anteriores

Todo o conteúdo abaixo registra etapas anteriores. Datas, contagens e avisos de acesso ou carga desses marcos devem ser lidos no seu contexto histórico; o estado atual está acima.


Atualização: 14/09/2026 20:24:40 UTC. **Rodada concluída com pendências para revisão.** Este marco não declara o encerramento do objetivo global nem que todos os dados foram migrados.

**86.376 linhas de origem migradas e 86.376 INSERTs físicos nesta rodada**, com recibos independentes.

Antes desta rodada: **235.398 fontes e 233.825 INSERTs recentes**. Agora, somando as rodadas recentes: **321.774 fontes e 320.201 INSERTs**.

Permanecem **325.432 linhas sem mapeamento completo ou com dependências** e **257 mapeadas não carregadas**. As **26.123 pendências anteriores** continuam em categoria própria.

Foram reavaliadas **158.568** das **423.320** linhas da lista anterior. As outras **264.752** mantêm a análise anterior; não foram novamente examinadas nesta rodada. Pendência de mapeamento não significa impossibilidade definitiva de migração.

Backup de **474.405 linhas anteriores**, com [restauração integral: PASS](./dry-run/legacy-followup-20260914/load-restore-result.json) e [preservação de todas as linhas e campos: PASS](./dry-run/legacy-followup-20260914/load-preservation-result.json). [Acesso e ambiente finais: PASS](./dry-run/legacy-followup-20260914/final-access-environment.json): proteção das **3 tabelas** mantida e **7 serviços** preservados. [Limpeza da base isolada e dos dois papéis de ensaio](./dry-run/legacy-followup-20260914/load-trial-cleanup.json); contêiner compartilhado preservado.

[Carga complementar com apoio do código legado](./CARGA-COMPLEMENTAR-LEGADO-2026-09-14.md); [percentuais atuais e nove categorias](./PROGRESSO-MIGRACAO.md); [Resumo final com hashes](./dry-run/legacy-followup-20260914/post-load/summary.json).

Resumo final SHA256: `65a4d5322443e5c20a9cdd7b323574fed0461bd000a3ced11a0ea798f5ed2a58`.

## Histórico preservado — marcos anteriores

Todo o conteúdo abaixo registra etapas anteriores. Datas, contagens e avisos de acesso ou carga desses marcos devem ser lidos no seu contexto histórico; o estado atual está acima.


Atualização: 14/09/2026 17:38:45 UTC. **Rodada concluída com pendências para revisão.** Este marco não declara o encerramento do objetivo global nem que todos os dados foram migrados.

**110.331 linhas de origem migradas e 110.331 INSERTs físicos nesta rodada**, com recibos independentes.

Antes desta rodada: **125.067 fontes e 123.494 INSERTs recentes**. Agora, somando as rodadas recentes: **235.398 fontes e 233.825 INSERTs**.

Permanecem **423.320 linhas sem mapeamento completo ou com dependências** e **257 mapeadas não carregadas**. As **26.123 pendências anteriores** continuam em categoria própria.

Foram reavaliadas **243.218** das **565.012** linhas da lista anterior. As outras **321.794** mantêm a análise anterior; não foram novamente examinadas nesta rodada. Pendência de mapeamento não significa impossibilidade definitiva de migração.

NCM: **27.233 existentes equivalentes**, **4.128 existentes divergentes preservados** e **1 pendente por data obrigatória inválida**. Nenhum novo INSERT de NCM. [Reavaliação individual NCM](./dry-run/legacy-code-load-20260914/fiscal/summary.json).

Backup de **364.052 linhas anteriores**, com [restauração integral: PASS](./dry-run/legacy-code-load-20260914/load-restore-result.json) e [preservação de todas as linhas e campos: PASS](./dry-run/legacy-code-load-20260914/load-preservation-result.json). [Acesso e ambiente finais: PASS](./dry-run/legacy-code-load-20260914/final-access-environment.json): proteção das **3 tabelas** mantida e **7 serviços** preservados. [Limpeza da base isolada e dos dois papéis de ensaio](./dry-run/legacy-code-load-20260914/load-trial-cleanup.json); contêiner compartilhado preservado.

[Carga com apoio do código legado](./CARGA-CODIGO-LEGADO-2026-09-14.md); [percentuais atuais e nove categorias](./PROGRESSO-MIGRACAO.md); [Resumo final com hashes](./dry-run/legacy-code-load-20260914/post-load/summary.json).

Resumo final SHA256: `af59a78b732394a8b33ac7c419c2a7bd54593942a5638eb8a49c2487a82f1900`.

## Histórico preservado — marcos anteriores

Todo o conteúdo abaixo registra etapas anteriores. Datas, contagens e avisos de acesso ou carga desses marcos devem ser lidos no seu contexto histórico; o estado atual está acima.


Atualização: 14/09/2026 UTC. **Fila mapeada reconciliada; novas cargas aguardam decisão delimitada de acesso.**
Este documento é o ponto de retomada do goal. Não representa liberação de todos os dados
nem substitui recibos individuais por contagens de relatórios históricos.

Marco atual: a [reconciliação dos 137.818 mapeados](./CARGA-MAPEADOS-2026-09-14.md) encontrou
13.063 existentes preservados, 2.281 exclusões PEC/Triagem por pai, 1.753 dependências,
sete conflitos de identidade e 120.714 linhas com acesso como impedimento imediato.
**Zero INSERTs e zero DDL nesta etapa.** Proposta de proteção limitada a audit_requests,
contabil.control e parcelamento.panorama preparada e testada em isolamento; ainda não aplicada.
Foi solicitada exceção à restrição de permissões. A lista atual sem mapeamento completo/dependências
tem 565.012 registros; a lista de mapeados impedidos tem 120.721.

Marco anterior: os **701.711 registros antes sem resultado consolidado** foram classificados
individualmente em **137.818 mapeados na fila**, **563.259 sem mapeamento completo ou bloqueados**
e **634 identidades existentes preservadas**. Cobertura e evidências verificadas sem duplicatas
ou omissões. [Listas e contratos](./MAPEAMENTO-SALDO-2026-09-14.md).
Essa etapa não executou INSERTs; a fila exige reconciliação atual e verificações de carga.
As 26.123 pendências anteriores e as cargas já concluídas permanecem contabilizadas separadamente.

## Autorização e limites

O objetivo autoriza análise, consultas, preparação, testes isolados, backups, cargas elegíveis,
verificações e limpeza dos próprios testes, sem confirmação manual por lote. O texto completo
e seu hash estão referenciados em `reports/goal-migracao/authorization-goal.json`.
Essa autorização substitui os avisos históricos de falta de aprovação dentro desse escopo;
não resolve ambiguidades de negócio nem dispensa controles obrigatórios da plataforma.

Destino: projeto `lfhrkztuqnokijdekjsc`, organização Castelo, sistema ativo. Manter PEC/Triagem
fora, preservar existentes sem UPDATE/DELETE/merge/reativação, não alterar autenticação ou
permissões para liberar dependências. Não inventar dados, descartar campos silenciosamente
ou gerar efeitos operacionais. Permanecer em `develop`, sem branch, commit, push, instalação,
download de imagens ou alteração dos serviços Docker existentes.

## Plano de execução e critérios de avanço

1. Consolidar exportações, tabelas, chaves declaradas, hashes e duplicidades de origem.
2. Reconciliar recibos, aliases e entregas anteriores; separar origem, entidade e operação.
3. Validar representação, referências, conteúdo, consumidores e duplicidades no destino.
4. Preparar e testar executores/lotes elegíveis com backup, recuperação e exclusividade.
5. Carregar, verificar por outra conexão e reavaliar dependentes após cada carga.
6. Individualizar pendências, classificar as dez migrations e verificar cobertura e limpeza.

O avanço depende da prova correspondente, não apenas de a etapa constar como mapeada.
Uma tabela ainda não analisada permanece em análise; não vira bloqueio definitivo.

## Marcos já reconhecidos

| Marco | Evidência e limite |
| --- | --- |
| 12 PF concluídos antes deste goal | [Carga dos 12 PF](./CARGA-PF-12-2026-09-14.md), pacote operacional e recibos privados. Integridade local do pacote revalidada com `--describe`; nenhuma repetição de preparação, testes ou carga. |
| Autorização do goal registrada | Registro privado próprio vinculado ao texto recebido; a aprovação consumida dos PF foi preservada. |
| Exportação disponível e índice concluído | ZIP de 12/09 contém 312 SQLs e nenhum binário; 185.902.502 bytes descompactados. O índice registra 1.410.923 linhas, com hashes, contagens e fingerprints dos valores conferidos pelos dois parsers. Conferência independente confirmou integridade SQLite e cobertura. São 310 tabelas com PK declarada e duas sem PK; 35 tabelas estão vazias. |
| Inventário histórico conferido | 312 origens: 103 com regra histórica e 209 pendentes. Regra confirmada não significa registro migrado. |
| Busca local de outras fontes | Pesquisa em `/root/projects` e `/tmp`, sem seguir symlinks e excluindo diretórios de dependências/build/Git, registrada em `available-local-sources.json`. Não encontrou outro export legado em arquivo compactado. Pesquisa de dumps `tb*.sql` em `/root/projects` não encontrou cópias extraídas. |
| Trabalho das 122 etapas | Dez inserções B1 confirmadas pelos recibos posteriores: quatro emails e seis movimentos. COMMIT às 05:25:04 UTC e leitura independente às 05:25:17 UTC; 60 campos novos e 999 registros anteriores conferidos. O root incorporou a evidência sem repetir execução/testes nem alterar os arquivos do outro agente. O relatório de simulação provisório não prevalece sobre esses recibos. |
| Dez migrations | Revisão documental/SQL local e leituras do destino às 02:52–02:53 UTC: dez sem entrada no histórico, nove tabelas novas ausentes, dois índices previstos ausentes. Nenhuma aplicada neste goal. |
| Contagens e duplicidades atuais | Leitura às 02:55 UTC: 3.100 clientes, 822 PF, zero projetos/tarefas no Castelo; 431 grupos de CPF/CNPJ repetidos em clientes e zero grupos de CPF em PF, pelo critério de remoção de pontuação e comprimento. Não é validação de identidade por documento nem autorização para merge. |
| Recorte anterior de clientes reconciliado com PF12 | As 12 chaves carregadas foram encontradas entre os 556 candidatos anteriores. Restam 544 nesse recorte: 476 PF, 67 Integração e uma origem Regularize. Os 469 PF com lacunas obrigatórias permanecem entre os 476. Isso não certifica ausência atual nem soma as 182 ocorrências de outra classificação como novos clientes. |
| Metadados de arquivos dos certificados | Leitura às 03:08 UTC: 342 PF e 439 PJ no Castelo; todos sem file_path e file_sha256 nos campos atuais. Storage do projeto com seis objetos. Nenhum binário/vínculo/integridade foi validado nesta consulta. |
| Impedimentos de conteúdo dos PF restantes | O recorte anterior de 476 candidatos PF se divide em 469 com lacunas obrigatórias, seis com nascimento inválido e um com telefone sem destino/data ainda sem convenção. As 26 colunas físicas de PF foram conferidas novamente às 03:32 UTC. A identidade atual de cada candidato ainda precisa ser reconciliada. |
| Exclusões explícitas individualizadas | 197.402 linhas de nove origens PEC/Triagem, incluindo duas origens vazias. Cada registro foi confrontado com chave/hash/localizador do índice; quatro testes sintéticos passaram. Referências cruzadas em outras origens continuam em análise. |
| PF com impedimentos individualizados | 476 registros vinculados ao índice e à validação anterior, excluindo as 12 chaves com recibos encerrados: 469 com lacunas obrigatórias, seis nascimentos inválidos e um telefone sem destino. Três testes da classificação passaram. Nenhuma afirmação de ausência atual no destino; a reconciliação de identidade continua pendente. |
| Demais candidatos de clientes individualizados | 68 registros: 67 Integração com datas inválidas e um Regularize com quatro informações obrigatórias ausentes. A releitura direta das três fontes contribuintes confirmou 135 datas inválidas e 13 lacunas obrigatórias em dez registros. Cinco testes passaram; todos os 135 vínculos de contribuição foram conferidos por chave e hash. Os 544 candidatos anteriores restantes têm impedimentos de conteúdo individualizados, sem conclusão sobre ausência atual no destino. |
| Reconciliação atual dos 5.071 perfis | Captura somente leitura às 04:54:56 UTC: 3.100 clientes e 822 PF. Foram corroboradas 4.313 identidades por vínculo histórico/documento/nome e 16 por documento válido único/nome, incluindo os 12 PF encerrados. São 4.329 correspondências de origem para 3.791 destinos distintos. Outros 742 perfis continuam sem identidade corroborada pelas estratégias analisadas. Isso não comprova equivalência integral de conteúdo nem ausência dos demais no destino. |
| Revisão de conteúdo dos 5.071 perfis | Usando a mesma captura datada, 3.000 perfis ligados a 2.462 destinos têm diferenças não temporais comprovadas na projeção analisada; preservar os existentes. Outros 2.059 perfis permanecem pendentes: 742 por identidade e 1.317 com identidade corroborada, mas revisão de campos/composição ainda necessária. Os 12 PF foram reconhecidos pelo recibo, sem nova preparação, testes ou comparação de carga. Não são 3.000 clientes novos nem prova de falha da migração anterior. |
| Repetições literais na origem | Zero repetições de chave ou linha completa pelo algoritmo canônico. Foram individualizados 9.537 grupos em 74 tabelas, reunindo 87.103 linhas com conteúdo não-chave igual sob chaves distintas. Destes, 1.548 grupos já pertencem ao domínio excluído. São sinais para revisão, sem autorização para merge, descarte ou deduplicação automática. |
| Revisão integral das três fontes H01 | 288.645 linhas confrontadas por chave e hashes canônicos, incluindo 8.809 já representadas no índice H01 V2 e 279.836 restantes. A detecção lexical anterior tinha escape incorreto e foi substituída com regressão comprovada. Há 2.506 linhas restantes com sinais PEC/Triagem e 4.554 com termos de credencial; são sinais para revisão, sem exclusão automática. |
| H01 sem pai disponível na origem | 1.249 casos individualizados: 309 Contábil, 604 Tarefas e 336 Regularize. A releitura das referências e o confronto com todas as PKs correspondentes descartaram diferença de representação numérica. Nenhum pai foi inventado. Quinze testes de classificação/verificação passaram; os três arquivos descartáveis foram apagados. |
| Equivalência atual dos 8.809 H01 existentes | Leitura entre 05:39:53 e 05:47:48 UTC: 2.279 Contábil, 6.038 Tarefas e 492 Regularize. Conteúdo integral, incluindo PK, ligado por SHA256 canônico ao ZIP; IDs, tenant, referência do pai, metadados técnicos e conversão civil/UTC conferidos. Conjunto estável antes/depois da paginação. São cópias técnicas já existentes, não novas cargas. Os 18 autores têm ID histórico e nome único corroborados; diferenças de login permanecem registradas. |
| Novos históricos contábeis analisados | 20.673 linhas com conteúdo estruturado e pai de origem validados; os 14 autores foram corroborados contra a captura atual de 308 usuários do tenant e os 316 usuários legados. As datas de 2023–2026 têm conversão civil/UTC única. Há um grupo de duas linhas com conteúdo não-chave repetido sob PKs distintas, mantido para revisão. Ausência global no destino e elegibilidade de INSERT ainda não estão comprovadas. |
| Impedimento de acesso da auditoria | Às 06:32–06:36 UTC, `audit_requests` estava sem RLS e com privilégios de leitura/escrita para `anon` e `authenticated`. Uma consulta GET pela API, sem sessão de usuário e com limite zero, retornou 200 e array vazio. Nenhuma linha foi recuperada e nenhuma escrita foi ensaiada. Não inserir novos históricos enquanto a proteção de acesso estiver sem solução comprovada. |
| Inventário de proteção das tabelas públicas | 111 tabelas físicas examinadas: 103 sem RLS e com privilégio de SELECT para `anon`; oito com RLS habilitada. O acesso REST foi testado somente na auditoria; habilitar RLS isoladamente também não comprova correção das políticas. O achado exige revisão das condições de acesso de outros lotes, sem mudança automática de permissões neste goal. |

O backup real preservado é anterior aos 12 PF. Não utilizá-lo como backup atual para novas
cargas. As 1.410.923 linhas de origem foram conferidas pelo catálogo; as 771.166 linhas nas
209 origens sem regra histórica e os demais recortes continuam sendo unidades de origem,
não um saldo global de INSERTs.

As consultas novas usaram `REPEATABLE READ READ ONLY`, timeouts e `ROLLBACK`.
As pré-verificações globais dos dois índices previstos retornaram zero grupos nessa captura;
devem ser renovadas antes de qualquer aplicação. Consultas e respostas estruturais/agregadas
estão nos arquivos `schema-readonly-20260914.json`, `objects-readonly-20260914.json` e
`counts-readonly-20260914.json` do pacote privado do goal. A segunda consulta conferiu os
nomes exatos dos nove objetos e dois índices contra os SQLs locais.
A consulta de arquivos está em `storage-metadata-readonly-20260914.json`. Metadados
ausentes nos certificados não demonstram inexistência de todo acervo externo.

## Trabalho em andamento e retomada

- Catálogo de origem concluído em `reports/goal-migracao/source-catalog/`. Chaves obtidas
  do DDL, incluindo ALTER após INSERT, sem a heurística `*_id`. As duas origens sem PK são
  `tb_fiscal.clientes_atacadistas` (duas linhas) e `tb_fiscal.sn_completo_sn` (vazia);
  localizadores ordinais não são identidades aprovadas para carga.
  Duas tentativas completas foram rejeitadas antes de publicação: identificador Unicode
  inicialmente recusado e divergência de fingerprint entre os parsers. Os índices parciais
  foram removidos pelo responsável. Depois das correções, a comparação integral de todos
  os valores passou: 312 tabelas e 1.410.923 linhas, exit0 na sessão97329 do catalogador.
  O índice foi gerado na sessão39578, sem mudança intermediária do código. A conferência
  independente está em `source-catalog-independent-verification.json`; não substitui
  análise de duplicidades de negócio ou verificação de migração no destino.
- Classificador `reports/goal-migracao/classify_exclusions.py` executado e confrontado
  integralmente com o índice. Distingue PEC/Triagem de nomes como `prospeccao`;
  referências em outros domínios exigem análise própria.
  O comprovante foi ampliado para identificar também o SHA256 do índice SQLite de entrada.
  Os quatro testes passaram com esse código; fixtures e script exclusivos desses testes
  foram apagados, com ausência comprovada em `classification-test-cleanup.json`.
  O classificador operacional e as duas versões do comprovante foram conservados.
- Individualização PF em `reports/goal-migracao/individualize_pf.py`: executada sobre a
  validação anterior e o mesmo índice. `pf-impediments-initial/summary.json` registra
  código, hashes, partição e limites; `pending-publication-20260914.json` comprova a
  conferência de todos os registros e sua publicação junto às exclusões.
  Fixtures e script dos três testes dessa classificação foram removidos após confronto
  integral da saída real; comprovante em `pf-classification-test-cleanup.json`.
- Grupos de repetição em `source-repetition-groups.jsonl`, com resumo em
  `source-repetition-summary.json`. Fora dos domínios diretamente excluídos, restam 7.989
  grupos e 83.748 linhas para análise semântica. Não somar esses sinais às pendências:
  eles não comprovam duplicidade de entidade nem impedimento de carga por si mesmos.
- Candidatos Integração/Regularize registrados por `individualize_client_candidates.py`,
  com saída imutável em `client-impediments-initial/`. A conferência independente releu
  os três SQLs pelo parser existente, em memória, e comparou cada contribuição com o
  hash canônico do catálogo. Evidência em `client68-classification-verification.json`.
  `clients-columns-readonly-20260914.json` registra o schema físico consultado nesta etapa;
  defaults existentes não autorizam inventar modalidade, tipo de pessoa ou data de cadastro.
  Os cinco testes e a verificação direta passaram; os dois scripts descartáveis foram
  apagados, com ausência comprovada em `client68-test-cleanup.json`. Código operacional,
  fontes, índice e evidências foram preservados. Não repetir esses testes por compactação.
- Reconciliação de comprovantes disponíveis e lacunas do acervo. O export de 03/08 e os
  pacotes individuais de incremento/exclusões não foram reencontrados nos locais pesquisados.
  Referências históricas sem arquivo não comprovam o conteúdo individual.
- Reconciliação de clientes em `client-identity-current/reconciliation-v2/`, usando a captura
  atual por hashes e a mesma normalização validada das origens. V1 foi preservada como
  substituída: tratava candidatos antigos encontrados apenas por nome como vínculos históricos.
  V2 distingue as quatro estratégias históricas documentadas dos indícios de negócio.
  Todos os 5.071 vínculos de origem/hash/localizador e destinos comparados foram conferidos
  independentemente em `client-identity-current/verification.json`; dez testes passaram.
  `test-cleanup.json` comprova a remoção do script exclusivo dos testes, preservando captura,
  código e resultados. Não repetir captura/testes apenas por compactação.
  Os 544 candidatos anteriores ainda não encerrados se dividem em 542 sem correspondência
  nas estratégias atuais e dois com indícios sem identidade provada. Ausência definitiva e
  elegibilidade não decorrem desses números. Entre os 4.333 anteriormente correspondentes,
  4.311 tiveram identidade histórica corroborada; 22 exigem revisão atual. Há ainda quatro
  correspondências por documento/nome entre as antigas identidades ambíguas e duas históricas
  entre referências pendentes; suas referências/conteúdo continuam sujeitos à análise.
  Os sinais de duplicidade atuais estão individualizados: 431 grupos por documento, 661 por
  nome e 437 por email em clientes; nenhum desses grupos foi mesclado ou descartado.
  Há também 3.092 grupos de sinais entre as três origens, sem contá-los como entidades novas.
- A revisão por campo está em `client-content-review/review-v1/`: 8.071 linhas de sete
  fontes relidas em memória e vinculadas por PK/hash integral ao catálogo; 156.899
  contribuições de campos conferidas contra o validador anterior fixado por hash.
  Foram verificados 123.541 resultados de comparação e 12.824 diferenças não temporais.
  Diferenças de tipo/modalidade, estado, contatos e facetas comerciais permanecem observações
  do contrato proposto e da captura às 04:54:56 UTC; não autorizam UPDATE nem permitem
  atribuir sua causa à carga antiga. A fonte não recebeu precedência automática.
  Os 43.034 resultados de coincidência literal e 5.815 de coincidência apenas normalizada
  são contagens de campos, não de entidades equivalentes. Há ainda 11.649 comparações
  temporais pendentes, 5.415 com valor inválido/sem regra, 1.948 com contribuições conflitantes
  e 42.856 sem valor de origem. Ausência de valor na fonte não autoriza apagar valor atual.
  `independent-verification.json` confere a partição e as diferenças. Nove testes novos
  passaram; o script e o diretório temporário foram apagados, com prova em `test-cleanup.json`.
  As 4.515 novas pendências foram publicadas; as 544 já existentes receberam links para
  esta revisão em `pending-v1/existing-pending-links.json`, sem repetir a origem no registro.
  Campos e etapas fora dessa projeção nativa continuam sujeitos à análise global; a revisão
  não certifica migração integral dos clientes nem ausência dos perfis sem identidade.
- Históricos H01: a frente responsável entregou comparação V2 de 8.809 auditorias existentes
  e estratificação das outras 279.836 linhas das três fontes. O pacote está em `h01-audit/`,
  e os estratos em diretórios `h01-extraction-*`. A lacuna de recibos completos do destino
  foi resolvida em `h01-current-audit/`: queries exatas e respostas MCP preservadas, 18 páginas
  de metadados, três páginas suplementares de SHA256 canônico e hashes do conjunto antes/depois.
  `reconciliation-v1/existentes.jsonl` individualiza os 8.809 como existentes equivalentes
  na etapa de preservação técnica H01. `independent-verification.json` confirmou as chaves,
  destinos, hashes e ausência de interseção com as 199.195 pendências canônicas.
  Candidatos técnicos condicionais não são cargas.
  A revisão principal encontrou escape duplicado nas expressões regulares literais da
  estratificação anterior: os zeros de sinais PEC/Triagem e credenciais eram falsos negativos.
  `h01-source-review/run-v1/` substitui essa detecção e liga todas as 288.645 linhas a
  chave/hash canônico do catálogo, sem reextrair SQL para o disco. Os arquivos anteriores
  foram preservados. A comparação dos 8.809 com o índice V2 foi reproduzida e depois
  complementada pela captura atual, com vínculo a cada ID e request_id da auditoria.
  Os 279.836 restantes têm autores presentes na origem e datas com calendário válido;
  nenhuma dessas verificações comprova autor/tenant atual, fuso/UTC ou elegibilidade.
  Foram encontrados 1.249 pais ausentes entre os vínculos com tabela-pai definida;
  outros 36.815 históricos ainda precisam resolver o contrato da tabela-pai. Não confundir
  falta de análise do contrato com ausência comprovada de pai.
  As observações foram comparadas literalmente com textos antes preservados: coincidência
  não é aprovação semântica automática. Os sinais lexicais também não comprovam domínio
  excluído ou segredo, nem sua ausência garante conteúdo permitido. Há 171.526 candidatos
  técnicos sem esses três sinais específicos (pai ausente, texto de observação novo ou
  indicador lexical), ainda sujeitos a conteúdo antes/depois, identidade atual, autoria,
  datas e contrato. Esse número não é saldo de INSERTs liberados.
  `h01-source-review/missing-parents-verification.json` confere os 1.249 casos por
  chave/hash/localizador e ausência da PK do pai; cinco também têm indicador lexical de
  domínio, mantido para revisão sem exclusão automática. O registro foi incorporado sem
  repetição ou alteração do prefixo anterior em `pending-publication-h01parents-20260914.json`.
  Os quinze testes novos são de classificação e leitura local, não ensaios de carga.
  `h01-source-review/test-cleanup.json` comprova a remoção dos três arquivos sintéticos
  e do diretório temporário, mantendo código, índices, resultados e recibos privados.
  Na reconciliação atual, todos os IDs H01 obedecem ao UUIDv5 documentado, e request_id
  mantém o escopo literal de origem. Os 18 autores resolvem em usuários do mesmo tenant,
  com UUID histórico e nomes coincidentes e únicos na origem e no destino. Os logins,
  entretanto, diferem mesmo após comparar os textos brutos e as transformações documentadas;
  `actor-profile-differences.jsonl` os individualiza para revisão do perfil. Nenhum login foi
  substituído e nenhuma equivalência integral de usuário foi afirmada. Essa comparação
  não assume o trabalho nem modifica arquivos da frente externa das 122 etapas.
  Datas civis dos 8.809 pertencem a 2026, correspondem ao UTC preservado e fazem a volta
  ao valor civil em America/Sao_Paulo. A análise de novos candidatos mantém suas próprias
  verificações de data, conteúdo, exclusões e referências; o lote anterior não é allowlist genérica.
  Onze testes adicionais do verificador atual passaram. O script sintético foi apagado,
  com prova em `h01-current-audit/test-cleanup.json`. Não repetir essa captura ou os testes
  apenas por compactação; renovar leituras quando uma nova carga exigir estado atual.
- Análise das 209 origens independentemente das 95 origens principais das 122 etapas.
  Dependências e destinos podem se cruzar; a ausência de interseção de tabelas principais
  não autoriza cargas simultâneas.
- Cobertura inicial por tabela registrada em `table-coverage-initial.json`: 95 origens
  principais da frente das 122 e 217 deste goal. A revisão estrutural encontrou frentes
  de composição de estoque e três históricos com contrato H01; outras origens exigem
  análise adicional. `frentes-209-review.md` distingue achados concretos de motivos históricos,
  sem promover a matriz antiga a bloqueio definitivo.
- Revalidar estado/escopo do trabalho B1 antes de qualquer carga ou criação de PostgreSQL
  descartável. No máximo um ambiente de ensaio na VPS, sempre com recursos limitados.
  A nova captura `other-agent-b1-refresh-20260914.json` confirmou os mesmos 27 arquivos
  e hashes, sem entrega adicional incorporada. Isso não demonstra exclusividade de execução.
  Posteriormente, `other-agent-b1-new-delivery-20260914.json` registrou novos artefatos e a
  [simulação B1](./SIMULACAO-B1-18-2026-09-14.md), ainda provisória naquele momento.
  A incorporação posterior está em `other-agent-b1-load-incorporated-20260914.json`: dez
  INSERTs efetivos, comparados integralmente à proposta congelada e à leitura pós-COMMIT,
  preservando 999 linhas anteriores. São operações do outro agente, não novas operações do root.
  Os 156 candidatos técnicos de modelos permanecem fora da seleção B1, e três termos têm
  semântica de datas pendente. Preservar os arquivos e não repetir o lote encerrado.
  O diretório `pg-trial/` também apareceu, sem conteúdo inspecionado; sua existência não prova
  processo vivo, mas exige conferir a ocupação real antes de criar qualquer ensaio PostgreSQL.
- Auditoria de referências de arquivos: conferir valores vazios/NULL com o parser existente,
  antes de aceitar contagens de ponteiros. `asset-directory-discovery.json` registra diretórios
  locais candidatos; código, assets estáticos, fixtures e cópias em worktrees não são prova
  de que o arquivo legado individual está disponível.
  Uma conferência independente corrigiu três contagens preliminares: cinco referências
  preenchidas em `tb_certificados.pf.arquivo`, 180 em `tb_integracao.clientes.imagem` e 144
  em `tb_integracao.pa_historicos.arquivo`; os demais valores desses campos são vazios.
  Evidência em `file-reference-count-spotcheck.json`. As contagens preliminares que indicavam
  todas essas linhas como preenchidas não podem ser usadas; é preciso distinguir valores
  vazios e NULL após a decodificação SQL. Nenhum binário foi validado nessa etapa.
  A auditoria corrigida entregou `file-reference-audit/summary-v2.json`: varredura lexical
  de 312 tabelas, com 54 candidatas e 76 colunas; todas as partições de valores e contagens
  por tabela foram conferidas, sem coluna não observada ou erro de parser. A matriz semântica
  está em revisão: nomes de coluna e tipos isolados não bastam para concluir que o valor seja
  ponteiro binário. Campos de flags, IDs e credenciais não devem ser somados a arquivos.
  A matriz V3 corrigiu as duas assinaturas RH em `varchar(20)` para indeterminadas.
  `file-reference-independent-verification.json` conferiu 4.908 ocorrências preenchidas
  ligadas a 4.795 linhas distintas por PK/hash/localizador: 4.544 ponteiros candidatos e
  364 indeterminadas. Somente 181 ocorrências têm apoio em código/mapeamento; as outras
  4.727 permanecem hipóteses por nome/tipo. Não são 4.908 arquivos migráveis ou ausentes.
  A busca por nome em oito raízes locais aceitas examinou 95 arquivos regulares, sem
  correspondências; o resultado não comprova ausência, vínculo ou integridade de binário.

## Registros e conservação

O [registro privado](./reports/goal-migracao/ledger.jsonl) recebe marcos/classificações.
As [pendências individuais](./reports/goal-migracao/pendencias.jsonl) contêm 224.383 registros:
197.402 exclusões, 3.000 perfis de cliente existentes com diferenças preservadas,
2.059 perfis de cliente pendentes de decisão/evidência — incluindo os 544 impedimentos
de conteúdo antes individualizados — e 21.922 impedimentos técnicos H01: 1.249 vínculos sem pai disponível na origem e 20.673
históricos contábeis impedidos pela proteção de acesso do destino. As publicações conferiram chaves, hashes
e localizadores, sem repetir origem/ordinal ou ID entre os grupos.
`pending-publication-h01parents-20260914.json` comprova a preservação byte a byte dos
197.946 registros anteriores e a inclusão das 1.249 novas linhas. Os snapshots de cada
geração e seus hashes estão preservados para auditoria do registro acumulado.
`pending-publication-h01access-20260914.json` comprova a inclusão dos 20.673 casos de acesso,
preservando integralmente o prefixo de 199.195 linhas e sem sobreposição com os existentes H01
ou as dez cargas B1. O grupo de duas histórias com conteúdo repetido é um sinal adicional
nesses próprios casos; não foi somado novamente.
`pending-publication-clientcontent-20260914.json` acrescentou 4.515 perfis de cliente,
preservando o prefixo de 219.868 linhas. As 544 pendências anteriores e os 12 PF encerrados
não foram acrescentados novamente. Cada origem conserva um único caso no registro acumulado.
Esse total não inclui como pendentes as origens ainda não analisadas, nem representa
entidades migradas. O [resumo de revisão](./REVISAO-FINAL-MIGRACAO.md) continua provisório.
Os 8.809 existentes equivalentes H01 ficam em arquivo próprio, referenciado pelo ledger,
sem somá-los como carga ou pendência. As 18 divergências de login dos autores também têm
registro individual separado, ainda não publicado na lista canônica; não somá-las novamente
às histórias nem tratá-las como novos usuários.

Até este marco: zero novas cargas executadas pelo root deste goal, dez INSERTs B1 externos
incorporados aos resultados, zero DDL e nenhum ambiente PostgreSQL de teste criado pelo root.
Índices, executores, rastreabilidade, relatórios e recibos são artefatos
operacionais a conservar. Somente recursos exclusivos de testes serão apagados após
  retenção de suas evidências. A limpeza final ainda requer conferência ao encerrar o objetivo.

## Retomada após a verificação de acesso

O pacote `h01-contabil-flags/` conserva a análise das 54.322 linhas contábeis, os padrões
estruturados, as correspondências de autores e os 20.673 casos com conteúdo/pai/autor/data
validados. O impedimento atual desses casos é a proteção do destino, não falta de autorização
manual do lote. Não alterar permissões para liberar essa dependência dentro deste objetivo.
As pendências estão publicadas e conferidas; não repetir a classificação nem a publicação.
Continuar a análise das outras origens, clientes, arquivos e migrations; conferir a proteção
de cada destino antes de qualquer futura carga. Não promover a amostra HTTP da auditoria a
prova de exposição de todas as outras tabelas.

Os oito testes do classificador de conteúdo já tinham passado; o resultado original foi
recuperado do comprovante da ferramenta, sem reexecução. Onze testes novos passaram para
datas civis, transições de fuso, identidade histórica, tenant e nomes únicos. A identidade
dos 316 usuários lidos da fonte foi ligada ao catálogo por chave e hash, sem persistir campos
de autenticação. Diferenças de login permanecem preservadas; não representam equivalência
integral dos perfis. A implementação usa os dados de fuso já instalados no sistema.

`h01-contabil-flags/test-cleanup.json` comprova a remoção dos três scripts temporários,
da chave publicável temporária e do diretório de testes. O código operacional, os resultados
e os recibos foram mantidos. Nenhum contêiner de ensaio ou operação Docker foi criado nesta etapa.
A primeira conferência acumulada foi interrompida antes de qualquer publicação por custo
quadrático na comparação de conjuntos. A sessão terminou com código 130 e o hash do registro
anterior permaneceu intacto. Após corrigir somente essa ineficiência, a conferência e publicação
terminaram com código zero. Evidência em `publication-performance-recovery.json`; a intenção,
os hashes e o recibo da publicação permitem resolver qualquer retomada sem append cego.


## Consolidação operacional e diagnóstico de ritmo — 14/09, 09:33 UTC

A fila global está em `reports/goal-migracao/global-triage-20260914/`: `sources-312.csv`
cobre 312 origens e 1.410.923 linhas; `candidate-queue-19.csv` reúne as candidatas;
`pending-groups.json` agrupa os 224.383 casos existentes em dez motivos exatos, com
seletores para o registro individual original. Nenhuma pendência foi reescrita.
Cobertura de inventário não significa conclusão da análise semântica de cada registro.

A captura de acesso às 09:26:30 UTC substitui os números anteriores para planejamento:
111 tabelas públicas, nove com RLS e 102 sem RLS/com SELECT para anon. Das 69 tabelas
destino das 122 etapas, 63 apresentam esse impedimento de catálogo. Das 19 etapas
candidatas, 17 apontam para 16 destinos com o impedimento. Não são 17 lotes elegíveis.
A API não foi testada em todas as tabelas; nenhuma permissão foi alterada nesta frente.

Os 48 departamentos têm identidade histórica e nome normalizado corroborados no tenant;
47 nomes coincidem literalmente. Zero novo candidato de identidade. A equivalência
integral de color/status/solution continua pendente, preservando os existentes.
Os três termos TI têm decisão de datas e proteção especificamente autorizadas; o recibo
`dry-run/termos-ti3-2026-09-14/protection-completion.json` confirma a proteção às 09:24:35 UTC.
O ensaio de carga da frente própria registra nove casos; o recibo de INSERT ainda não foi
localizado nesta consulta. Seus arquivos estão em evolução: não executar concorrentemente.

**Causa observada da demora:** tempo entre lotes e preparação fragmentada. O B1 levou
4,888 segundos do início ao COMMIT dos dez INSERTs e 20,361 segundos até a conclusão
com conferência. Às 09:33:10 UTC não havia outra sessão ativa, sessão bloqueada ou
transação ociosa no banco. Amostras da VPS mostraram 53%–72% de CPU ociosa e zero espera
de disco. Isso não mede throughput de grandes lotes nem exclui esperas intermitentes.
Evidência: `global-triage-20260914/performance-diagnosis.json`.

**Ordem de trabalho corrigida:** acompanhar o encerramento dos três termos pela frente
responsável; reutilizar testes e recibos válidos; suspender novos refinamentos individuais
H01 enquanto acesso impedir a carga; tratar acesso uma vez por destino e contratos por
grupo de dependência. A autorização específica dos termos não se estende às outras tabelas.
O pacote `h01-stage-accounting/review-v1/summary.json` já existe: reutilizar sua revisão
de autores/datas, sem reconstruí-la. Não contar análise, exclusões ou correspondências
como INSERTs. Esta consolidação executou zero cargas e preservou os recibos dos 12 PF e 10 B1.

## Carga L01 concluída — 14/09, 12:09 UTC

**4.578 históricos foram inseridos e verificados no destino**, com 36.624 campos
conferidos por conexão independente e os 469.240 registros anteriores integralmente
preservados. COMMIT confirmado às 12:09:17 UTC; verificação concluída às 12:09:43 UTC.
O intervalo entre a intenção exclusiva do lote e o COMMIT foi de 31,625 segundos.
Recibos, payload, código e hashes: `dry-run/logs-l01-20260914/`.

Passaram nove testes locais de transformação e 12 casos PostgreSQL, incluindo falha
intermediária, FK, concorrência, rollback, idempotência, restauração integral e perda da
resposta após COMMIT. Não houve UPDATE, DELETE, DDL ou alteração de permissões no destino.
A base própria de ensaio foi removida; o contêiner existente e o backup válido foram preservados.

A exportação direta do backup sofreu duas interrupções de conexão. Foi recuperada somente
a imagem de logs da cópia anterior, em base isolada própria, e comprovada sua igualdade
com TODOS os IDs e oito campos atuais. O novo backup dessa tabela foi restaurado e
conferido no ensaio; sua igualdade atual foi novamente exigida sob LOCK antes do INSERT.
Isso não torna a cópia antiga um backup atual das demais tabelas. A otimização do cálculo
de integridade evitou a serialização JSON repetida que excedia o limite das consultas.

As 475.947 linhas de origem de logs ficaram reconciliadas: 469.227 IDs históricos já
existentes, preservados sem alegação de equivalência integral com a origem; 4.578 novos
INSERTs; 2.142 casos restantes individualizados. Destes, 260 não têm autor no destino,
27 não têm autor localizado na origem, 79 coincidem na chave de negócio e 1.776 estão
fora do contrato L01 geral e ainda exigem mapeamento. Evidência:
`reports/goal-migracao/global-triage-20260914/logs-source-reconciliation.json`.
O registro privado agora contém 226.525 pendências, preservando as 224.383 anteriores.

A frente responsável pelos termos concluiu três INSERTs às 09:35:57 UTC; seu recibo
foi incorporado e conferido sem repetir a carga. Os lotes reconciliados somam 4.603
INSERTs: 12 PF, 10 B1, três termos pela outra frente e 4.578 L01. Esse total não é o
saldo completo da migração. Os demais impedimentos de acesso e de contratos permanecem;
a análise semântica de todas as origens não está encerrada.

## Percentuais consolidados — 14/09/2026

O [quadro de percentuais](./PROGRESSO-MIGRACAO.md) distribui as 1.410.923 linhas sem dupla contagem: 481.084 já encontradas no destino (34,10%, com níveis diferentes de conferência), 4.603 cargas recentes (0,33%), 197.402 exclusões de escopo (13,99%), 26.123 pendências individualizadas (1,85%) e 701.711 sem resultado consolidado (49,73%). As últimas não são necessariamente dados ausentes. O percentual exato ainda a migrar permanece a apurar. Evidências, hashes e contagens por origem em `reports/goal-migracao/progress-20260914/`. Nenhuma carga adicional nesta consolidação.


<!-- carga-mapeados-20260914-final -->
## Carga dos mapeados concluída — 14/09/2026 15:42:16 UTC

**120.464 linhas de origem migradas e 118.891 INSERTs físicos nesta rodada**, com as três frentes verificadas por conexão independente. RH: 2.435 históricos em 862 snapshots. Os 4.603 registros dos quatro lotes recentes anteriores permanecem separados. Este marco atualiza as declarações de carga pendente acima, preservadas como histórico.

Saldo final do recorte: **257 mapeadas não carregadas** e **565.012 sem mapeamento completo ou com dependências**. Zero omissões e duplicidades nas 701.711 linhas classificadas. Percentuais calculados sobre 1.410.923 linhas de origem; a migração geral ainda tem pendências.

[Resultado da rodada e listas](./CARGA-MAPEADOS-2026-09-14.md); [percentuais atualizados](./PROGRESSO-MIGRACAO.md); [resumo final com hashes](./dry-run/mapped-load-20260914/post-load/summary.json).

Proteção autorizada de **3 tabelas**, aplicada e conferida: [autorização](./dry-run/mapped-load-20260914/access-approval.json) e [resultado](./dry-run/mapped-load-20260914/protection-completion.json). A alteração ficou restrita a RLS/ACL de `audit_requests`, `contabil.control` e `parcelamento.panorama`; serviços e dados existentes foram preservados.

Backup com **245.153 linhas anteriores**, restaurado integralmente no ensaio: [manifesto](./dry-run/mapped-load-20260914/backup-current-manifest.json), [restauração: PASS](./dry-run/mapped-load-20260914/load-restore-result.json) e [preservação final: PASS](./dry-run/mapped-load-20260914/load-preservation-result.json). Todas as linhas e todos os campos anteriores das três tabelas foram conferidos.

Ensaios: [H01: 12 casos](./dry-run/mapped-load-20260914/h01/load/root-trial-result.json), [RH: 12 casos](./dry-run/mapped-load-20260914/rh/load/v2/root-trial-result.json), [Operacional: 12 casos](./dry-run/mapped-load-20260914/operational/load/root-trial-result.json); [retomada: 6 casos](./dry-run/mapped-load-20260914/resume-trial-result.json). H01 interrompeu por `lock_timeout` (`55P03`) depois de **9.000 INSERTs já verificados**. A [retomada concluída](./dry-run/mapped-load-20260914/h01/load/root-completion.json) reconferiu os lotes anteriores em conexão independente, sem repeti-los.

A primeira tentativa RH foi revertida com **zero INSERTs** após timeout de **12 segundos** (`57014`) na busca de aliases: [recibo original preservado](./dry-run/mapped-load-20260914/rh/load/batches/0001-error.json). A [execução RH v2](./dry-run/mapped-load-20260914/rh/load/v2/root-completion.json) foi concluída e verificada, com os recibos originais preservados. A busca passou a filtrar os campos físicos antes de examinar os metadados. [Medição somente leitura: PASS](./dry-run/mapped-load-20260914/rh/read-only-diagnosis-v2.json).

Resumo final SHA256: `14f616bdb90fcdafdd6d8d45f9e4e9a2f1b1288586951f8cae5c6d236f20fc3c`.


## Código PHP legado localizado — 14/09/2026

Foi recuperado o código de `Mauricio-TI-CBSE/workspace`, commit `25b11012142c6ac0eec66bd0501531c2917320e4`, com cinco arquivos conferidos por hash. A cópia local mencionada nos documentos anteriores não existe nesta VPS. [Manifesto privado](./reports/goal-migracao/legacy-source-20260914/manifest.json); [achados iniciais e pontos de continuação](./reports/goal-migracao/legacy-source-20260914/initial-findings.json).

A investigação das 565.012 linhas pendentes agora pode usar as rotinas PHP originais. Os 48.548 históricos de Parcelamento foram agrupados por tipo; há tipos e referências que exigem conferir chamadas e dados, pois comentários e comportamento não coincidem em todos os casos. O código de tarefas também contém a correspondência explícita entre campos e rótulos do histórico. Estes achados ainda não reclassificam linhas como prontas nem alteram os totais de carga. Não há informação adicional exigida do usuário neste ponto.
