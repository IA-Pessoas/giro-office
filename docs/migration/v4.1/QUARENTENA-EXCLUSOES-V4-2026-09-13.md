# Complemento de quarentena — exclusões históricas da V4

Data: **13/09/2026**. Tenant: Contabilidade Castelo.
Finalidade: reunir para **nova análise geral** os registros que a V4 classificou como
não migrados ou excluídos por política, sem modificar o banco ou liberar carga.

## Resultado

**Os 2.099 registros históricos foram identificados por tabela e chave no backup de 03/08
e reencontrados no de 12/09.** A seleção atualizada reúne **2.161 registros em quarentena
documental**, todos individualizados com motivo, proveniência e hash da linha original.

| Grupo | Histórico V4 | Recorte correspondente em 12/09 | Observação |
| --- | ---: | ---: | --- |
| Certificados PF inativos | 247 | 252 | Cinco chaves antigas passaram de ativo para inativo |
| Certificados PJ inativos | 326 | 342 | Dezesseis chaves antigas passaram de ativo para inativo |
| Marketing, somente prefixo tb_mkt. | 341 | 342 | Uma chave nova de senhas |
| Triagem, somente prefixo tb_triagem. | 1.185 | 1.225 | Vinte campos e vinte prioridades novos |
| **Total** | **2.099** | **2.161** | **21 mudanças de estado e 41 chaves novas** |

O escopo foi mantido fiel aos prefixos dos relatórios antigos. Não inclui automaticamente
outros históricos, permissões ou documentos relacionados a Marketing/Triagem que tenham
outro prefixo. As exclusões mais amplas do lote recente continuam registradas separadamente.

### Como fica a contagem sem duplicação

| Medida | Chaves de origem |
| --- | ---: |
| Quarentena do fechamento recente, preservada | 23.680 |
| Complemento atual de exclusões V4 | 2.161 |
| Sobreposição com a quarentena recente | 41 |
| Acréscimo à união desses dois inventários | **2.120** |
| **União recente + complemento V4** | **25.800** |

As 41 sobreposições são uma linha de tb_mkt.senhas, vinte de tb_triagem.campos e vinte
de tb_triagem.prioridade. Elas recebem o vínculo e o motivo complementar, não outra entrada
na união. Os 2.120 adicionais são os 2.099 históricos e os 21 certificados antigos que
passaram a inativos.

**25.800 não é o total global de todas as quarentenas históricas.** A união cobre somente
o fechamento recente e este complemento. Os 4.442 logs antigos fora do recorte e os demais
inventários de RH, V2/V3/V4 não foram incorporados a esse arquivo de união.
O acumulado migrado de 12.605 chaves novas e o saldo de 23.680 do recorte de 32.658
permanecem intactos; não houve nova carga.

## Origem da decisão histórica

Foram recuperados como evidência os conteúdos dos relatórios do commit
**1ac903e42bc074afe997b39ff5f6ffb91bfa9e3b**, de 12/08/2026:

- not-migrated-certificates.json: migrated=false, 573 registros, motivo
  CERTIFICATE_INACTIVE_NOT_MIGRATED, sendo 247 PF e 326 PJ.
- operational-quarantine-summary.json: os mesmos 573 certificados e exclusões por
  prefixo de 341 registros Marketing e 1.185 Triagem; quarentena funcional de 14.945
  registrada separadamente.

Os arquivos foram retirados do versionamento no commit
**94e1648c0807c7a86a7c24bf6205e36491aeca00**, de 13/08/2026, por segurança.
Não foram restaurados na antiga pasta versionada da V4. O conteúdo agregado necessário
foi guardado em historical-evidence.json, dentro do novo pacote privado.

O valor quarantineRowsRemoved=573 significava retirada da **contagem de quarentena**,
não exclusão de dados no banco. Pela decisão atual do responsável, esses casos passam a
constar explicitamente como QUARENTENA para reanálise, preservando o motivo e o status
históricos nos metadados. A mesma reclassificação documental foi aplicada aos prefixos
Marketing/Triagem. Isso não revoga exclusões operacionais nem autoriza migração.

O total funcional histórico de 14.945 está preservado como evidência agregada;
**não foi somado** aos 25.800, nem declarado equivalente às 49.620 pendências de uma
migração anterior. Reconciliar esses outros conjuntos por chave permanece trabalho separado.

## Como os registros foram identificados

1. O inventário recuperado do Git identifica o digest de 03/08 e os hashes dos arquivos.
   Foram conferidos os **15 arquivos SQL** dos dois prefixos e das duas tabelas de certificados.
2. Para certificados, foi reproduzida a seleção de status literal zero do backup antigo:
   os totais fecham exatamente em 247 PF e 326 PJ. O código V4 registra que o contrato
   não representava ativo/inativo. Essa identificação é reconstruída por critério e chave
   a partir do backup; os relatórios antigos continham totais, não listas individuais.
3. Para Marketing/Triagem, foram selecionadas todas as linhas dos prefixos exatos descritos
   no relatório histórico. Os totais fecham em 341 e 1.185.
4. As chaves foram cruzadas com 12/09; a integridade dos arquivos atuais foi conferida com
   os hashes da comparação V4.1. Nenhuma chave selecionada era inválida ou duplicada.
5. Foram preservadas 2.161 linhas atuais e 2.120 versões de 03/08 em arquivos privados,
   além dos localizadores dos SQLs e hashes canônicos por linha.
6. A classificação recente foi consultada por tenant + tabela + chave, sem modificá-la.
   A união preserva os motivos de ambas as classificações quando há sobreposição.

Dos **2.099 históricos**, **2.095 continuam literalmente iguais** e **quatro mudaram de
conteúdo**: uma credencial Marketing, dois campos de Triagem e uma prioridade Triagem.
As referências de identidade selecionadas continuaram iguais nesses quatro casos.
Nenhum valor sensível foi incluído neste Markdown.

Os 21 certificados adicionais **não são novos IDs do backup**: já existiam como ativos
em 03/08 e aparecem inativos em 12/09. Dois PJ também mudaram o documento, portanto
receberam motivo adicional de revisão de identidade; igualdade de chave não resolve isso.

## Detalhamento por origem

“Inativos adicionais” são chaves antigas com mudança de estado. “Novas chaves” são
inexistentes em 03/08. Tabelas vazias também estão listadas para comprovar cobertura do prefixo.

| Origem | Excluídos V4 | Quarentena do complemento em 12/09 | Inativos adicionais | Novas chaves | Já na quarentena recente |
| --- | ---: | ---: | ---: | ---: | ---: |
| `tb_certificados.pf` | 247 | 252 | 5 | 0 | 0 |
| `tb_certificados.pj` | 326 | 342 | 16 | 0 | 0 |
| `tb_mkt.controle_ia` | 79 | 79 | 0 | 0 | 0 |
| `tb_mkt.eventos` | 2 | 2 | 0 | 0 | 0 |
| `tb_mkt.eventos_edicoes` | 1 | 1 | 0 | 0 | 0 |
| `tb_mkt.eventos_feedbacks` | 0 | 0 | 0 | 0 | 0 |
| `tb_mkt.eventos_feedbacks_periodos` | 0 | 0 | 0 | 0 | 0 |
| `tb_mkt.redes_sociais` | 205 | 205 | 0 | 0 | 0 |
| `tb_mkt.senhas` | 54 | 55 | 0 | 1 | 1 |
| `tb_mkt.solicitacoes` | 0 | 0 | 0 | 0 | 0 |
| `tb_triagem.campos` | 553 | 573 | 0 | 20 | 20 |
| `tb_triagem.justificativas` | 15 | 15 | 0 | 0 | 0 |
| `tb_triagem.prioridade` | 617 | 637 | 0 | 20 | 20 |
| `tb_triagem.qtdnotas` | 0 | 0 | 0 | 0 | 0 |
| `tb_triagem.solicitacoes` | 0 | 0 | 0 | 0 | 0 |
| **Total** | **2.099** | **2.161** | **21** | **41** | **41** |

## Situação do destino e pendências

Não houve nova consulta ao banco real. A análise aproveitou somente as sondagens
registradas na captura anterior à carga, de 12/09. Uma sondagem de ID não comprova
equivalência de conteúdo, identidade de negócio, ausência atual ou aprovação de carga.

| Situação na captura anterior | Registros do complemento | Tratamento |
| --- | ---: | --- |
| ID localizado no tenant | 20 | Revisar estado/identidade da origem; preservar destino, não reinserir nem inativar |
| ID não localizado pelas estratégias sondadas | 1.202 | Ainda provar ausência atual, identidade alternativa e representação |
| Etapa exige resolução adicional | 205 | Resolver composição/vínculo e conteúdo; não tratar como cliente ou cadastro independente novo |
| Sem sondagem individual nessa comparação | 734 | Pendente comparação individual; cobertura anterior por tabela não é prova por registro |
| **Total** | **2.161** | **Nenhuma linha liberada para inserção** |

Os 20 IDs localizados pertencem aos 21 certificados que se tornaram inativos;
o outro PF estava sem ID localizado. Os dois PJ com mudança de documento também estão
no grupo de IDs localizados. Esses casos permanecem na quarentena de revisão,
**não são declarados ausentes nem removidos do sistema**.

| Grupo | Motivo atual de quarentena | O que falta para a análise geral |
| --- | --- | --- |
| Certificados inativos históricos | CERTIFICADO_INATIVO_REANALISE_GERAL | Definir representação fiel de inatividade no contrato existente; validar identidade, datas, arquivos/criptografia e ausência. Não ativar artificialmente nem mudar schema |
| Certificados antigos que mudaram de estado | ESTADO_LEGADO_MUDOU_NAO_ATUALIZAR_DESTINO | Comparar estado e identidade; tratar os 20 IDs localizados como preservados no destino. Dois documentos divergentes exigem prova adicional |
| Marketing | MARKETING_EXCLUSAO_HISTORICA_REANALISE_GERAL | Reavaliar decisão histórica e contrato atual, incluindo relações, conteúdo e proteção de credenciais; não copiar senhas para campos incompatíveis |
| Triagem | TRIAGEM_EXCLUIDA_REANALISE_GERAL | Manter bloqueio operacional vigente; a revisão documental não ativa o serviço nem libera carga |
| Sobreposição com a quarentena recente | Motivos anteriores preservados, com referência ao complemento | Examinar o mesmo registro uma vez na união; não substituir o motivo anterior nem gerar outra identidade |

Todos os registros têm status QUARENTENA, eligibleForInsert=false,
executionAuthorized=false e absenceInCurrentDatabaseProven=false.
A classificação de revisão não modifica schema, permissões, usuários, certificados,
notificações ou qualquer dado já existente.

## Arquivos para a revisão individual

Pacote privado: [v4-excluded-2026-09-13](./reports/v4-excluded-2026-09-13/).

- [quarantine.jsonl](./reports/v4-excluded-2026-09-13/quarantine.jsonl): 2.161 decisões individuais
  com chave, motivo, regra histórica, mudanças entre backups, pendências e vínculos anteriores.
- [union-recent-and-v4-excluded.jsonl](./reports/v4-excluded-2026-09-13/union-recent-and-v4-excluded.jsonl):
  índice sem duplicações de 25.800 chaves, com motivos e origem de cada classificação.
- [source-rows-12-09.jsonl](./reports/v4-excluded-2026-09-13/source-rows-12-09.jsonl):
  2.161 linhas integrais do recorte atual.
- [source-rows-03-08.jsonl](./reports/v4-excluded-2026-09-13/source-rows-03-08.jsonl):
  2.120 versões anteriores, incluindo os 21 certificados então ativos.
- [source-manifest.json](./reports/v4-excluded-2026-09-13/source-manifest.json):
  arquivos de origem, contagens e hashes dos dois backups.
- [historical-evidence.json](./reports/v4-excluded-2026-09-13/historical-evidence.json):
  relatórios históricos agregados, commits, hashes e inventário selecionado.
- [summary.json](./reports/v4-excluded-2026-09-13/summary.json):
  totais, sobreposições, limites e hashes dos artefatos.
- [build-operation.mjs](./reports/v4-excluded-2026-09-13/build-operation.mjs):
  cópia da operação documental, sem SQL/rede e com proteção contra sobrescrita.

Para localizar os dados, cruzar sourceTable + sourceKey no arquivo de quarentena
com sourceTable + key nos arquivos de linhas. O índice de união aponta a classificação
de origem; as linhas brutas dos registros que só pertencem ao fechamento recente
permanecem no pacote original increment-32658-2026-09-13-scope.

**Os arquivos brutos contêm dados pessoais e credenciais do legado.** Estão em diretório
0700, arquivos 0600 e ignorados pelo Git. Não anexar a chamados, publicar, versionar ou
enviar pelo chat. O relatório Markdown contém apenas metadados e contagens.
O pacote deve continuar guardado no acervo privado; publicar o Markdown não leva os dados junto.

## Verificação e integridade

- Reconciliação dos totais históricos por tabela/prefixo e continuidade das 2.099 chaves.
- Conferência dos hashes dos 15 SQLs de cada backup, das linhas preservadas e dos insumos.
- Releitura independente das 2.161 decisões e das 25.800 chaves da união, conferindo
  cobertura, motivos, hashes, referências, sobreposições e ausência de duplicações.
- Separação explícita dos 20 IDs localizados e dos dois documentos alterados.
- Conferência de permissões locais, exclusão do Git e preservação dos artefatos anteriores.
- Nenhuma consulta/escrita no banco ou mudança na aplicação. Nenhum arquivo anterior apagado.

| Artefato | SHA-256 |
| --- | --- |
| Resumo deste complemento | f14fd568649630e13d17f9d7fd415236c56cffc485815218706c627ec50f31cf |
| Decisões individuais | 50ef9b50108b81561d80b0a5e26be0b3ffc44a6e0b6c239aa42e7773d5d9a1e8 |
| União sem duplicações | c408550ab702ab67360b00f4859933c299be2b76d86b0d3750f2cc1ee3ebce0f |
| Linhas de 12/09 | 0d9109035cdbac905d5817f1ce83604d6d70dbae29cf4d5abe2c88256df6d156 |
| Linhas de 03/08 | 65ca655e2173d2f4271f650a8b5f95aa19eeb905b42f9451fa4cc7e92648c9fa |

O [relatório geral de quarentena](./RELATORIO-QUARENTENA-2026-09-13.md) incorpora este
complemento. A reconciliação global das outras migrações continua explicitamente pendente.
