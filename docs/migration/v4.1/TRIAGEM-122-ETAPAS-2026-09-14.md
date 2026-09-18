# Triagem das 122 etapas — 14/09/2026

**Triagem concluída: 122 de 122 etapas, com situação, dependências, evidências e próxima ação.** Esta entrega não executou simulação integral por registro nem liberou cargas.

A [matriz CSV completa](./TRIAGEM-122-ETAPAS-2026-09-14.csv) individualiza todas as etapas. O pacote detalhado fica em [reports/triagem-122-2026-09-14/](./reports/triagem-122-2026-09-14/), privado e ignorado pelo Git.

## Escopo e unidades

O conjunto foi congelado pelas 122 chaves `step_id` com estado `nao_simulado_por_registro_nesta_etapa` na matriz de clientes de 13/09. As oito etapas de clientes/contribuições analisadas sem emissão e as três exclusões explícitas PEC/Triagem permanecem na matriz original de 133, que foi preservada. “122” não é o número de pessoas jurídicas, registros ausentes ou cargas aprovadas.

- **95 origens distintas** e **69 destinos** nas 122 etapas.
- **590.526 linhas de origem**. contando cada tabela uma vez. Esse volume inclui registros existentes e históricos; não é saldo a migrar.
- **5.078 chaves** do saldo recente documentado. distribuídas por **51 dessas origens**. O saldo recente completo é 23.680; os outros conjuntos não entram automaticamente nas 122 etapas.
- O inventário completo continua com 312 origens, sendo 103 com regra histórica e 209 sem etapa confirmada. A triagem das 122 não resolve as 209 origens sem mapeamento.
- Etapas irmãs repetem o volume da mesma origem no CSV. Não somar a coluna de volume entre etapas. Exemplo: tarefas têm cinco etapas; credenciais Regularize têm 19 etapas para a mesma origem.
- Zero na coluna de quarentena recente significa que a origem não consta com saldo nas 114 origens do relatório recente. Não significa ausência de passivo histórico ou validação integral da origem.

## Resultado por situação

| Situação | Etapas | Significado |
| --- | ---: | --- |
| Candidata a simulação delimitada | 19 | Há um recorte ou contrato candidato que permite organizar a simulação; identidade, conteúdo e critérios de aceite ainda precisam ser verificados. |
| Dependências ou contrato pendentes | 85 | Requer resolver pais, composição, representação, efeitos operacionais ou decisões de domínio antes de fechar payload. |
| Restrição de escopo | 12 | A operação identificada confronta uma restrição vigente; manter fora da preparação de carga e documentar a decisão necessária. |
| Histórico parcial a reconciliar | 4 | Há carga ou análise anterior documentada; primeiro separar comprovadamente existente, saldo e divergências preservadas. |
| Sem linhas no export | 2 | O SQL desta origem tem zero linhas no export de 12/09; nenhum payload a simular nesta captura. |

**Nenhuma dessas classes aprova INSERT.** Todos os registros da matriz mantêm `eligible_for_load=false` e simulação por registro não concluída nesta tarefa.

## Próximos lotes recomendados

**B1 — quatro etapas, 18 registros do recorte recente.** Começar pelos candidatos pequenos já documentados. A seleção individual precisa ser reconstruída e conferida, pois os comprovantes privados antigos desse recorte não estão nesta cópia.

| Etapa | Recorte recente | Conferência antes de fechar a simulação |
| --- | ---: | --- |
| `shared-email-recipient-insert` | 4 | Simular somente as quatro linhas com deduplicação por conteúdo, registrar preservação literal e não acionar envio. |
| `contabil-client-movement-insert` | 6 | Simular seis linhas após resolver o cliente e confrontar com os responsáveis existentes. |
| `task-model-insert` | 5 | Diagnosticar as cinco pendências: três incompatibilidades responsável/departamento e duas identidades/constantes/conteúdo ainda não validados; materializar somente o resultado liberado por caso. |
| `technology-term-insert` | 3 | Simular os três candidatos contra a captura de termos, preservando signed_at nulo quando cabível e sem declarar documento assinado. |

Nos cinco modelos express, três registros tinham bloqueio de responsável fora do departamento no diagnóstico anterior. Os outros dois também exigem revisão integral. O piloto deve classificar todos os 18, sem prometer 18 registros aptos. A referência é a [priorização anterior](./RELATORIO-QUARENTENA-2026-09-13.md#8-o-que-falta-em-ordem-objetiva).

**B2 — reconciliar quatro etapas com histórico parcial:** logs, controles contábeis, pedidos RH e mensagens RH. Os relatórios registram 3.542 logs, 169 controles, 17 pedidos e 29 mensagens carregados, além de preservações técnicas. Esses totais têm recortes próprios. A coluna recente dessas quatro etapas soma 2.333 chaves retidas; o passivo antigo é adicional e não foi deduplicado globalmente. Recuperar comprovantes disponíveis e confrontar identidades, sem reinserir cargas anteriores.

**B3 — catálogos e grupos delimitados:** seguir as etapas candidatas de prioridade 2 da matriz, começando pelas referências que desbloqueiam outros grupos. Quando houver apenas model ou contrato parcial, confirmar consumidor e semântica antes de preparar payload. Origem sem saldo recente pode requerer comparação histórica completa.

**B4 — grupos com dependências:** organizar por cliente/projeto/modelo/tarefa; PF/PJ/vínculo societário/processo/orientação; catálogo/item/movimento de estoque; configuração/ponto/ajuste/folha; score/Nitro/avaliações; cliente/parcelamento/competência; certificado/arquivo/criptografia. Não estabelecer um número fixo de registros antes de conhecer a unidade atômica. A resolução de um pai pode reutilizar um cadastro existente corroborado; não exige criar usuários, clientes ou executar todas as etapas que produzem a tabela.

As etapas X permanecem sujeitas à restrição indicada; as etapas Z não têm linhas neste export. B2, B3 e B4 são frentes de trabalho, não autorização ou cronograma obrigatoriamente serial. Um grupo independente pode avançar quando seus próprios requisitos forem satisfeitos.

Prioridades no CSV: **1**, piloto B1; **2**, demais candidatas; **3**, reconciliação ou contrato pendente; **8**, origem vazia; **9**, restrição de escopo. São prioridades de preparação, não ordem autorizada de carga.

## Schema, execução anterior e limites

- Os 69 destinos têm model no Prisma local e foram localizados no catálogo do backup coletado em 14/09 entre 00:17 e 00:19 UTC. Nenhuma coluna escalar local desses destinos ficou sem nome correspondente no snapshot. A inspeção desta tarefa comparou presença e nulabilidade; não certifica integralmente tipos, regras, permissões ou compatibilidade funcional.
- Três divergências de nulabilidade foram registradas: `users.organization_id` (Prisma opcional/banco obrigatório), `integracao.tasks.responsible_id` (Prisma opcional/banco obrigatório) e `rh.requests.assigned_to_user_id` (Prisma obrigatório/banco opcional). O texto histórico sobre correção RH não corresponde ao scalar presente no checkout desta triagem; não tratar a correção como aplicada aqui.
- As nove tabelas novas das dez migrations pendentes não são destinos destas 122 etapas. As duas migrations de tarefas constam na dependência direta de `task-insert`; a análise pode prosseguir, mas cargas específicas precisam validar nulabilidade, unicidade ativa e demais contratos. Uma entidade comercial nova exigiria decisão e escopo próprios.
- O snapshot global tem zero linhas em projetos, tarefas, vínculo Integração/Regularize, inventário TI e senhas Marketing. Isso não comprova ausência atual, identidade alternativa ou possibilidade de fabricar os pais históricos. Os demais volumes de destino do CSV também são globais, não filtrados pelo tenant Castelo.
- Consumidor localizado significa código real de `services/*-service`, não container ativo. Os fluxos atuais podem alterar saldo, status, datas, projeções, logs ou notificações. As chamadas operacionais não foram usadas como mecanismo de migração.
- Regras V4 com `merge`/`aggregate` só podem apoiar composição de entidade nova. Para destino existente, comparar e preservar. Defaults, sentinelas e campos `not_preserved` continuam exigindo decisão semântica; não reutilizar o runner V4 diretamente.
- Há 32 caminhos locais referenciados nos documentos de origem que não existem nesta cópia. A lista está no pacote privado. Totais históricos são evidência documental, e a falta do ledger impede certificar globalmente o que já foi carregado por chave.
- O backup de 14/09 é uma fotografia. Esta tarefa não renovou consultas no banco, não operou Docker, não aplicou DDL, não leu arquivos remotos de Storage e não validou exclusões históricas por registro. Seus arquivos originais foram preservados.

## Matriz de leitura rápida — 122 etapas

As evidências, impedimentos específicos, dependências e próximas ações completas estão no [CSV](./TRIAGEM-122-ETAPAS-2026-09-14.csv); a tabela abaixo é um índice. `Origem` é o total no export; `Recente` é o saldo documental e pode se repetir em etapas irmãs.

| Nº | Etapa | Origem | Recente | Situação | Lote |
| ---: | --- | ---: | ---: | --- | --- |
| 1 | `department-insert` | 48 | 0 | Candidata a simulação delimitada | B3 |
| 2 | `admin-log-insert` | 475947 | 2278 | Histórico parcial a reconciliar | B2 |
| 3 | `permission-specific-task-completion-merge` | 14 | 0 | Restrição de escopo | X |
| 4 | `permission-certificado-merge` | 69 | 2 | Restrição de escopo | X |
| 5 | `permission-comercial-merge` | 17 | 0 | Restrição de escopo | X |
| 6 | `permission-contabil-merge` | 40 | 2 | Restrição de escopo | X |
| 7 | `permission-financeiro-merge` | 12 | 0 | Restrição de escopo | X |
| 8 | `permission-fiscal-merge` | 46 | 4 | Restrição de escopo | X |
| 9 | `permission-integracao-merge` | 274 | 10 | Restrição de escopo | X |
| 10 | `permission-marketing-merge` | 94 | 1 | Restrição de escopo | X |
| 11 | `permission-parcelamento-merge` | 27 | 1 | Restrição de escopo | X |
| 12 | `permission-pessoal-merge` | 35 | 2 | Restrição de escopo | X |
| 13 | `permission-regularize-merge` | 268 | 10 | Restrição de escopo | X |
| 14 | `permission-rh-merge` | 253 | 10 | Restrição de escopo | X |
| 15 | `user-insert` | 316 | 10 | Dependências ou contrato pendentes | B4 |
| 16 | `shared-email-recipient-insert` | 26 | 4 | Candidata a simulação delimitada | B1 |
| 17 | `parcelamento-panorama-insert` | 1240 | 0 | Dependências ou contrato pendentes | B4 |
| 18 | `cbs-stock-insert` | 433 | 0 | Dependências ou contrato pendentes | B4 |
| 19 | `cbs-stock-category-insert` | 65 | 0 | Candidata a simulação delimitada | B3 |
| 20 | `cbs-stock-entry-insert` | 2215 | 0 | Dependências ou contrato pendentes | B4 |
| 21 | `cbs-inventory-category-insert` | 26 | 0 | Candidata a simulação delimitada | B3 |
| 22 | `cbs-stock-location-insert` | 27 | 0 | Dependências ou contrato pendentes | B4 |
| 23 | `cbs-stock-exit-insert` | 3000 | 0 | Dependências ou contrato pendentes | B4 |
| 24 | `certificate-pf-insert` | 802 | 8 | Dependências ou contrato pendentes | B4 |
| 25 | `certificate-pj-insert` | 803 | 23 | Dependências ou contrato pendentes | B4 |
| 26 | `contabil-client-movement-insert` | 368 | 6 | Candidata a simulação delimitada | B1 |
| 27 | `contabil-client-history-insert` | 13 | 0 | Dependências ou contrato pendentes | B4 |
| 28 | `contabil-control-insert` | 2973 | 41 | Histórico parcial a reconciliar | B2 |
| 29 | `contabil-relationship-insert` | 136 | 0 | Dependências ou contrato pendentes | B4 |
| 30 | `fiscal-icms-insert` | 368 | 0 | Candidata a simulação delimitada | B3 |
| 31 | `fiscal-ipi-insert` | 11088 | 0 | Candidata a simulação delimitada | B3 |
| 32 | `fiscal-ncm-insert` | 31362 | 0 | Candidata a simulação delimitada | B3 |
| 33 | `integration-group-insert` | 192 | 1 | Dependências ou contrato pendentes | B4 |
| 34 | `integration-pa-merge` | 1295 | 39 | Dependências ou contrato pendentes | B4 |
| 35 | `integration-pa-history-insert` | 3543 | 49 | Dependências ou contrato pendentes | B4 |
| 36 | `project-plan-insert` | 6 | 0 | Dependências ou contrato pendentes | B4 |
| 37 | `prospecting-project-insert` | 2422 | 81 | Dependências ou contrato pendentes | B4 |
| 38 | `task-model-lookup` | 27038 | 1619 | Dependências ou contrato pendentes | B4 |
| 39 | `task-model-derived` | 27038 | 1619 | Dependências ou contrato pendentes | B4 |
| 40 | `task-project-lookup` | 27038 | 1619 | Dependências ou contrato pendentes | B4 |
| 41 | `task-project-derived` | 27038 | 1619 | Dependências ou contrato pendentes | B4 |
| 42 | `task-insert` | 27038 | 1619 | Dependências ou contrato pendentes | B4 |
| 43 | `task-dependent-insert` | 26 | 0 | Dependências ou contrato pendentes | B4 |
| 44 | `task-model-insert` | 391 | 5 | Candidata a simulação delimitada | B1 |
| 45 | `termination-task-model-insert` | 0 | 0 | Sem linhas no export | Z |
| 46 | `project-plan-task-insert` | 47 | 0 | Dependências ou contrato pendentes | B4 |
| 47 | `task-regularize-link-insert` | 13 | 0 | Dependências ou contrato pendentes | B4 |
| 48 | `mkt-password-insert` | 55 | 1 | Dependências ou contrato pendentes | B4 |
| 49 | `parcelamento-client-lookup` | 13 | 0 | Dependências ou contrato pendentes | B4 |
| 50 | `parcelamento-installment-competency-insert` | 510 | 0 | Dependências ou contrato pendentes | B4 |
| 51 | `parcelamento-installment-insert` | 276 | 0 | Dependências ou contrato pendentes | B4 |
| 52 | `tb_pessoal-bem-password-insert` | 96 | 0 | Dependências ou contrato pendentes | B4 |
| 53 | `tb_pessoal-bsf-password-insert` | 46 | 0 | Dependências ou contrato pendentes | B4 |
| 54 | `pessoal-situation-insert` | 29 | 1 | Dependências ou contrato pendentes | B4 |
| 55 | `tb_pessoal-codigos_acesso-password-insert` | 15 | 0 | Dependências ou contrato pendentes | B4 |
| 56 | `tb_pessoal-contri_assis-password-insert` | 12 | 1 | Dependências ou contrato pendentes | B4 |
| 57 | `tb_pessoal-empregador_web-password-insert` | 174 | 11 | Dependências ou contrato pendentes | B4 |
| 58 | `pessoal-payroll-insert` | 185 | 0 | Candidata a simulação delimitada | B3 |
| 59 | `pessoal-ldd-insert` | 958 | 0 | Candidata a simulação delimitada | B3 |
| 60 | `pessoal-obligation-insert` | 1881 | 0 | Candidata a simulação delimitada | B3 |
| 61 | `pessoal-union-insert` | 22 | 0 | Candidata a simulação delimitada | B3 |
| 62 | `license-insert` | 342 | 2 | Dependências ou contrato pendentes | B4 |
| 63 | `credential-site-gov-br` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 64 | `credential-site-regularize` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 65 | `credential-site-simples` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 66 | `credential-site-bacen` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 67 | `credential-site-mei` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 68 | `credential-site-sefaz` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 69 | `credential-site-webiss-master` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 70 | `credential-site-webiss-cpf` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 71 | `credential-site-seifsa` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 72 | `credential-slot-gov-br` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 73 | `credential-slot-regularize` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 74 | `credential-slot-simples` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 75 | `credential-slot-bacen` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 76 | `credential-slot-mei` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 77 | `credential-slot-sefaz` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 78 | `credential-slot-webiss-master` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 79 | `credential-slot-webiss-cpf-1` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 80 | `credential-slot-webiss-cpf-2` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 81 | `credential-slot-seifsa` | 875 | 25 | Dependências ou contrato pendentes | B4 |
| 82 | `regularize-group-insert` | 116 | 5 | Dependências ou contrato pendentes | B4 |
| 83 | `regularize-group-member-insert` | 352 | 14 | Dependências ou contrato pendentes | B4 |
| 84 | `guidance-process-lookup` | 457 | 16 | Dependências ou contrato pendentes | B4 |
| 85 | `guidance-process-derived` | 457 | 16 | Dependências ou contrato pendentes | B4 |
| 86 | `guidance-insert` | 457 | 16 | Dependências ou contrato pendentes | B4 |
| 87 | `guidance-activities-aggregate` | 2615 | 118 | Dependências ou contrato pendentes | B4 |
| 88 | `guidance-partners-aggregate` | 559 | 25 | Dependências ou contrato pendentes | B4 |
| 89 | `regularize-partner-insert` | 1461 | 24 | Dependências ou contrato pendentes | B4 |
| 90 | `process-insert` | 1160 | 43 | Dependências ou contrato pendentes | B4 |
| 91 | `municipal-tax-insert` | 8 | 0 | Dependências ou contrato pendentes | B4 |
| 92 | `user-allergies-merge` | 26 | 2 | Dependências ou contrato pendentes | B4 |
| 93 | `collaborator-user-merge` | 305 | 10 | Dependências ou contrato pendentes | B4 |
| 94 | `collaborator-job-title-merge` | 305 | 10 | Dependências ou contrato pendentes | B4 |
| 95 | `user-emergency-contacts-merge` | 186 | 1 | Dependências ou contrato pendentes | B4 |
| 96 | `rh-holiday-insert` | 0 | 0 | Sem linhas no export | Z |
| 97 | `rh-point-config-insert` | 39 | 1 | Dependências ou contrato pendentes | B4 |
| 98 | `rh-time-bank-release-insert` | 2 | 0 | Dependências ou contrato pendentes | B4 |
| 99 | `rh-time-sheet-insert` | 80 | 0 | Dependências ou contrato pendentes | B4 |
| 100 | `rh-point-insert` | 2379 | 90 | Dependências ou contrato pendentes | B4 |
| 101 | `rh-time-clock-request-insert` | 146 | 8 | Dependências ou contrato pendentes | B4 |
| 102 | `rh-score-insert` | 205 | 51 | Dependências ou contrato pendentes | B4 |
| 103 | `rh-score-evaluation-insert` | 1515 | 357 | Dependências ou contrato pendentes | B4 |
| 104 | `rh-score-nitro-insert` | 48 | 0 | Dependências ou contrato pendentes | B4 |
| 105 | `rh-score-question-insert` | 26 | 0 | Candidata a simulação delimitada | B3 |
| 106 | `rh-request-insert` | 936 | 4 | Histórico parcial a reconciliar | B2 |
| 107 | `rh-request-category-insert` | 7 | 0 | Candidata a simulação delimitada | B3 |
| 108 | `rh-request-message-insert` | 1945 | 10 | Histórico parcial a reconciliar | B2 |
| 109 | `technology-stock-category-derived` | 179 | 0 | Dependências ou contrato pendentes | B4 |
| 110 | `technology-stock-location-derived` | 179 | 0 | Dependências ou contrato pendentes | B4 |
| 111 | `technology-stock-item-insert` | 179 | 0 | Dependências ou contrato pendentes | B4 |
| 112 | `technology-stock-entry-insert` | 885 | 20 | Dependências ou contrato pendentes | B4 |
| 113 | `technology-stock-exit-insert` | 874 | 24 | Dependências ou contrato pendentes | B4 |
| 114 | `technology-inventory-assigned-insert` | 663 | 3 | Dependências ou contrato pendentes | B4 |
| 115 | `technology-inventory-location-item-insert` | 42 | 1 | Dependências ou contrato pendentes | B4 |
| 116 | `technology-inventory-location-insert` | 21 | 0 | Candidata a simulação delimitada | B3 |
| 117 | `technology-inventory-category-insert` | 31 | 0 | Candidata a simulação delimitada | B3 |
| 118 | `technology-password-insert` | 179 | 0 | Dependências ou contrato pendentes | B4 |
| 119 | `technology-term-insert` | 203 | 3 | Candidata a simulação delimitada | B1 |
| 120 | `workspace-ti-request-insert` | 6 | 1 | Dependências ou contrato pendentes | B4 |
| 121 | `workspace-ti-category-insert` | 1 | 0 | Candidata a simulação delimitada | B3 |
| 122 | `workspace-ti-message-insert` | 2 | 0 | Dependências ou contrato pendentes | B4 |

## Evidências e verificação

- ZIP recontado com o parser SQL existente: 312 origens, 1.410.923 linhas e 35 tabelas vazias; hash do ZIP igual ao registrado na análise de clientes.
- Cobertura exata das 122 chaves originais, sem duplicações ou inclusão das outras 11 etapas.
- Correspondência de origem, destino e modo conferida contra as 103 regras declarativas históricas; nenhum emissor foi chamado.
- Relatório recente recontado: 114 origens e 23.680 chaves documentadas. A interseção com esta triagem usa origens únicas, evitando somar os volumes repetidos de etapas.
- Referências locais e números de linha, consistência de classes/contagens e hashes dos insumos conferidos pelo verificador do pacote. Dos 71 arquivos preexistentes monitorados, 69 mantiveram o hash. Foram observadas alterações durante a triagem em `dry-run/pf-12-executor/authorization.mjs` às 01:22:48 UTC e `PREPARACAO-PF-12-2026-09-13.md` às 01:40:21 UTC, após a baseline das 01:19:55 UTC. Os arquivos foram mantidos no estado encontrado; a autoria não foi estabelecida. A atualização documental de PF-12 continua declarando ausência de carga real e não altera o conjunto/classificação das 122 etapas. As exceções estão registradas em `preservacao-excecoes.json`; não se certifica preservação integral do workspace.
- Todos os artefatos detalhados são locais, com arquivos 0600/diretório 0700 e exclusão do Git conferida. O Markdown e o CSV contêm somente metadados e agregados.

A revisão final da consolidação foi concluída sem achados abertos. A proposta inicial dos revisores fica segregada em `initial_domain_proposal`; os campos `triage_status` e `next_action` da matriz privada registram a decisão final. O verificador concluiu **34 verificações**, incluindo os hashes de 77 arquivos locais usados como evidência. Isso verifica a entrega documental dentro dos limites e exceções descritos acima.

Pacote privado: `base-122.json`, `matriz-122.json`, `volumes-origem.json`, `destinos-triagem.json`, revisões por domínio, `referencias-ausentes.json`, `resumo.json`, `verificacao.json`, `revisao-final.md`, `evidencias-fontes-hashes.json` e scripts de coleta/consolidação. Plano: [triagem de 14/09](../../superpowers/plans/2026-09-14-triagem-122-etapas.md).
