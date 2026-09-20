# Revisão final da migração — registro em construção

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


Atualização: 14/09/2026 UTC. **Provisório: o goal segue ativo.** Não usar este documento
como declaração de encerramento, inventário completo de impedimentos ou saldo de carga.

**Marco atual — tentativa de execução dos mapeados:** [137.818 registros reconciliados](./CARGA-MAPEADOS-2026-09-14.md),
13.063 existentes preservados, 2.281 excluídos por vínculo PEC/Triagem, 1.753 dependências,
sete conflitos de identidade e 120.714 com acesso como impedimento imediato. Nenhuma nova carga.
A correção RLS/ACL de três destinos está preparada, testada e aguardando exceção explícita à
restrição sobre permissões. As listas atuais separam 565.012 sem mapeamento completo/dependências
e 120.721 mapeados com impedimento de acesso/identidade. Esse marco supera os números da fila anterior.

**Marco posterior — mapeamento integral do recorte antes sem resultado consolidado:**
701.711 linhas em 265 origens, com 137.818 mapeadas na fila, 563.259 sem mapeamento completo
ou bloqueadas e 634 identidades existentes preservadas. [Relatório e listas individuais](./MAPEAMENTO-SALDO-2026-09-14.md).
Nenhuma nova carga nesta etapa; os resultados não certificam o saldo de INSERTs nem equivalência
integral das 634 identidades encontradas. A verificação da partição e dos apontadores de evidência passou.

| Questão confirmada até este marco | Alcance | Tratamento e evidência necessária |
| --- | --- | --- |
| PEC/Triagem excluídos | 197.402 linhas individualizadas em nove origens explícitas, das quais duas vazias | Exclusões diretas conferidas por chave/hash/localizador. Referências em outras tabelas continuam em análise; não criar representação alternativa. |
| ZIP sem binários | Todos os anexos/certificados que dependem de arquivo | Procurar no acervo disponível e confrontar vínculo/integridade; metadado não comprova arquivo migrado. |
| Referências de arquivos individualizadas para análise | 4.908 ocorrências em 4.795 linhas; 181 com apoio em código/mapeamento e 4.727 ainda hipóteses | Índice confrontado por PK/hash/localizador. Busca em 95 arquivos de oito raízes locais não encontrou correspondências por nome, sem comprovar ausência de binário. Não contar flags, IDs ou senhas como arquivos nem essas ocorrências como novas entidades. |
| Arquivos dos certificados existentes sem rastreabilidade nos campos atuais | 342 certificados PF e 439 PJ do Castelo, consulta às 03:08 UTC | Todos sem file_path/file_sha256; seis objetos no Storage do projeto não comprovam vínculo. Individualizar a lacuna de arquivo sem reinserir ou atualizar certificados existentes. |
| Export anterior não reencontrado | Comparações que dependem de 03/08 | Busca local registrada; continuar reconciliação possível pelo export disponível e recibos, sem inventar diferenças entre exports. |
| Comprovantes individuais antigos não reencontrados | Pacotes de incremento e complemento de exclusões citados nos relatórios | A busca no histórico Git disponível desses caminhos também não retornou commits. Totais documentais não substituem listas de chaves. |
| Escrita concorrente com as 122 etapas | Destinos/dependências compartilhados | Exclusividade ainda não comprovada; continuar análise independente. Arquivos existentes não provam processo vivo nem autorização para assumir sua execução. |
| Campos/datas/identidades dos demais clientes | Recortes documentados em simulações anteriores | Reconciliar individualmente; não repetir os 12 PF concluídos nem converter inválidos em nulos/defaults. |
| PF com campos obrigatórios ausentes na origem | 469 entre os 476 candidatos PF anteriores ainda não encerrados por recibo | Individualizados com origem, chave, hash, campos faltantes e evidências. Não preencher artificialmente nem considerar esse número prova de ausência no destino. |
| Demais impedimentos de conteúdo no recorte PF anterior | Seis nascimentos inválidos e um PF com telefone sem destino/data sem convenção | Individualizados. Não substituir datas nem descartar telefone. Evidência em `pf-impediments-initial/`; schema físico reconferido às 03:32 UTC. A reconciliação atual de identidade continua pendente. |
| Candidatos Integração/Regularize com impedimentos | 68 registros individualizados: 67 com datas inválidas e um com lacunas obrigatórias; dez dos 68 têm lacunas obrigatórias | Releitura do ZIP confirmou 135 ocorrências de datas inválidas e 13 lacunas de campos. Preservar todas as contribuições e questões comerciais. Não usar defaults artificiais nem converter inválidos em NULL. `client68-classification-verification.json` comprova os vínculos e a análise; identidade atual ainda não reconciliada. |
| Documentos repetidos em clientes | 431 grupos na consulta de 14/09 às 02:55 UTC | Normalização somente para comparação, removendo pontuação e filtrando comprimento 11/14; preservar todos e individualizar identidades/conteúdo antes de resolver referências. |
| Reconciliação atual de identidades dos clientes | 5.071 perfis analisados; 4.329 correspondências corroboradas para 3.791 destinos; 742 ainda sem identidade corroborada | Captura às 04:54:56 UTC e resultados em `client-identity-current/reconciliation-v2/`. Vínculo/nome/documento não provam equivalência integral. Entre os candidatos anteriores restantes, 542 não foram encontrados pelas estratégias usadas e dois têm indícios; isso não certifica ausência. |
| Clientes existentes com diferenças de conteúdo | 3.000 perfis de origem ligados a 2.462 destinos; 12.824 diferenças não temporais na projeção comparada | Individualizados como existentes divergentes preservados. A comparação usa a captura de 04:54:56 UTC; não atribui a causa à carga antiga nem escolhe precedência da origem. Corrigir esses valores exigiria alteração dos existentes, vedada neste objetivo. Outros campos/etapas do perfil continuam em revisão. |
| Demais perfis de cliente pendentes | 2.059 perfis: 742 sem identidade corroborada e 1.317 com identidade, mas convenções/campos/composição ainda não resolvidos | Inclui os 544 casos anteriores; não somá-los novamente. Coincidência normalizada não comprova preservação literal; datas civis e competências não foram convertidas para ocultar diferenças. A falta de valor na fonte não autoriza limpar o destino. |
| Sinais de duplicidade atual individualizados | 431 grupos por documento, 661 por nome e 437 por email em clientes; 3.092 grupos nas três origens | V2 separa vínculos históricos de candidatos por nome/documento. Um vínculo histórico inequívoco pode ser corroborado preservando o sinal de documento repetido. Nenhum merge, exclusão ou atualização foi autorizado por esses sinais. |
| Conteúdo não-chave repetido na origem | 9.537 grupos / 87.103 linhas, identificados individualmente; 1.548 grupos pertencem a domínios já excluídos | Sinal de análise, não classificação final de duplicidade de negócio. Preservar chaves e vínculos; não deduplicar automaticamente nem somar os membros como novas pendências. |
| Históricos H01 sem pai disponível na origem | 1.249 linhas: 309 Contábil, 604 Tarefas e 336 Regularize | Ausência conferida nas PKs completas das tabelas-pai, com referências numéricas relidas e hashes vinculados ao catálogo. Individualizados como bloqueio técnico do requisito H01; não criar pai fictício. A ausência da história em todas as representações de destino ainda não foi provada. |
| Sinais de conteúdo nas três fontes H01 | 2.506 histórias restantes com menções PEC/Triagem e 4.554 com termos ligados a credenciais | Detector anterior corrigido após comprovar escape incorreto. Revisar contexto e valores antes/depois; palavras isoladas não autorizam exclusão nem comprovam segredo. Esses sinais não foram somados como novas pendências canônicas. |
| Vínculos H01 ainda sem contrato de tabela-pai | 36.815 histórias restantes | Continuar investigação de tipo, campo e código/comprovantes disponíveis. A falta de análise do contrato não foi tratada como ausência de pai ou bloqueio definitivo. |
| Perfis dos autores H01 com login diferente | 18 usuários existentes, vinculados a 8.809 histórias | ID histórico, nomes únicos e tenant corroborados. Login diverge do valor legado bruto e das transformações comparadas. Casos individuais em `h01-current-audit/actor-profile-differences.jsonl`; preservar usuários e levar à revisão de perfis da frente correspondente. Nenhum novo usuário ou alteração de autenticação. |
| Proteção de acesso para novos históricos contábeis | 20.673 linhas com conteúdo/pai/autor/data conferidos | A auditoria está sem RLS e com SELECT para `anon`; GET sem sessão de usuário confirmou acesso à tabela com limite zero, sem recuperar linhas. Casos em `h01-contabil-flags/access-blocked-v1/`. Corrigir a proteção em uma frente autorizada para isso e renovar os demais requisitos antes de carregar; não alterar permissões neste goal. Ausência global no destino ainda não comprovada. |
| Conteúdo repetido no recorte contábil estruturado | Um grupo, duas linhas com PKs distintas | Sinal adicional nos próprios casos de acesso, sem dupla contagem, merge ou exclusão automática. A distinção entre repetição legítima do histórico e duplicidade de negócio continua para revisão. |
| Proteção dos demais destinos públicos | 103 de 111 tabelas físicas sem RLS e com SELECT para `anon`; oito com RLS | Inventário atual em `public-table-access-inventory-20260914.json`. A API foi consultada somente para auditoria; revisar exposição/políticas de cada destino relevante, sem afirmar proteção ou exposição REST de todos apenas por esse inventário. |
| Dez migrations condicionais | Schema e consumidores dos lotes possíveis | Verificar necessidade real, estado do destino, compatibilidade, acesso, ensaio e recuperação antes de aplicar. |

O [registro privado de pendências](./reports/goal-migracao/pendencias.jsonl) contém agora
224.383 linhas de origem distintas: 197.402 exclusões, 3.000 perfis existentes divergentes
preservados, 2.059 perfis de cliente pendentes — incluindo os 544 casos anteriores —,
1.249 vínculos H01 sem pai na origem e 20.673 históricos contábeis com impedimento de acesso do destino.
As conferências estão nos recibos `pending-publication-*`; a inclusão mais recente está
em `pending-publication-clientcontent-20260914.json`. Não houve dupla contagem entre os
recortes, e o conteúdo anterior foi preservado byte a byte.
O registro ainda não representa todas as origens/etapas do objetivo. Os 544 não são um saldo
certificado de entidades ausentes do destino: a reconciliação de identidade continua pendente.
O detalhe da revisão de clientes está em `client-content-review/review-v1/records.jsonl`,
com vínculo por origem/hash aos casos novos e aos 544 já registrados. Os 12 PF concluídos
permanecem fora das pendências e não foram preparados ou testados novamente. A revisão
conferiu 123.541 comparações por campo; não equivale a 123.541 registros migrados.
A classificação distinguirá migrado e verificado, existente equivalente,
existente divergente preservado, excluído por decisão, bloqueado técnico, pendente de decisão,
trabalho de outro agente e execução de resultado indeterminado.

Os 8.809 históricos já existentes foram reconciliados individualmente com o export em
`h01-current-audit/reconciliation-v1/existentes.jsonl`. São equivalentes na etapa de cópia
técnica H01: 2.279 Contábil, 6.038 Tarefas e 492 Regularize. Não foram carregados novamente
nem somados às pendências. As 18 diferenças de login têm registro separado de revisão;
não significam 18 histórias adicionais ou novos usuários, nem equivalência integral de perfis.

O lote B1 externo teve dez INSERTs confirmados e incorporados ao estado geral, com 60 campos
novos e 999 registros anteriores conferidos. Ele não integra estas pendências, não deve ser
repetido e não constitui execução das demais etapas atribuídas ao outro agente. Evidência
em `other-agent-b1-load-incorporated-20260914.json`.

Conservar o ZIP original, backup real, payloads, executores operacionais e recibos. O
[estado geral](./ESTADO-GERAL-MIGRACAO.md) registra marcos, próximos passos e limites atuais.

## Situação das dez migrations

Leituras atuais de 14/09 às 02:52–02:53 UTC: nenhuma das dez possui entrada no histórico,
as nove tabelas novas não existem, os dois índices de unicidade previstos não existem,
`minimum_wage` permanece e `integracao.tasks.responsible_id` continua obrigatório.
Nenhum DDL foi aplicado. Classificação provisória por migration:

| Migration | Situação e motivo |
| --- | --- |
| `20260906004000_task_responsible_nullable` | Pendente condicional a tarefas elegíveis com ausência legítima de responsável; requer compatibilidade do runtime, ensaio e recuperação. |
| `20260906194000_enforce_active_task_model_uniqueness` | Pendente condicional à carga de tarefas; zero grupos no pré-check atual não substitui ensaio ou reconferência sob proteção contra concorrência. |
| `20260907120000_add_project_wizard_confirmations` | Pendente de comprovar necessidade no lote; não fabricar confirmações históricas. Requer criação com proteção de acesso e compatibilidade. |
| `20260909120000_report_snapshot_blocks` | Pendente de comprovar necessidade no lote; validar leitura de snapshots anteriores com `block_id` nulo, sem reconstruí-los. |
| `20260909130000_proposal_config_name_uniqueness` | Pendente de eventual contrato de propostas; pré-check global atual sem grupos, mas representação legada ainda não comprovada. |
| `20260910120000_commercial_prospecting` | Pendente de composição comercial fiel, clientes comprovados, acesso, ensaio e compatibilidade; não acionar projeções/outbox. |
| `20260910150000_proposal_config_contract_value` | Pendente de compatibilidade e significado monetário; fotografia anterior do Prisma em execução usava a coluna antiga. Rename não converte salário mínimo em valor contratual. |
| `20260910170000_commercial_outbox_projection` | Pendente de necessidade demonstrada do schema; preenchimento das filas e projeções históricas é vedado no objetivo. |
| `20260910180000_commercial_task_billing` | FK corrigida localmente e preservada. Pendente de contratação comprovada, tarefa/projeto real, acesso, ensaio e compatibilidade, sem replay de cobrança. |
| `20260910190000_commercial_email_notifications_and_close_events` | Pendente de necessidade demonstrada do schema e compatibilidade comercial; não criar notificações/fechamentos históricos. |

A existência de consumidores no checkout não prova necessidade de aplicar todas para este
objetivo. A classificação final distinguirá as realmente necessárias das dispensáveis após
fechar os lotes possíveis. A autorização do goal cobre as ações que cumprirem suas condições;
falta de confirmação manual antiga não é o motivo desses impedimentos.


## Atualização de priorização — 14/09, 09:33 UTC

A consolidação em `reports/goal-migracao/global-triage-20260914/` mantém os mesmos
224.383 casos individuais e os organiza em dez motivos exatos, sem publicar pendências
novas nem repetir justificativas por recorte. As 312 origens estão na fila global;
a análise semântica integral e o encerramento da migração continuam pendentes.

A leitura de acesso das 09:26:30 UTC encontrou nove tabelas com RLS e 102 sem RLS/com
SELECT para anon. A mudança observada foi a proteção de `tecnologia.terms`, executada
pela frente própria com autorização específica e recibo de verificação. Os três termos
já têm decisão de datas; a falta dessa decisão deixou de ser impedimento. Nesta consulta,
o recibo de carga dos termos ainda não foi localizado.

Priorizar o encerramento desse lote; 17 outras etapas candidatas compartilham impedimentos
de acesso em 16 destinos, sem autorização específica para alterar suas permissões.
Os 48 departamentos já têm identidade corroborada no tenant, sem novo candidato de
identidade. Os campos restantes exigem revisão, preservando os existentes. A investigação
de ritmo mostrou B1 com COMMIT em 4,888 segundos; a demora observada está entre lotes.
Detalhes, limites da medição e ordem de trabalho estão no estado geral.

## Resultado L01 e pendências restantes — 14/09, 12:09 UTC

A carga de 4.578 históricos L01 foi concluída e verificada, preservando os 469.240
registros anteriores. Não repetir o lote: `dry-run/logs-l01-20260914/completion.json`.
Os três termos também foram concluídos pela frente responsável; a indicação anterior
de recibo ainda não localizado fica superada por sua verificação posterior.

Restam 2.142 linhas de logs individualizadas, sem sobreposição com o lote executado:
260 sem autor correspondente no destino; 27 sem autor localizado na origem; 79 eventos
coincidentes que exigem decisão sustentada por evidência; 1.776 fora do contrato L01
geral, com mapeamento ainda pendente. Nenhum desses números é saldo elegível para carga.
As razões compartilhadas e os localizadores individuais estão no registro privado,
que passou de 224.383 para 226.525 entradas, preservando as evidências anteriores.

Permanecem os impedimentos de acesso dos outros destinos e os contratos não comprovados.
Não houve alteração de usuários, permissões ou migrations para liberar dependências.
Os 48 departamentos já existentes continuam preservados. Esta carga não encerra a
análise semântica global nem significa que todos os dados foram migrados.


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
