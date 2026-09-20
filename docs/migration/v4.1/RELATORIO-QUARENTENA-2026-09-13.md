# Relatório de quarentena — migração V4.1

Data: **13/09/2026**. Tenant: **Contabilidade Castelo** (nome cadastrado: Castelo Contabilidade).
Origem principal: backup legado de **12/09/2026**. Referência anterior: **03/08/2026**.
Destino já confirmado: projeto Supabase **lfhrkztuqnokijdekjsc**.

Este relatório reúne a quarentena do lote recente, os motivos por origem e as pendências
anteriores documentadas. Foi produzido exclusivamente pela leitura de arquivos locais:
**nenhuma consulta nova ao banco, carga, exclusão, sobrescrita, alteração de código da aplicação,
schema, login ou permissão foi executada para gerá-lo**.

## 1. Resultado e limites

**O recorte recente está integralmente contabilizado: 23.680 registros de origem em quarentena,
distribuídos por 114 tabelas.** Cada registro tem chave, motivo e hash da linha original
rastreáveis nos artefatos privados. Os dados brutos desse recorte continuam preservados.

**Atualização para a nova análise geral:** as exclusões históricas da V4 foram incorporadas
em um [complemento de quarentena](./QUARENTENA-EXCLUSOES-V4-2026-09-13.md), com 2.161 decisões
individuais: 2.099 registros históricos reencontrados, 21 certificados antigos que passaram
a inativos e 41 chaves novas já presentes na quarentena recente. A união desses dois
inventários tem **25.800 chaves únicas**, sem duplicação; não é o total global histórico.
O recorte fechado de 23.680 e as cargas anteriores permanecem inalterados. Ver seção 7.7.

**A quarentena de todas as migrações ainda não possui um total global único reconciliado.**
As anteriores estão documentadas abaixo, mas misturam versões de backup, diagnósticos,
grupos e registros já existentes. Este documento é completo para o inventário recente e
para as pendências documentadas nas fontes consultadas; **não certifica uma lista individual
única de todo o passivo histórico**.

| Indicador | Registros de origem | Interpretação |
| --- | ---: | --- |
| Chaves novas entre 03/08 e 12/09 | 36.285 | Universo incremental por chave; não diferença líquida de contagens |
| Transferidas/preservadas antes do último lote | 3.627 | RH e logs; somente chaves novas entram neste indicador |
| Recorte do último lote | 32.658 | 36.285 menos 3.627 |
| Carregadas/preservadas no último lote | 8.978 | 169 controles contábeis nativos e 8.809 históricos técnicos |
| Quarentena restante desse recorte | **23.680** | 32.658 menos 8.978 |
| Acumulado transferido/preservado do incremento | **12.605** | 3.627 mais 8.978 |
| Lote recente com decisão individual | 32.658 de 32.658 | Nenhuma chave sem classificação ou duplicada no inventário conferido |

A estimativa inicial de aproximadamente 36 mil se apoiava na diferença líquida de **36.043
linhas** entre backups. A comparação por chave encontrou **36.285 chaves novas**; as duas
medidas não são intercambiáveis.

Importante: o manifesto congelado de 32.658 declara que foi extraído da origem e que a
ausência no destino ainda precisava ser comprovada. Portanto, **23.680 significa retidos
para revisão, não 23.680 entidades comprovadamente inexistentes e prontas para inserir**.
Há coincidências, complementos de clientes existentes e representações ainda não aprovadas.

O último COMMIT foi registrado às **16:59:01 UTC / 13:59:01 America/Bahia**; a verificação
independente terminou às **16:59:42 UTC / 13:59:42 America/Bahia**, em 13/09.
Esses fatos vêm das evidências já produzidas, não de uma nova inspeção do banco neste relatório.
Resultado da carga: [CARGA-INCREMENTO-2026-09-13.md](./CARGA-INCREMENTO-2026-09-13.md).

## 2. Regras que permanecem vigentes

1. Migrar apenas registros ausentes, com identidade, conteúdo e destino totalmente validados,
   sempre para o tenant Castelo e respeitando as regras do sistema novo.
2. Não excluir, atualizar, sobrescrever, fazer merge/upsert, limpar ou reativar dados existentes.
   Ausência de um UUID não prova ausência da entidade sob outra identidade.
3. Não alterar schema, permissões, login, senha, serviços ou regras para acomodar dados legados.
   Iniciar o sistema ou obter sessão de usuário não é pendência deste trabalho de migração.
4. **Triagem permanece excluída por decisão do responsável. PEC também permanece excluído**,
   pois o módulo foi identificado como aposentado no sistema atual. Tabelas residuais não
   autorizam a importação.
5. Quarentena não significa perda nem exclusão do dado. Significa impedir importação automática
   enquanto houver exclusão operacional, falta de prova ou representação incompleta.
6. Não preencher lacunas com asteriscos, textos fictícios, usuários técnicos substitutos,
   datas inventadas ou outros valores artificiais. Ausência opcional legítima não é igual
   a valor inválido presente na origem.
7. A representação técnica em auditoria é limitada aos contratos e grupos já aprovados.
   Ela não autoriza criar tarefas/processos fictícios, simular eventos, disparar notificações
   ou transformar qualquer histórico em uma nova atividade operacional.

Regras detalhadas: [MAPEAMENTO.md](./MAPEAMENTO.md). Decisões antigas de limpeza,
preenchimento artificial ou fallback de usuário, quando encontradas na documentação histórica,
**não são autorização para a V4.1**.

## 3. Distribuição da quarentena recente

O agrupamento abaixo segue o namespace da **origem**, não o módulo de destino.
Por exemplo, os históricos de RH, Contábil e Triagem estão contabilizados em tb_historico.
Os valores são exclusivos por chave e somam exatamente 23.680.

| Namespace de origem | Tabelas com registros retidos | Registros em quarentena |
| --- | ---: | ---: |
| `tb_admin` | 16 | 2.380 |
| `tb_cbc` | 5 | 567 |
| `tb_certificados` | 3 | 195 |
| `tb_comercial` | 1 | 87 |
| `tb_contabil` | 4 | 111 |
| `tb_financeiro` | 1 | 24 |
| `tb_fiscal` | 2 | 813 |
| `tb_historico` | 23 | 14.132 |
| `tb_integracao` | 14 | 2.338 |
| `tb_mkt` | 1 | 1 |
| `tb_pec` | 1 | 1.489 |
| `tb_pessoal` | 3 | 13 |
| `tb_regularize` | 20 | 888 |
| `tb_rh` | 10 | 534 |
| `tb_tecnologia` | 7 | 67 |
| `tb_triagem` | 2 | 40 |
| `tb_workspace` | 1 | 1 |
| **Total** | **114** | **23.680** |

### Exclusões de Triagem e PEC

- **Triagem, origens diretamente classificadas:** 6.387 registros: 5.667 históricos,
  614 documentos fiscais, 49 documentos contábeis, **15 nuvens contábeis**, 20 campos,
  20 prioridades e duas permissões.
- **Triagem dentro do histórico contábil:** outros 66 registros, sendo 49 eventos de
  documentos e 17 de nuvens. Total explicitamente atribuível à Triagem: **6.453**.
- **PEC, origens diretamente classificadas:** 1.489 notas e três permissões, total **1.492**.
- Há ainda **229 históricos de tarefas** com motivo combinado de exclusão PEC/Triagem.
  O classificador não separa esse total por um dos dois domínios; não atribuí-lo integralmente
  a ambos. A união dessas exclusões é **8.174 registros**, já incluídos nos 23.680.

Os 15 registros de tb_contabil.nuvens receberam motivo principal genérico no ledger,
mas a revisão complementar registra expressamente DOMINIO_TRIAGEM_EXCLUIDO.
Este relatório usa essa evidência mais específica sem modificar o ledger.
A existência anterior de 630 notas PEC condicionais não as torna candidatas liberadas:
a decisão posterior excluiu o domínio inteiro. Nenhuma nota existente foi removida.

## 4. Motivos exatos do saldo dos quatro sublotes tratados

As contagens desta seção vêm dos motivos principais por registro no ledger final.
Dentro de cada tabela abaixo elas são exclusivas e fecham o respectivo saldo. Não são
contagens preliminares de elegibilidade nem novas linhas a adicionar ao total.

### 4.1. Histórico de tarefas — 2.381 retidos

| Motivo registrado | Quantidade | O que está pendente |
| --- | ---: | --- |
| unreviewed_freeform | 1.615 | Revisar conteúdo livre e sensível; definir representação fiel e permitida, sem publicar segredos na auditoria |
| excluded_pec_triagem | 229 | Manter exclusão operacional; não reclassificar como outra atividade para contornar a decisão |
| invalid_enum_literal | 303 | Comprovar significado dos valores fora do conjunto validado, sem substituir por enum arbitrário |
| IDENTIDADE_AUTOR_NAO_COMPROVADA | 192 | Corroborar identidade histórica do autor no tenant, além de mera coincidência de ID/nome |
| ID_NAO_LOCALIZADO | 41 | Resolver a referência de identidade usada na validação de autoria; não criar usuário substituto |
| invalid_date_literal | 1 | Resolver o literal de data rejeitado com evidência da origem, sem inventar data |
| **Total** | **2.381** | 6.038 outros históricos já preservados e descontados |

Um literal antigo nos campos de antes/depois pode ser preservado como informação técnica
quando o contrato assim o validar; isso não permite gravar uma data principal inválida.
Texto livre retido não é prova de que todos esses registros contenham segredo: significa
que não passaram pelo classificador de conteúdo seguro.

### 4.2. Histórico Regularize — 2.087 retidos

| Motivo registrado | Quantidade | O que está pendente |
| --- | ---: | --- |
| content_not_allowlisted | 991 | Validar conteúdo e representação fora da lista aprovada |
| agenda_registration_wrong_source_key | 468 | Resolver referência histórica inconsistente da agenda com prova independente |
| credentials_or_permissions_excluded | 330 | Manter dados de senhas/permissões fora da preservação autorizada; 305 eventos de senha e 25 de permissão |
| IDENTIDADE_AUTOR_NAO_COMPROVADA | 251 | Comprovar autor histórico e vínculo com o tenant |
| membership_entry_parent_not_identified | 24 | Identificar univocamente a relação societária de origem; não confundir pessoa com vínculo pessoa/empresa |
| ID_NAO_LOCALIZADO | 17 | Resolver referência de identidade da autoria sem criar substituto |
| history_type_not_approved | 6 | Validar semântica e representação específica do tipo histórico |
| **Total** | **2.087** | 492 outros históricos já preservados e descontados |

A revisão anterior encontrou dois problemas de referência no código legado: o registro de
agenda consultava a última chave de uma tabela de Integração antes da inserção Regularize;
o evento de entrada de sócio registrava a chave da pessoa, não necessariamente a chave
do vínculo societário. Por isso não basta casar números iguais. São constatações sobre a
origem, não solicitações para corrigir o código legado.

Os **468 históricos de agenda desta tabela** e os **468 eventos de tb_regularize.agenda**
são linhas de origens diferentes. Ambos aparecem no inventário, sem serem confundidos
com 468 entidades nativas já validadas.

### 4.3. Histórico Contábil — 140 retidos

| Motivo registrado | Quantidade | O que está pendente |
| --- | ---: | --- |
| unconstrained_free_text | 62 | Revisar texto livre e contrato de preservação, inclusive conteúdo sensível |
| triagem_excluded | 49 | Manter exclusão de Triagem |
| triagem_cloud_excluded | 17 | Manter exclusão de nuvens do fluxo de Triagem |
| source_parent_missing | 12 | Localizar e comprovar o pai na origem; não criar pai fictício |
| **Total** | **140** | 2.279 outros históricos já preservados e descontados |

### 4.4. Controles contábeis nativos — 41 retidos

| Motivo registrado | Quantidade | O que está pendente |
| --- | ---: | --- |
| DOCUMENTO_CLIENTE_NAO_UNIVOCO | 28 | Desambiguar o cliente com provas adicionais; documento coincidente não seleciona automaticamente um registro |
| CLIENTE_COMPETENCIA_JA_EXISTENTE | 11 | Preservar o controle existente; comparar conteúdo e documentar equivalência/divergência, sem criar segundo controle |
| IDENTIDADE_INTEGRACAO_NAO_COMPROVADA | 1 | Comprovar a identidade do cliente de Integração |
| IDENTIDADE_REGULARIZE_NAO_COMPROVADA | 1 | Comprovar a identidade do cliente de Regularize |
| **Total** | **41** | 169 outros controles já carregados e descontados |

A regra de unicidade cliente/competência deve ser respeitada mesmo quando a identidade
técnica proposta for diferente. Um histórico técnico pode estar preservado sem que um
novo controle nativo seja criado: são representações distintas, não permissão para
ultrapassar a regra do controle.

## 5. Pendências e critérios de liberação

Os códigos P01–P10 identificam o trabalho que falta nas tabelas da seção 6.
São critérios de revisão, **não autorização de nova carga**. Um registro só pode sair da
quarentena depois de cumprir todas as exigências aplicáveis ao seu grupo.

| Código | Pendência | Critério de encerramento |
| --- | --- | --- |
| P01 | Exclusão operacional: PEC/Triagem | Manter fora. Só reavaliar após mudança explícita da decisão e comprovação do contrato funcional atual; não criar outro destino para contornar a exclusão |
| P02 | Operação proibida ou fora do escopo | Não alterar usuário, credencial, permissão, saldo de cadastro agregado ou estado existente. Uma solução que exija mutação continua bloqueada; ampliar escopo requer decisão separada |
| P03 | Identidade e conteúdo do destino | Comparar origem 03/08, origem 12/09 e conteúdo do destino; resolver aliases, unicidade, tenant e possíveis exclusões. Falta de ID ou coincidência de nome não basta |
| P04 | Pais, vínculos e grupos completos | Provar todos os pais reais e a composição integral; não sintetizar projeto, pedido, score, relação societária ou outro pai. Complemento que exige UPDATE permanece fora |
| P05 | Datas, enums e estados | Comprovar valores, semântica, fuso e cronologia; valores inválidos não viram nulos/defaults silenciosos. Nulo opcional legítimo segue o contrato do destino |
| P06 | Mapeamento completo e serviço atual | Validar campo a campo e por etapa de destino, incluindo identidade de negócio e consumidor atual. Regra antiga, model residual ou API legada não bastam |
| P07 | Arquivos e dados sensíveis | Comprovar binário, vínculo, Storage/metadados e compatibilidade criptográfica quando aplicável; não expor segredos, importar ponteiro sem arquivo ou simular assinatura |
| P08 | Histórico técnico específico | Validar contrato delimitado, tipo, autor, data e conteúdo; obter decisão específica se precisar ampliar representação. Não simular eventos operacionais nem usar auditoria como depósito genérico |
| P09 | Efeitos do fluxo operacional | Provar que a importação não muda saldo/status, dispara avisos, envia e-mails, executa aprovação/conclusão ou reprocessa automações; respeitar as regras atuais |
| P10 | Reconciliação das quarentenas anteriores | Identificar backup, tabela, chave e etapa de destino; descontar comprovadamente migrados, separar existentes/divergências e deduplicar relatórios históricos |

A revisão complementar de 110 origens não encontrou outro payload integralmente aprovado
para inserção. Os quatro sublotes principais tiveram seu saldo apurado separadamente.
Assim, **nenhum registro remanescente pode ser tratado como “pronto, só falta executar”**
com base nos artefatos atuais.

## 6. Inventário completo do recorte recente, por tabela

Esta seção lista **todas as 114 origens** com registros retidos; a soma é **23.680**.
Quantidade significa chaves de origem únicas em quarentena, não total de linhas da tabela legada.

Os motivos e a situação da revisão são copiados/sintetizados das evidências de fechamento.
Detalhes como quantidades de destinos e disponibilidade de serviços referem-se à captura
e à revisão anteriores à carga, não a uma leitura atual feita para este documento.

**Cuidado com motivos por grupo:** códigos complementares aplicados à tabela inteira não
comprovam que todas as suas linhas tenham cada problema. Por exemplo: 80 dos 81 clientes
tinham erro de data; três de cinco modelos express tinham conflito de departamento;
21 dos 23 certificados PJ tinham data de pagamento zero. As exceções continuam pendentes
pelos outros requisitos, não por um erro que não foi identificado nelas.

### tb_admin — 2.380 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_admin.logs` | 2.278 | **Bloqueio comprovado:** As 2.278 chaves estão na quarentena existente: 1.637 referências de entidade sem mapeamento, 776 autores não validados, 36 coincidências de eventos; motivos se sobrepõem. Nenhuma inclui o passivo antigo. | P03, P10 |
| `tb_admin.permissoes_atendimento` | 1 | **Fora do escopo:** Linha de acesso não é dado operacional liberado; atendimento está retirado. | P02 |
| `tb_admin.permissoes_certificado` | 2 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_contabil` | 2 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_fiscal` | 4 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_integracao` | 10 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_marketing` | 1 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_parcelamento` | 1 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_pec` | 3 | **Exclusão operacional:** PEC inteiro excluído, inclusive os antigos candidatos condicionais; nenhuma promoção por tabela residual notes. | P01 |
| `tb_admin.permissoes_pessoal` | 2 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_regularize` | 10 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_rh` | 10 | **Fora do escopo:** Etapas V4 fazem merge em permissions. O pedido veda alteração de permissões; não criar concessões nem executar realinhamento de níveis. | P02 |
| `tb_admin.permissoes_triagem` | 2 | **Exclusão operacional:** Triagem inteira excluída. Documentos e nuvens participam desse fluxo legado; não criar representação alternativa em Contábil/Fiscal. | P01 |
| `tb_admin.responsaveis` | 42 | **Representação pendente:** Vínculo por cliente/usuário/departamento com observação; destinos departamentais atuais não preservam a linha integralmente pelo mapeamento existente. | P03, P06 |
| `tb_admin.responsaveis_contatos` | 2 | **Representação pendente:** Origem guarda id/user, sem contato ou relação suficiente para construir entidade atual. | P03, P06 |
| `tb_admin.usuarios` | 10 | **Bloqueio comprovado:** 10 novos usuários sem ID localizado; os 10 têm nascimento/demissão/admissão Domínio zero; 2 colidem no login do lote. Acesso, perfil composto e credencial não estão integralmente validados. | P02, P03, P05 |

### tb_cbc — 567 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_cbc.emails` | 4 | **Candidato não liberado:** 4 linhas com email sintaticamente válido, responsável preenchido e flags exatas 0/1; sem coincidência de email na origem completa e sem IDs históricos encontrados. Um registro sofre normalização textual V4. Falta comparar email/responsible/flags dos 22 destinos, identidade alternativa/exclusões e preservar texto com decisão explícita. Não bloquear como serviço inexistente. | P03, P06 |
| `tb_cbc.notificacoes_popup` | 204 | **Representação pendente:** Título/mensagem/link e ícone não têm preservação aprovada em notificações atuais; não emitir novos avisos operacionais. | P06, P09 |
| `tb_cbc.orcamentos` | 79 | **Representação pendente:** 79 linhas de itens; não há identidade estável do orçamento-pai nem projeção integral validada de title/status/items. Budget da API legada não prova serviço atual. | P03, P06 |
| `tb_cbc.preferencias` | 10 | **Representação pendente:** 10 preferências sem etapa aprovada de preservação; não alterar preferências/acesso atuais por correspondência de usuário. | P03, P06 |
| `tb_cbc.sininhos` | 270 | **Representação pendente:** 270 avisos legados sem regra integral de destinatário, referência, leitura e identidade; não reproduzir notificações atuais. | P06, P09 |

### tb_certificados — 195 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_certificados.notificacoes.vencimento_certificados` | 164 | **Representação pendente:** Há serviço atual de notificações, mas não há mapper validado da linha legada para notification.certificate com vínculo/identidade/tipo/leitura; não disparar rotina de vencimento. | P06, P09 |
| `tb_certificados.pf` | 8 | **Bloqueio comprovado:** 8 candidatos sem ID; todos têm data_pagamento zero, um também validade zero. Faltam prova de arquivos/criptografia e comparação de conteúdo/identidade de negócio dos 342 destinos. | P03, P05, P07 |
| `tb_certificados.pj` | 23 | **Validação e bloqueios:** 23 candidatos sem ID; 21 com data_pagamento zero. Os outros 2 não estão rejeitados só por associação ao lote: ainda exigem conteúdo, arquivos/criptografia e identidade de negócio, ausentes da captura de 439 IDs. | P03, P05, P07 |

### tb_comercial — 87 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_comercial.cobrancas_descricao` | 87 | **Representação pendente:** C02 é documental; sem mapper integral de cobrança. Destino tem zero tarefas/projetos. Não inventar tarefa nem preencher hiring_status arbitrariamente; schema comercial ainda exige conferência específica. | P03, P04, P06 |

### tb_contabil — 111 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_contabil.clientes_mov` | 6 | **Candidato não liberado:** 6 registros simples id/cliente_id/mov, mapper INSERT existente. Resolver cliente com conteúdo e comparar client_id dos 361 responsáveis atuais: o serviço proíbe outro por cliente/tenant mesmo com UUID distinto. Sem essa leitura não é payload aprovado. | P03, P06 |
| `tb_contabil.controle` | 41 | **Bloqueio comprovado:** 41 controles retidos: 11 pares cliente/competência já existentes, 28 documentos não unívocos e 2 identidades sem prova. Os 169 controles nativos carregados já foram descontados. | P03, P04 |
| `tb_contabil.documentos` | 49 | **Exclusão operacional:** Triagem inteira excluída. Documentos e nuvens participam desse fluxo legado; não criar representação alternativa em Contábil/Fiscal. | P01 |
| `tb_contabil.nuvens` | 15 | **Exclusão operacional:** Triagem inteira excluída. Documentos e nuvens participam desse fluxo legado; não criar representação alternativa em Contábil/Fiscal. | P01 |

### tb_financeiro — 24 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_financeiro.contratos` | 24 | **Representação pendente:** 24 contratos sem etapa aprovada; não substituir por faceta financeira do cliente, anexo ou cobrança comercial. | P03, P06 |

### tb_fiscal — 813 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_fiscal.documentos` | 614 | **Exclusão operacional:** Triagem inteira excluída. Documentos e nuvens participam desse fluxo legado; não criar representação alternativa em Contábil/Fiscal. | P01 |
| `tb_fiscal.iss` | 199 | **Representação pendente:** 199 linhas cliente/faturado/competência; serviço Fiscal atual cobre NCM/ICMS/IPI, sem destino ISS fiel no mapeamento. | P03, P06 |

### tb_historico — 14.132 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_historico.admin` | 235 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.admin_usuarios` | 22 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.certificado` | 185 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.contabil` | 140 | **Bloqueio comprovado:** 140 históricos retidos: 62 textos livres, 66 eventos de Triagem e 12 pais ausentes na fonte. Os 2.279 preservados em auditoria já foram descontados. | P01, P04, P08 |
| `tb_historico.financeiro` | 24 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.fiscal` | 295 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao` | 19 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao_clientes` | 175 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao_exclusoes` | 337 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao_grupos` | 1 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao_objetivos` | 29 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao_pas` | 526 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao_pas_historicos` | 50 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao_prospeccao_comercial` | 410 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.integracao_tarefas` | 2.381 | **Bloqueio comprovado:** 2.381 históricos retidos: conteúdo livre, domínio excluído, literal de enum/data inválido ou autoria sem prova. A decomposição exata está na seção 4. Os 6.038 preservados em auditoria técnica já foram descontados. | P03, P05, P08 |
| `tb_historico.integracao_tarefas_express` | 5 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.marketing` | 1 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.pessoal` | 79 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.regularize` | 2.087 | **Bloqueio comprovado:** 2.087 históricos retidos: conteúdo fora da lista autorizada, autoria, senha/permissão, tipo não aprovado e referências de agenda/sócio inconclusivas. Decomposição na seção 4; 492 preservados já descontados. | P03, P05, P07, P08 |
| `tb_historico.rh` | 1.079 | **Fora do escopo:** 1.079 históricos restantes: R03 cobre grupos RH específicos já carregados; não é aprovação genérica para histórico RH. Não acrescentar déficits antigos ao recorte. | P03, P05, P08 |
| `tb_historico.tecnologia` | 384 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |
| `tb_historico.triagem` | 5.667 | **Exclusão operacional:** Triagem inteira excluída. Documentos e nuvens participam desse fluxo legado; não criar representação alternativa em Contábil/Fiscal. | P01 |
| `tb_historico.workspace` | 1 | **Fora do escopo:** Histórico desta origem não integra as três extensões de preservação autorizadas. Sem mapper nativo integral aprovado; não fabricar ENTITY_CHANGE, ator atual, FK ou snapshot genérico. | P03, P05, P08 |

### tb_integracao — 2.338 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_integracao.clientes` | 81 | **Bloqueio comprovado:** 81 novos sem ID; diagnóstico existente identifica 80 com ao menos uma data inválida na composição. O único sem erro de data também tem composição comercial/status/referências não validada; não é candidato totalmente pronto. | P03, P04, P05, P06 |
| `tb_integracao.cobrancas_novas` | 8 | **Representação pendente:** C02 é documental; sem mapper integral de cobrança. Destino tem zero tarefas/projetos. Não inventar tarefa nem preencher hiring_status arbitrariamente; schema comercial ainda exige conferência específica. | P03, P04, P06 |
| `tb_integracao.grupos` | 1 | **Validação pendente:** Mapper V4 existe e origem é simples; 1 grupo Integração e 5 Regularize sem colisão de nome na própria origem; os 5 Regularize têm A (ativo). Captura possui apenas 302 IDs. Busca nos serviços atuais não encontrou consumidor Group/ClientsGroup; não usar serviços legados como prova. Conferir disponibilidade funcional e identidade por conteúdo antes de promover. | P03, P06 |
| `tb_integracao.objetivos` | 29 | **Representação pendente:** 29 objetivos sem etapa integral; zero projetos atuais. Não derivar objetivo de solução nem sintetizar projeto para encaixar a linha. | P03, P04, P06 |
| `tb_integracao.pa` | 39 | **Validação pendente:** 39 linhas; etapa V4 é merge da faceta clients.pa, não INSERT independente validado. Exige comprovar pai e ausência/conteúdo da faceta; atualizar pai existente é vedado. | P02, P04, P06 |
| `tb_integracao.pa_historicos` | 49 | **Validação pendente:** 49 históricos de negócio possuem mapper para clients.history e serviço atual. Não confundir com históricos técnicos tb_historico. Captura contém apenas 3.459 IDs; validar pai, autor, data civil, arquivo e coincidências de conteúdo. | P03, P04, P05, P07 |
| `tb_integracao.prospeccao_comercial` | 81 | **Representação pendente:** 81 linhas; V4 emite faceta clients/projeto e não o contrato comercial C01 completo. 66 datas de fechamento zero. Não disparar outbox/email; zero projetos não autoriza derivação automática. | P03, P04, P05, P06 |
| `tb_integracao.segmentos` | 4 | **Representação pendente:** 4 itens de catálogo sem destino/etapa aprovados; não confundir segmento legado com enum/campo comercial atual. | P03, P06 |
| `tb_integracao.tarefas` | 1.619 | **Bloqueio comprovado:** 1.619 tarefas sem IDs; zero projetos/tarefas na captura. Datas zero: previsão 1.456, resolução 1.573, update 1.283 (sobrepostas). Etapas derived da V4 não comprovam pais de negócio; criação de pais antigos está fora do recorte. | P03, P04, P05, P06 |
| `tb_integracao.tarefas_concluir` | 59 | **Representação pendente:** 59 conclusões sem pai atual e sem regra integral; não executar conclusão operacional. | P03, P04, P06 |
| `tb_integracao.tarefas_docs` | 12 | **Representação pendente:** Documentos/imagens sem pai atual nem correlação validada de arquivos/storage; texto do caminho não comprova migração do anexo. | P03, P04, P07 |
| `tb_integracao.tarefas_express` | 5 | **Candidato parcial não liberado:** 5 modelos sem ID/colisão nome-departamento detectada no destino. Departamentos e nomes dos usuários correspondem; 3 modelos têm responsável em outro departamento (bloqueio do serviço), 2 passam essas checagens. Não herdam pai-projeto ausente. Fechar identidade, constantes/type legacy-express, conteúdo completo, estado não preservado e projeção antes de promover os 2. Obs vazia vira null opcional no runtime; isso não é, isoladamente, impedimento. | P03, P06 |
| `tb_integracao.tarefas_imagens` | 124 | **Representação pendente:** Documentos/imagens sem pai atual nem correlação validada de arquivos/storage; texto do caminho não comprova migração do anexo. | P03, P04, P07 |
| `tb_integracao.tarefas_justificativa` | 227 | **Representação pendente:** 227 justificativas sem pai atual e sem regra completa de conteúdo/autoria/data; não converter em histórico técnico autorizado de outra tabela. | P03, P04, P06 |

### tb_mkt — 1 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_mkt.senhas` | 1 | **Representação pendente:** Uma credencial; tabela residual mtk.passwords e chave marketing em permissions não comprovam serviço atual. Sem emissão/criptografia validada autorizada para este registro. | P03, P05, P07 |

### tb_pec — 1.489 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_pec.notas` | 1.489 | **Exclusão operacional:** PEC inteiro excluído, inclusive os antigos candidatos condicionais; nenhuma promoção por tabela residual notes. | P01 |

### tb_pessoal — 13 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_pessoal.clientes_situacoes` | 1 | **Bloqueio comprovado:** Uma linha sem ID e com data_finalizacao zero; não converter presente inválido em null sob G02. | P03, P05, P06 |
| `tb_pessoal.contri_assis` | 1 | **Validação pendente:** Mapper existe para pessoal.passwords (1 e 11 linhas); destino atual exige compatibilidade criptográfica dos campos, identidade do cliente e comparação do conteúdo/chave de serviço. 330 IDs não comprovam ausência de credencial equivalente. Sem ler/emitir segredos na saída. | P03, P05, P07 |
| `tb_pessoal.empregador_web` | 11 | **Validação pendente:** Mapper existe para pessoal.passwords (1 e 11 linhas); destino atual exige compatibilidade criptográfica dos campos, identidade do cliente e comparação do conteúdo/chave de serviço. 330 IDs não comprovam ausência de credencial equivalente. Sem ler/emitir segredos na saída. | P03, P05, P07 |

### tb_regularize — 888 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_regularize.agenda` | 468 | **Representação pendente:** 468 eventos sem regra integral de agenda/recorrência/participantes/autoria; API legada de agenda não comprova serviço atual. | P04, P06, P09 |
| `tb_regularize.agenda_controle` | 1 | **Representação pendente:** Um controle de agenda sem pai/relação atual validada; não confundir com evento autônomo. | P04, P06, P09 |
| `tb_regularize.alvaras` | 2 | **Bloqueio comprovado:** 2 alvarás têm data_ultima_consulta zero, além de campos vazios. Mapeamento V4/serviço existem, mas G02 impede apagar data inválida; faltam referências/conteúdo do destino. | P03, P05, P06 |
| `tb_regularize.atividades` | 45 | **Representação pendente:** 45 atividades não são a tabela de atividades de orientação mapeada. Sem etapa própria de conteúdo/pai/ciclo; não reaproveitar outro mapper por semelhança de nome. | P03, P06 |
| `tb_regularize.clientes` | 24 | **Validação e bloqueios:** 24 sem ID próprio: 6 apontam para cliente Integração já localizado (preservar, não duplicar/atualizar), 10 para novos clientes pendentes, 8 sem vínculo válido. Nenhum payload integral validado no diagnóstico existente. | P03, P04, P05, P06 |
| `tb_regularize.clientes_licitacoes` | 1 | **Representação pendente:** Uma faceta de licitação sem representação integral independente; não converter em atualização de cliente. | P03, P06 |
| `tb_regularize.clientes_senhas` | 25 | **Validação pendente:** 25 linhas com emissão 1:N por slot e sites derivados. IDs próprios não bastam; validar slots/identidade composta, cliente, serviço/site, criptografia atual e conteúdo. Não sintetizar credencial vazia nem criar sites duplicados. | P03, P05, P07 |
| `tb_regularize.controle_inativar` | 10 | **Fora do escopo:** 10 controles de inativação sem INSERT autônomo aprovado; não aplicar inativação/recriar exclusões no destino. | P02 |
| `tb_regularize.coringa` | 24 | **Representação pendente:** 24 linhas auxiliares de cliente sem mapper completo de campos e efeito; não preencher facetas concorrentes por merge. | P03, P06 |
| `tb_regularize.grupos` | 5 | **Validação pendente:** Mapper V4 existe e origem é simples; 1 grupo Integração e 5 Regularize sem colisão de nome na própria origem; os 5 Regularize têm A (ativo). Captura possui apenas 302 IDs. Busca nos serviços atuais não encontrou consumidor Group/ClientsGroup; não usar serviços legados como prova. Conferir disponibilidade funcional e identidade por conteúdo antes de promover. | P03, P06 |
| `tb_regularize.grupos_integrantes` | 14 | **Validação pendente:** 14 vínculos com mapper; resolver group e cliente real por conteúdo e comparar par group_id/client_id dos 333 destinos. Só IDs e ausência de consumidor atual comprovado não liberam vínculo. | P03, P04, P06 |
| `tb_regularize.orientaoes_checklist` | 16 | **Representação pendente:** 16 checklists sem etapa própria integral; não descartar conteúdo nem converter em objeto de atividades/sócios. | P03, P06 |
| `tb_regularize.orientaoes_processual` | 16 | **Validação pendente:** 16 orientações têm mapper com lookup/derived de processo. Validar processo real, todos os campos/arquivo e contribuições de atividades/sócios; não criar pai técnico nem usar defaults sem prova. Conteúdo de 146 orientações não capturado. | P03, P04, P05, P07 |
| `tb_regularize.orientaoes_processual.atividades` | 118 | **Validação pendente:** 118 atividades e 25 sócios são aggregate em proceduralGuidances; requerem composição integral de pai novo. Acrescentar a JSON de pai existente seria UPDATE vedado; pai novo ainda não validado. | P02, P04, P06 |
| `tb_regularize.orientaoes_processual.socios` | 25 | **Validação pendente:** 118 atividades e 25 sócios são aggregate em proceduralGuidances; requerem composição integral de pai novo. Acrescentar a JSON de pai existente seria UPDATE vedado; pai novo ainda não validado. | P02, P04, P06 |
| `tb_regularize.permissoes_senhas` | 5 | **Fora do escopo:** 5 concessões de acesso a credenciais; não são senhas independentes e não autorizam conceder permissões. | P02 |
| `tb_regularize.pf` | 21 | **Validação pendente:** 21 PF sem IDs históricos encontrados; mapper existe. A captura de 810 IDs não permite validar documento, conteúdo integral, identidade alternativa ou exclusões. Não criar PF somente porque falta UUID. | P03, P06 |
| `tb_regularize.pf_empresas` | 24 | **Validação e bloqueios:** 24 relações; 23 têm saída zero. O caso restante exige validar PF/PJ reais, participação/datas, chave de negócio e conteúdo de 935 relações; não aprovar pela ausência de ID. | P03, P04, P05, P06 |
| `tb_regularize.processos` | 43 | **Validação e bloqueios:** 43 processos: 32 com finalização zero, todos com campos de envio/retorno fiscal/notificação zero (necessário revisar destino ou descarte por campo). Demais casos exigem pai/usuários, status, datas e comparação de 443 destinos. Nenhum mapper integral V4.1 validado. | P03, P04, P05, P06 |
| `tb_regularize.sites_prefeituras` | 1 | **Representação pendente:** Um site municipal sem mapper próprio; não confundir com os sites derivados de credenciais em regularize.passowordsSites. | P03, P06 |

### tb_rh — 534 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_rh.alergias` | 2 | **Validação pendente:** Contribuições de perfil (2 alergias/1 contato) em JSON de users; composição do usuário novo não aprovada, e alterar JSON de usuário existente é vedado. A captura não contém esses campos; comparação vazia/no-op não seria prova. | P02, P04, P06 |
| `tb_rh.colaboradores` | 10 | **Bloqueio comprovado:** 10 perfis têm nascimento, demissão e admissão Domínio zero; etapas são merge em users. Não ignorar campos nem transformar inválidos em ausência. | P02, P03, P05 |
| `tb_rh.contatos_emergencia` | 1 | **Validação pendente:** Contribuições de perfil (2 alergias/1 contato) em JSON de users; composição do usuário novo não aprovada, e alterar JSON de usuário existente é vedado. A captura não contém esses campos; comparação vazia/no-op não seria prova. | P02, P04, P06 |
| `tb_rh.pontos` | 1 | **Validação pendente:** 1 configuração; colaborador aponta a ID de usuário existente. Faltam conteúdo do usuário e das 15 configurações, unicidade user_id, horários/âncora, saldo/assinatura e justificativa para work_days default; ID não valida isso. | P03, P04, P05, P09 |
| `tb_rh.pontos_registros` | 90 | **Validação pendente:** 90 pontos com usuário por ID localizado; não aplicar bloqueio de usuário ausente. Validar dados/horários/fuso, assinatura derivada e saldo sem atualizar configuração; comparar 2.241 pontos por conteúdo/usuário/instante. Executor RH aprovado não cobre este domínio. | P03, P04, P05, P09 |
| `tb_rh.pontos_solicitacoes` | 8 | **Validação pendente:** 8 ajustes com usuário por ID localizado; faltam pai ponto com conteúdo, aprovador, horários, status e anexos. Captura contém 138 IDs, sem conteúdo. Não executar aprovação operacional que altera pontos/saldo. | P03, P04, P05, P09 |
| `tb_rh.score` | 51 | **Bloqueio comprovado:** 51 scores novos sem ID; 47 usuários por ID localizados, 4 não. Faltam agregado/Nitro e identidade por conteúdo. Nitro existente de outros scores não supre os pais novos; não criar métricas fictícias. | P03, P04, P06 |
| `tb_rh.score_avaliacoes` | 357 | **Bloqueio comprovado:** 357 avaliações: 153 SELF, 102 LEADER e 102 RH/TI na análise existente; 102 LEADER sem atribuição individual comprovada. Validar perguntas/respostas/tipo/score/autor, sem usar permissão atual para inventar autoria histórica. | P03, P04, P06 |
| `tb_rh.solicitacoes` | 4 | **Bloqueio comprovado:** 4 novos pedidos correspondem à quarentena existente: 3 coincidências de identidade, 1 grupo com anexo não validado. Os 17 aprovados já foram descontados do recorte; não reaplicar plano antigo. | P03, P04, P05, P07 |
| `tb_rh.solicitacoes_mensagens` | 10 | **Bloqueio comprovado:** 10 mensagens restantes cobertas pelo diagnóstico anterior: todas com grupo não aprovado, 7 problemas semânticos, 4 leitura sem campo leitor e 1 anexo não validado (sobrepostos). Nenhuma pertence às 4 mensagens complementares já carregadas; déficits antigos não entram. | P03, P04, P07 |

### tb_tecnologia — 67 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_tecnologia.estoque_entradas` | 20 | **Validação pendente:** 20 entradas/24 saídas têm mapeadores V4, porém faltam conteúdo do estoque, referências, datas, identidade de negócio e composição do saldo. Serviço atual altera quantidade ao registrar movimentos; não chamar fluxo operacional nem alterar saldo sob INSERT-only sem regra comprovada. | P03, P04, P05, P09 |
| `tb_tecnologia.estoque_saidas` | 24 | **Validação pendente:** 20 entradas/24 saídas têm mapeadores V4, porém faltam conteúdo do estoque, referências, datas, identidade de negócio e composição do saldo. Serviço atual altera quantidade ao registrar movimentos; não chamar fluxo operacional nem alterar saldo sob INSERT-only sem regra comprovada. | P03, P04, P05, P09 |
| `tb_tecnologia.inventario` | 3 | **Bloqueio comprovado:** 3 atribuições sem IDs; todas com data_devolucao zero. Destino inventory vazio não valida retorno/estado, categoria, usuário, termo ou responsável. | P03, P04, P05, P07 |
| `tb_tecnologia.inventario_itens` | 1 | **Validação pendente:** 1 item em inventory vazio; mapper existe. Resolver localização/categoria por identidade natural e conteúdo, usuário responsável, datas e asset code; IDs das tabelas auxiliares são insuficientes. | P03, P06 |
| `tb_tecnologia.reset` | 5 | **Fora do escopo:** 5 solicitações/controles de reset sem preservação operacional aprovada; não redefinir autenticação nem transportar segredos em histórico. | P02 |
| `tb_tecnologia.robos_controles` | 11 | **Representação pendente:** 11 controles. Existe serviço atual de robots/robot_runs, porém não há mapper V4.1 desta origem, identidade validada dos pais nem tradução comprovada de status/data para run; a captura nem inventaria esses destinos. Não declarar serviço inexistente. | P03, P06 |
| `tb_tecnologia.termos` | 3 | **Candidato não liberado:** 3 termos com assinatura legada vazia e sem data zero detectada; mapper permite signed_at=null (não inferir assinatura). Campos endereço vazios são opcionais. Faltam conteúdo dos 200 termos, prova usuário/documento/departamento e convenção de data; não bloquear todos por assinatura ausente. | P03, P05, P06 |

### tb_triagem — 40 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_triagem.campos` | 20 | **Exclusão operacional:** Triagem inteira excluída. Documentos e nuvens participam desse fluxo legado; não criar representação alternativa em Contábil/Fiscal. | P01 |
| `tb_triagem.prioridade` | 20 | **Exclusão operacional:** Triagem inteira excluída. Documentos e nuvens participam desse fluxo legado; não criar representação alternativa em Contábil/Fiscal. | P01 |

### tb_workspace — 1 registros

| Origem | Retidos | Situação e motivo documentado | Pendências |
| --- | ---: | --- | --- |
| `tb_workspace.solicitacoes` | 1 | **Validação pendente:** 1 pedido TI novo; serviço atual existe. Mapper Remaining depende de contexto/corpus auditado antigo e não é payload V4.1 validado do incremento. Reconciliar requester/assignee/categoria/departamento/status/datas/conteúdo dos 5 pedidos atuais; não disparar criação operacional. | P03, P04, P05, P07 |

## 7. Quarentenas e pendências anteriores ao fechamento

Os conjuntos desta seção **não devem ser somados entre si nem aos 23.680** sem confronto
de chaves. Relatórios preliminares e versões first/second são evidências de evolução ou
reprodutibilidade, não novos lotes de dados.

### 7.1. Logs — sobreposição conferida por chave

| Conjunto | Registros |
| --- | ---: |
| Quarentena de logs após a carga de 3.542 | 6.720 |
| Já incluídos no recorte recente de 23.680 | 2.278 |
| Logs antigos fora do recorte recente | **4.442** |
| União apenas de quarentena recente e quarentena de logs | **28.122** |

**28.122 é a união de somente esses dois inventários**, não o total global de todas as
migrações. Os 4.442 pertencem ao backup antigo e estavam ausentes nas identidades sondadas;
isso não prova que nunca tenham sido excluídos legitimamente no destino.

Motivos dos 6.720 logs, com sobreposição: 4.442 chaves antigas ausentes; 1.776 referências
de cliente/PA sem validação; 804 autores não corroborados; 36 eventos coincidentes na origem.
Dentro dos 2.278 recentes: 1.637 referências pendentes, 776 autores e 36 coincidências,
também com sobreposição. Falta resolver referência/autor/identidade e comprovar que a
recriação não duplica evento nem reverte exclusão legítima.

Evidências: [carga de logs](./CARGA-LOGS-2026-09-13.md) e
[quarentena privada de logs](./reports/large-logs-2026-09-13-readonly-check/quarantine.json).

### 7.2. RH — grupos bloqueados, órfãos e divergências preservadas

| Conjunto documentado | Quantidade | Motivo e pendência |
| --- | ---: | --- |
| Grupos de pedidos bloqueados na validação ampliada | 10 pedidos + 16 mensagens + 41 históricos | Seis autoatribuições vedadas, três outros grupos com identidade coincidente e um com anexo não localizado; validar o grupo inteiro, sem inventar atribuição ou dispensar arquivo |
| Parte nova dos pedidos/mensagens acima, já na seção 6 | 4 pedidos + 10 mensagens | Não somar de novo; seis pedidos autoatribuídos eram antigos. Históricos devem ser reconciliados por chave, não por contagem de grupos |
| Mensagens órfãs antigas fora dos 27 grupos iniciais | 15 mensagens em cinco chaves de pai | Pais ausentes na origem de 12/09 e nas identidades de destino sondadas; falta prova dos pais, não autorização para criá-los |
| Históricos tipo 19 órfãos na análise ampliada | 34 históricos em 11 chaves de pai | 13 vinculados às mesmas cinco chaves das mensagens órfãs; resolver origem/identidade, sem somar esse número como grupo independente já reconciliado |
| Mensagens já existentes com divergências | 1.885 | Não são mensagens ausentes: preservar o banco. Diferenças de data, tipo, texto e leitura não autorizam correção nem reinserção |
| Cobertura histórica dos demais pais na captura anterior ao complemento | 2.588 históricos de 909 pedidos | Diagnóstico anterior, não saldo atual: seis históricos desse universo já foram preservados no complemento. O restante exige apuração por chave e grupo |

As divergências nas 1.885 mensagens incluíam 1.885 datas, 1.552 tipos, 472 textos e uma
marca de leitura, com sobreposição; 21 anexos de mensagens existentes ainda não tinham
preservação comprovada. São pendências de rastreabilidade/representação, não carga automática.

O histórico técnico R03 dos grupos carregados não libera genericamente os **1.079 históricos
RH novos** retidos na seção 6. Também não se deve manter como pendência a preparação das
quatro mensagens complementares: **elas já foram carregadas**.

As cargas RH concluídas totalizam **17 pedidos, 29 mensagens e 20 auditorias técnicas**,
preservando 43 linhas brutas de histórico; quatro dessas linhas são antigas e não entram
no acumulado de chaves novas. Auditorias técnicas e históricos de origem são unidades diferentes.

Fontes: [validação RH](./VALIDACAO-RH-2026-09-12.md),
[diagnóstico complementar](./RH-COMPLEMENTAR-2026-09-13.md),
[carga RH inicial](./CARGA-RH-PRODUCAO-2026-09-13.md) e
[carga complementar concluída](./CARGA-RH-COMPLEMENTAR-2026-09-13.md).
Nos diagnósticos anteriores, avisos de “sem autorização”, “nenhuma carga” ou “login pendente”
descrevem aquela etapa histórica; os comprovantes de carga posteriores e a retirada da
conferência visual do escopo prevalecem.

### 7.3. Usuários, clientes e complementos Regularize

O relatório definitivo contém **675 diagnósticos individuais**, não 675 novos cadastros.
O confronto local encontrou **115 chaves também no recorte recente**: dez usuários,
81 clientes de Integração e 24 linhas Regularize. Os outros **560 diagnósticos** estão fora
desse recorte, mas isso não os transforma em 560 entidades ausentes.

| Origem/recorte diagnosticado | Quantidade | Motivo e pendência |
| --- | ---: | --- |
| Usuários sem ID localizado | 11 | Dez novos e um antigo; perfil, acesso e credencial não integralmente validados; dois logins novos coincidentes. Não criar/alterar autenticação para destravar outra tabela |
| Clientes de Integração sem ID localizado | 81 | Composição comercial C00/C01, identidade e referências incompletas; 80 com alguma data inválida; coincidências de documento/conteúdo exigem revisão |
| Regularize sem correspondência por ID próprio | 583 | 582 chaves válidas e uma inválida; não representam automaticamente clientes novos |
| Parcela Regularize vinculada a clientes Integração já localizados | 563 | Faceta de cliente existente; não duplicar entidade nem atualizar conteúdo sob escopo somente INSERT |
| Parcela vinculada a clientes novos pendentes | 10 | Depende da validação completa do cliente novo |
| Parcela com vínculo explícito cujo pai não foi localizado | 1 | Provar o pai; não fabricá-lo |
| Parcela sem vínculo positivo válido | 8 | Resolver identidade e relação com cliente |
| Chave própria inválida | 1 | Resolver a identidade de origem com evidência |

As quatro últimas parcelas e os 563 vínculos fecham os 583 diagnósticos Regularize.
No recorte recente de 24 linhas Regularize, seis apontam a clientes existentes, dez a
clientes novos pendentes e oito não têm vínculo válido. Não confundir faceta legada,
entidade de cliente e linha de destino. A regra antiga de escolher o primeiro vínculo,
fazer merge ou criar outro cliente não está liberada.

Fonte: [VALIDACAO-CANDIDATOS-2026-09-12.md](./VALIDACAO-CANDIDATOS-2026-09-12.md).

### 7.4. Diagnósticos anteriores dos lotes maiores

| Origem | Ausências históricas diagnosticadas | Já contidas como chaves recentes | Pendência |
| --- | ---: | ---: | --- |
| Tarefas Integração | 27.037 | 1.619 | Projetos/pais reais, composição, modelos, responsáveis, datas e cobrança. A captura encontrou zero tarefas/projetos; 19 candidatos estruturais não eram grupos completos |
| Movimentos de estoque | 6.177 | 44: 20 entradas e 24 saídas | Colaborador versus usuário, pais, saldo, observação, data e efeitos do serviço; não alterar estoque existente |
| Avaliações de score RH | 1.515 | 357 | Score/Nitro, perguntas/respostas e avaliador histórico; não inferir líder pela permissão atual |
| Notas PEC | 1.497 | 1.489 | Exclusão operacional vigente do domínio inteiro |

Esses números descrevem os diagnósticos citados em
[CARGA-LOGS-2026-09-13.md](./CARGA-LOGS-2026-09-13.md), não um manifesto global atualizado.
Não subtrair mecanicamente para anunciar um saldo antigo comprovadamente migrável.
Não houve carga nativa desses domínios no último lote; os 6.038 históricos técnicos de
tarefas importados **não são 6.038 tarefas nativas**.

### 7.5. Quarentena operacional antiga de V2/V3

A [memória das migrações anteriores](../README.md) registra **49.620** itens no panorama
daquela época: 49.325 de Parcelamento, 219 de Tecnologia e 76 de Certificados.
**Esse é um total histórico documentado, não reconfirmado como saldo atual de 12/09.**
Não somá-lo aos totais recentes.

| Origem ou motivo histórico | Quantidade documentada | O que está pendente |
| --- | ---: | --- |
| tb_historico.parcelamento | 48.548 | Comprovar contrato funcional e representação histórica; o motivo antigo era backend incompleto, cuja situação atual precisa de revisão |
| tb_cbc.panorama_clientes_parcelamento | 332 | Identidade/composição do vínculo cliente-parcelamento e destino fiel |
| tb_cbc.panorama_parcelamentos | 224 | Preservação do panorama e estado sem reconstruir fatos por suposição |
| tb_parcelamento.competencia | 117 | Competência, identidade e pais do domínio |
| tb_parcelamento.parcelamentos | 51 | Processo, parcelas, estado, vínculos e contrato integral |
| tb_parcelamento.simulacoes_parcelamentos | 39 | Pai de simulação, identidade e relação com parcelamento |
| tb_parcelamento.simulacoes | 14 | Representação própria de simulação; não converter simulado em operação real |
| **Subtotal Parcelamento** | **49.325** | Manter fora até validar contrato e reconciliar chaves com cargas posteriores |
| tb_tecnologia.senhas sem password | 80 | Exclusão operacional anterior: setor de TI informou que não são necessárias; não inventar senha |
| tb_tecnologia.reset | 139 | Fluxo diferente no sistema novo; não transportar/resetar autenticação |
| **Subtotal Tecnologia** | **219** | Preservar as decisões; os cinco resets recentes não se somam sem reconciliar a origem |
| Certificados PJ com validade inválida | 5 | Comprovar validade real; não preencher data fictícia |
| Certificados PJ com identidade única coincidente | 5 | Desambiguar ou preservar existente, respeitando unicidade |
| Certificados PF com validade inválida | 45 | Comprovar validade real |
| Certificados PF com identidade única coincidente | 21 | Desambiguar ou preservar existente |
| **Subtotal Certificados** | **76** | Validar também arquivos, metadados e criptografia quando aplicáveis |
| **Panorama histórico documentado** | **49.620** | Não é o total global atual |

Os **194 ramais de tb_cbs.ramais no backup de 06/07/2026** eram outra pendência documentada,
**fora dos 49.620** do panorama. O legado permite números repetidos e guarda tipo; o contrato
documentado do destino exige usuário/número e unicidade por organização/número.
Falta decidir uma representação fiel compatível ou manter a exclusão. Alterar schema,
perder o tipo ou normalizar números arbitrariamente não faz parte desta migração.

O RH/DP igual a zero no panorama antigo descreve a carga daquela época. Não elimina os
grupos RH bloqueados e as mensagens órfãs encontrados posteriormente.

### 7.6. V4: pendências de mapeamento e dry-run não são saldo de produção

A [V4](../v4/README.md) documenta 312 origens: **103 confirmadas no catálogo e 209 pendentes**.
“Confirmada” era o estado da regra, não aprovação de cada registro do novo backup.
O [inventário V4 usado na V4.1](./INVENTARIO-V4.csv) mantém todas essas origens e motivos.

| Métrica histórica de dry-run V4 | Quantidade | Unidade/limite |
| --- | ---: | --- |
| Quarentena de origem | 12.324 | Linhas de origem no ensaio, não saldo pós-carga |
| Quarentena de destino | 12.623 | Estados/emissões de destino; não somar às linhas de origem |
| Grupos sanitizados de motivo | 146 | Agrupamentos, não registros |
| Referências obrigatórias não resolvidas | 452 | Ocorrências do ensaio incompleto, não novo lote |
| Origens pending no catálogo | 209 | Tabelas, não linhas |

O dry-run constava como incompleto e sem escritas. Linhas preparadas ou não emitidas nesse
ensaio não comprovam carga concluída nem ausência atual no destino. Os diretórios de
quarentena descritos na V4 eram sanitizados; não substituem o inventário individual
do fechamento V4.1.

O anexo A lista as 209 origens pendentes por motivo histórico, para que as que não
produziram chaves novas no recorte recente também permaneçam visíveis.

### 7.7. Não migrados/excluídos da V4 agora na quarentena de revisão

Por solicitação do responsável, os casos antes separados como “não migrados” foram
individualizados e incluídos na quarentena documental para nova análise geral.
Foram recuperadas as decisões do commit 1ac903e4, posteriormente retiradas do versionamento
por segurança no commit 94e1648c. Os dados não foram carregados nem alterados no banco.

| Grupo | Histórico V4 identificado | Recorte atualizado em 12/09 | Observação |
| --- | ---: | ---: | --- |
| Certificados PF inativos | 247 | 252 | Cinco certificados antigos passaram a inativos |
| Certificados PJ inativos | 326 | 342 | Dezesseis antigos passaram a inativos |
| Marketing, prefixo tb_mkt. | 341 | 342 | Uma chave nova, já na quarentena recente |
| Triagem, prefixo tb_triagem. | 1.185 | 1.225 | Quarenta chaves novas, já na quarentena recente |
| **Total** | **2.099** | **2.161** | **41 sobreposições; 2.120 adicionais à união com o recorte recente** |

Os 2.099 históricos estão todos presentes em 12/09: 2.095 iguais e quatro com alterações
de conteúdo, preservadas nas duas versões privadas. A classificação foi reconstruída
pelas chaves do backup e critérios históricos, cujas contagens e hashes foram conferidos.
Os relatórios antigos traziam agregados, não uma lista de chaves individuais.

Dos 21 certificados adicionais, **20 tinham ID localizado no destino na captura anterior**;
não são classificados como ausentes, não serão reinseridos nem inativados. Dois PJ também
mudaram de documento e exigem revisão de identidade. Quarentena aqui significa revisão
do dado legado e de sua representação, sem retirar registros do sistema.

O novo [índice de união](./reports/v4-excluded-2026-09-13/union-recent-and-v4-excluded.jsonl)
contém **23.680 + 2.161 − 41 = 25.800 chaves únicas**, preservando motivos e vínculos de
ambos os inventários. Ele não inclui os 4.442 logs antigos adicionais nem todos os outros
conjuntos históricos. Portanto, não substitui a reconciliação global ainda pendente.

O relatório operacional antigo também registra 14.945 ocorrências de quarentena funcional,
separadamente dos não migrados. Esse agregado foi preservado como evidência, não somado
automaticamente às contagens atuais. O panorama de 49.620 da seção 7.5 pertence a outra
etapa histórica e tampouco foi somado.

Detalhamento por tabela, motivos, pendências, arquivos individuais, versões brutas dos dois
backups e hashes: [QUARENTENA-EXCLUSOES-V4-2026-09-13.md](./QUARENTENA-EXCLUSOES-V4-2026-09-13.md).
O material está em reports/v4-excluded-2026-09-13/, privado e ignorado pelo Git.
As decisões operacionais e a proibição de sobrescrita continuam vigentes; a reclassificação
não autoriza migração, alteração de schema, login, permissões ou reativação de módulos.

## 8. O que falta, em ordem objetiva

1. **Manter as exclusões operacionais fechadas:** PEC e Triagem não precisam ser “corrigidos”
   para caber no lote. O mesmo vale para permissões, resets e operações que alterariam dados reais.
2. **Nos dados do foco recente, resolver prova e representação:** identidade/autoria,
   conteúdo livre, enums/datas, pais reais e composição de grupos. Os volumes por tabela
   estão na seção 6; não há execução aprovada pendente de simples acionamento.
3. **Priorizar candidatos pequenos já mais próximos de validação**, se houver nova etapa
   de revisão, sem chamá-los de liberados:

| Origem | Quantidade | Verificação concreta que falta |
| --- | ---: | --- |
| tb_cbc.emails | 4 | Comparar conteúdo e identidade alternativa dos 22 e-mails da captura; decidir preservação literal de um texto que a V4 normalizava |
| tb_contabil.clientes_mov | 6 | Provar cliente e comparar conteúdo/unicidade por cliente dos 361 responsáveis da captura |
| tb_integracao.tarefas_express | 5 | Três bloqueados por responsável fora do departamento; nos outros dois, fechar identidade, constantes e projeção integral. Não exigir projeto como se fossem tarefas executadas |
| tb_tecnologia.termos | 3 | Comparar 200 termos da captura, usuário/documento/departamento e data; assinatura vazia pode permanecer nula quando o contrato permitir, sem declarar documento assinado |

Esses quatro grupos somam 18 linhas em revisão. Três modelos express têm impedimento de
departamento identificado; os outros 15 itens **ainda não são um lote validado**.

4. **Para os grandes volumes, trabalhar por dependência:** históricos precisam de contrato
   específico e conteúdo seguro; tarefas dependem de projetos/grupos reais; scores de
   agregados e autoria; estoque de representação compatível que não altere saldo.
   Criar pais antigos fora do recorte ou mudar regras exige decisão separada.
5. **Para certificar a quarentena global completa**, reconstruir o inventário individual das
   cargas antigas, ancorar cada linha ao backup correto, descontar cargas posteriores e
   separar existente preservado, divergência, excluído operacional e ausência não validada.
   Essa consolidação não é pré-requisito para analisar um grupo recente independente,
   mas é necessária antes de anunciar um total único de todo o passivo.
6. **Somente após liberação de um novo lote delimitado:** backup atualizado, reconferência
   do banco real, executor testado, inserção transacional sem efeitos indevidos, releitura
   integral, prova de preservação e ausência de duplicações. Nada disso foi executado neste relatório.

Não há pendência de login, abertura da aplicação, deploy ou alinhamento geral do schema
para produzir este inventário. Também não se exige zerar toda a quarentena para migrar,
em outra etapa autorizada, um grupo independente integralmente validado.

## 9. Rastreabilidade, acesso e verificação deste relatório

### 9.1. Artefatos privados

O Markdown contém somente metadados e contagens. Chaves individuais, conteúdo original,
dados de pessoas, documentos, mensagens e eventuais segredos ficam fora deste relatório.
Os links de reports são **locais/privados e ignorados pelo Git**; publicar este Markdown
sozinho não publica nem transporta esses arquivos. Eles precisam continuar guardados
no acervo privado da migração.

| Evidência | Arquivo local | SHA-256 conferido |
| --- | --- | --- |
| Escopo congelado | [scope/summary.json](./reports/increment-32658-2026-09-13-scope/summary.json) | 9b4c17b14c3c83cd90cfb951ee919ccd6ef04f0f2083cfd7ed91d54e37848e4c |
| Resultado fechado | [closed/summary.json](./reports/increment-32658-2026-09-13-closed/summary.json) | 86dc2a95cba523a10a6f2875d39e1a33738739520308a13d33c1b3e85ff646b9 |
| Decisão individual de 32.658 chaves | [closed/ledger.json](./reports/increment-32658-2026-09-13-closed/ledger.json) | 896fda4ba7f675f1a6f6bafbe62fd145f8b34a61297b1930b129543ddbf91929 |
| Revisão das 110 origens complementares | [closed/rest-review.json](./reports/increment-32658-2026-09-13-closed/rest-review.json) | 56d5df692ebf61ffa7760175207686d7fd675f72c45d3ecff0ea58cd3283eb06 |
| Quarentena anterior de logs | [quarantine.json](./reports/large-logs-2026-09-13-readonly-check/quarantine.json) | ec0e8ce633ef8aec18d874141e4136a043eaee0db625165fb1ad9878a06faa7c |
| Diagnósticos finais de usuários/clientes | [quarantine.jsonl](./reports/candidates-2026-09-12-final-first/quarantine.jsonl) | 2ba16a665960a2765904ffd797776c5e81c4445b32074a60e8bd8b6d09f3bf81 |
| Validação ampliada RH anterior às cargas | [quarantine.jsonl](./reports/rh-2026-09-12-completion-reviewed-first/quarantine.jsonl) | e0c96b991440cc50922cf92ef5c5100919746c85f81ca9be42d5aadadfc9e3bd |

Para consultar um registro recente individualmente, usar no ledger a combinação
**sourceTable + sourceKey**; o status QUARENTENA e os campos reasons/additionalReasons
registram o impedimento. A linha bruta correspondente está no arquivo da mesma tabela
em reports/increment-32658-2026-09-13-scope/, identificada por key.
O sourceRowSha256 vincula a linha à decisão. O relatório agregado não substitui essa trilha.

Os diagnósticos antigos de RH e usuários/clientes não devem ser consumidos automaticamente
como decisões finais de carga: contêm candidatos posteriormente resolvidos e unidades
diferentes. Nos registros carregados prevalecem os comprovantes de aplicação e verificação.

### 9.2. Conferências locais realizadas em 13/09

- Recalculados os hashes do escopo, ledger, fechamento, revisão complementar e relatórios
  anteriores listados acima.
- Conferidos os **114 arquivos de origem congelada**, incluindo bytes e SHA-256 do manifesto.
- Recalculado o hash canônico de **32.658 linhas originais**, confrontado com cada entrada
  do ledger: cobertura integral e nenhuma chave repetida.
- Conferidos **23.680 registros únicos em quarentena**, todos com motivo e origem preservada;
  169 classificados como migrados nativos e 8.809 como preservados em auditoria técnica.
- Cruzadas as chaves dos 6.720 logs com a quarentena recente: 2.278 sobreposições e
  4.442 fora do recorte.
- Cruzadas as 675 linhas de diagnóstico de usuários/clientes: 115 sobreposições com o
  recorte recente; as 560 restantes mantêm a natureza de diagnóstico, não de carga aprovada.
- Conferido o catálogo de 312 tabelas, incluindo 209 pendentes.
- A validação do documento confere soma por tabela, cobertura, links locais e ausência
  de identificadores/dados individuais no Markdown. Os artefatos de entrada não são reescritos.

Limites: não foi feita nova consulta de produção, nova validação de disponibilidade dos
serviços, inspeção de objetos remotos de Storage nem reconciliação individual completa
de todas as cargas V2/V3/V4. Os dados brutos do **recorte recente** foram verificados;
a completude dos dados brutos de **toda a quarentena histórica** continua pendente.

## Anexo A. Todas as 209 origens pending no catálogo V4

Este anexo é um **inventário histórico de mapeamento por tabela**, não mais 209 registros
em quarentena e não uma avaliação funcional atual. Origens que já estão na seção 6 não
são contadas novamente; novas decisões V4.1, inclusive preservações históricas já carregadas,
prevalecem sobre o motivo antigo. Ausência de uma tabela neste anexo tampouco significa
que seus registros estejam liberados.

### NO_CURRENT_CONTRACT — 71 origens

Sem contrato de destino comprovado à época; falta identificar representação integral no sistema atual.

- `tb.atendimento_documentos`
- `tb_admin.ps`
- `tb_admin.responsaveis_contatos`
- `tb_admin.responsaveis_ps`
- `tb_admin.updates`
- `tb_atendimento.atendimentos_opa`
- `tb_atendimento.psc`
- `tb_atendimento.uber`
- `tb_cbc.atas`
- `tb_cbc.configs`
- `tb_cbc.keep_clientes`
- `tb_cbc.notificacoes_popup`
- `tb_cbc.preferencias`
- `tb_cbc.sininhos`
- `tb_comercial.cobrancas_descricao`
- `tb_contabil.alteracoes_contabil`
- `tb_contabil.clientes_bancos_erros`
- `tb_contabil.movimentacao`
- `tb_fiscal.aliquota_interestadual`
- `tb_fiscal.antecipacao`
- `tb_fiscal.antecipacao_envolvidos`
- `tb_fiscal.iss`
- `tb_fiscal.malhas`
- `tb_fiscal.mva`
- `tb_mkt.controle_ia`
- `tb_mkt.eventos`
- `tb_mkt.eventos_edicoes`
- `tb_mkt.eventos_feedbacks`
- `tb_mkt.eventos_feedbacks_periodos`
- `tb_mkt.solicitacoes`
- `tb_parcelamento.simulacoes`
- `tb_parcelamento.simulacoes_parcelamentos`
- `tb_pessoal.atividades`
- `tb_pessoal.grupos`
- `tb_rh.andares`
- `tb_rh.cce`
- `tb_rh.cce_avaliacoes`
- `tb_rh.colaboradores_atas`
- `tb_rh.feedbacks`
- `tb_rh.ferias_datas`
- `tb_rh.ferias_periodos`
- `tb_rh.intercorrencias`
- `tb_rh.intercorrencias_tipos`
- `tb_rh.provas`
- `tb_rh.provas_inscritos`
- `tb_rh.provas_questoes`
- `tb_rh.provas_respostas`
- `tb_rh.pv`
- `tb_rh.pv_objetivos`
- `tb_rh.pv_tarefas`
- `tb_rh.pv_tarefas_express`
- `tb_rh.score_nitro.avaliacoes`
- `tb_rh.score_nitro.avaliacoes_periodos`
- `tb_rh.score_nitro.ch`
- `tb_rh.score_nitro.erros`
- `tb_tecnologia.inventario_fotos`
- `tb_tecnologia.reset`
- `tb_triagem.prioridade`
- `tb_triagem.qtdnotas`
- `tb_triagem.solicitacoes`
- `tb_wiki.agenda`
- `tb_wiki.destaques`
- `tb_wiki.wikis`
- `tb_wiki.wikis_categorias`
- `tb_wiki.wikis_topicos`
- `tb_workspace.alteracao_regimes`
- `tb_workspace.alteracao_regimes_tarefas`
- `tb_workspace.alteracao_regimes_tarefas_express`
- `tb_workspace.mapas`
- `tb_workspace.mapas_clientes`
- `tb_workspace.natal`

### RETIRED_PERMISSION_MODULE — 3 origens

Permissão de módulo retirado; manter restrição operacional e não criar concessão.

- `tb_admin.permissoes_atendimento`
- `tb_admin.permissoes_pec`
- `tb_admin.permissoes_wiki`

### CURRENT_CONTRACT_NOT_FAITHFUL — 75 origens

Contrato existente não preservava fielmente a origem; falta revisão semântica completa.

- `tb_admin.responsaveis`
- `tb_atendimento.contatos`
- `tb_atendimento.satisfacao`
- `tb_atendimento.visitas_clientes`
- `tb_contabil.clientes_bancos`
- `tb_contabil.documentos`
- `tb_contabil.documentos_padrao`
- `tb_contabil.nuvens`
- `tb_fiscal.clientes_sn`
- `tb_fiscal.controle_impostos`
- `tb_fiscal.controle_impostos_anual`
- `tb_fiscal.controle_impostos_mei`
- `tb_fiscal.controle_impostos_normal`
- `tb_fiscal.controle_impostos_npossui`
- `tb_fiscal.controle_impostos_sn`
- `tb_fiscal.documentos`
- `tb_fiscal.portes`
- `tb_integracao.admin_urgencias`
- `tb_integracao.agenda`
- `tb_integracao.agenda_horas`
- `tb_integracao.agenda_locais`
- `tb_integracao.agenda_status`
- `tb_integracao.bloqueio`
- `tb_integracao.cobradores_solucoes`
- `tb_integracao.cobrancas_novas`
- `tb_integracao.cronograma`
- `tb_integracao.envios`
- `tb_integracao.fluxos`
- `tb_integracao.fluxos_clientes`
- `tb_integracao.metricas`
- `tb_integracao.objetivos`
- `tb_integracao.pa_historicos_pendentes`
- `tb_integracao.padrinhos`
- `tb_integracao.portes`
- `tb_integracao.prospeccao_metricas`
- `tb_integracao.prospeccao_metricas_periodo`
- `tb_integracao.prospeccao_paralisacoes`
- `tb_integracao.prospeccoes_reset`
- `tb_integracao.responsaveis_projeto`
- `tb_integracao.segmentos`
- `tb_integracao.tarefas_concluir`
- `tb_integracao.tarefas_contratadas`
- `tb_integracao.tarefas_distrato`
- `tb_integracao.tarefas_distrato_imagens`
- `tb_integracao.tarefas_docs`
- `tb_integracao.tarefas_imagens`
- `tb_integracao.tarefas_indicadores`
- `tb_integracao.tarefas_justificativa`
- `tb_integracao.tarefas_ordem`
- `tb_integracao.tarefas_parceiros`
- `tb_integracao.tarefas_total`
- `tb_regularize.agenda`
- `tb_regularize.agenda_controle`
- `tb_regularize.agenda_status`
- `tb_regularize.alvaras_vencimentos`
- `tb_regularize.atividades`
- `tb_regularize.clientes_competencia`
- `tb_regularize.clientes_dominio_logos`
- `tb_regularize.clientes_licitacoes`
- `tb_regularize.controle_inativar`
- `tb_regularize.coringa`
- `tb_regularize.coringa_status`
- `tb_regularize.distrato_checklist`
- `tb_regularize.dte`
- `tb_regularize.dte_status`
- `tb_regularize.orientaoes_checklist`
- `tb_regularize.orientaoes_filiais`
- `tb_regularize.permissoes_senhas`
- `tb_regularize.processos_dias`
- `tb_regularize.regimes`
- `tb_regularize.sites_estado`
- `tb_regularize.sites_prefeituras`
- `tb_tecnologia.atualizacoes`
- `tb_tecnologia.atualizacoes_previsao`
- `tb_tecnologia.robos`

### NO_LEGACY_RUNTIME_REFERENCE — 8 origens

Sem referência de execução legada comprovada; falta estabelecer significado e uso, sem inferir pela tabela.

- `tb_atendimento.motoboy`
- `tb_contabil.bancos`
- `tb_contabil.clientes_bancos_temp`
- `tb_contabil.documentos_bancos`
- `tb_fiscal.sn_completo_sn`
- `tb_historico`
- `tb_integracao.admin_tarefas`
- `tb_integracao.cobrancas_solucoes`

### NO_STABLE_MERGE_IDENTITY — 3 origens

Sem identidade estável de composição; merge não é permitido nesta carga e não pode ser substituído por duplicação.

- `tb_atendimento.uber_clientes`
- `tb_financeiro.contratos`
- `tb_fiscal.clientes_atacadistas`

### LEGACY_AUXILIARY_NO_CURRENT_CONTRACT — 7 origens

Tabela auxiliar sem destino comprovado; validar sua contribuição e dependências.

- `tb_cbc.keep_tags`
- `tb_cbc.orcamentos_categorias`
- `tb_cbs.estoque_andares`
- `tb_cbs.estoque_categorias_itens`
- `tb_cbs.estoque_itens`
- `tb_triagem.justificativas`
- `tb_workspace.alteracao_regimes_tipos`

### PARTIAL_CURRENT_CONTRACT_UNRESOLVED_ADAPTATION — 1 origens

Contrato apenas parcial; adaptação e cobertura dos campos ainda não comprovadas.

- `tb_cbc.orcamentos`

### CURRENT_IDENTITY_NOT_RECONSTRUCTABLE — 1 origens

Identidade de destino não reconstruível pela regra histórica; exige evidência adicional.

- `tb_cbc.panorama_clientes_parcelamento`

### FUNCTIONAL_FIELD_NO_CURRENT_DESTINATION — 1 origens

Campo funcional sem destino; não perder informação ou alterar schema automaticamente.

- `tb_cbs.ramais`

### DERIVED_CURRENT_STATE — 1 origens

Estado derivado no sistema atual; não reproduzir notificação ou efeito operacional para importar a origem.

- `tb_certificados.notificacoes.vencimento_certificados`

### LEGACY_HISTORY_NO_REPLAY_CONTRACT — 36 origens

Histórico sem contrato de replay; validar preservação técnica delimitada quando autorizada, nunca simular evento.

- `tb_historico.admin`
- `tb_historico.admin_departamentos`
- `tb_historico.admin_usuarios`
- `tb_historico.atendimento`
- `tb_historico.cbs_estoque`
- `tb_historico.certificado`
- `tb_historico.comercial`
- `tb_historico.contabil`
- `tb_historico.financeiro`
- `tb_historico.fiscal`
- `tb_historico.integracao`
- `tb_historico.integracao_agenda`
- `tb_historico.integracao_clientes`
- `tb_historico.integracao_clientes_dominio`
- `tb_historico.integracao_exclusoes`
- `tb_historico.integracao_grupos`
- `tb_historico.integracao_objetivos`
- `tb_historico.integracao_pas`
- `tb_historico.integracao_pas_historicos`
- `tb_historico.integracao_planos`
- `tb_historico.integracao_prospeccao_comercial`
- `tb_historico.integracao_tarefas`
- `tb_historico.integracao_tarefas_distrato`
- `tb_historico.integracao_tarefas_express`
- `tb_historico.integracao_tarefas_express_distrato`
- `tb_historico.keep`
- `tb_historico.marketing`
- `tb_historico.parcelamento`
- `tb_historico.permissoes`
- `tb_historico.pessoal`
- `tb_historico.regularize`
- `tb_historico.rh`
- `tb_historico.tecnologia`
- `tb_historico.triagem`
- `tb_historico.wiki`
- `tb_historico.workspace`

### NO_INDEPENDENT_DESTINATION — 1 origens

Sem entidade independente; provar contribuição em agregado novo sem atualizar existente.

- `tb_rh.cargos`

### UNRESOLVED_PARENT_CONTRACT — 1 origens

Contrato do pai não resolvido; provar vínculo e representação atuais.

- `tb_tecnologia.robos_controles`

**Fechamento:** o saldo recente está identificado e preservado; as quarentenas anteriores
estão referenciadas com seus motivos e limites. O trabalho ainda necessário para um total
global definitivo é a reconciliação individual histórica, não uma nova carga automática.
