# Mapeamento dos 701.711 registros sem resultado consolidado

O recorte foi inteiramente classificado: **137.818 registros com mapeamento na fila**, **563.259 sem mapeamento completo ou com impedimentos** e **634 identidades já encontradas no destino**, preservadas fora da fila. Nenhum registro deste recorte ficou sem resultado individual.

Esta etapa produziu mapeamentos e listas. **Não houve nova carga no banco.** Mapeamento não comprova ausência no destino nem substitui as verificações para INSERT. A lista separada não representa descarte definitivo; os dados originais continuam no backup.

| Frente | Na fila de mapeados | Sem mapeamento completo ou bloqueados | Existentes identificados | Total de origem |
| --- | ---: | ---: | ---: | ---: |
| Históricos H01: tarefas, Regularize e Contábil | 122.120 | 135.794 | 0 | 257.914 |
| Outros históricos | 2.666 | 229.532 | 0 | 232.198 |
| Origens com etapas operacionais V4 | 13.032 | 100.852 | 634 | 114.518 |
| Demais origens e tabelas auxiliares | 0 | 97.081 | 0 | 97.081 |
| **Total** | **137.818** | **563.259** | **634** | **701.711** |

## Listas para continuidade

- [Fila de migração: 137.818 registros mapeados](./reports/goal-migracao/unconsolidated-mapping-20260914/fila-migracao.jsonl).
- [Lista separada: 563.259 registros sem mapeamento completo ou bloqueados](./reports/goal-migracao/unconsolidated-mapping-20260914/sem-mapeamento-ou-bloqueados.jsonl).
- [634 identidades já encontradas, sem nova emissão](./reports/goal-migracao/unconsolidated-mapping-20260914/existentes-identificados.jsonl).
- [Contagens por origem: 265 tabelas](./reports/goal-migracao/unconsolidated-mapping-20260914/por-origem.csv).
- [448 grupos de impedimentos por origem e combinação de motivos](./reports/goal-migracao/unconsolidated-mapping-20260914/grupos-de-impedimento.csv).
- [Índice das análises de campos e contratos](./reports/goal-migracao/unconsolidated-mapping-20260914/contratos-index.json).

As listas são privadas. Cada linha registra tabela, ordinal, linha no SQL, hashes da chave e do conteúdo, classificação e apontador para a análise individual completa. O apontador inclui arquivo, linha, posição em bytes e hash. A análise do contrato é compartilhada por origem; os detalhes individuais e payloads permanecem nos arquivos de cada frente.

## Conteúdo da fila

| Destino proposto | Registros de origem | Mapeamento entregue |
| --- | ---: | --- |
| `audit_requests`, H01 | 122.120 | Payload técnico completo: 110.855 históricos de tarefas e 11.265 de Regularize; campos brutos literais, pai na fonte, autor corroborado e data verificada |
| `audit_requests`, R03 | 2.666 | Contrato de preservação do histórico de 936 pedidos RH; compor com pedido e mensagens, sem INSERT independente por linha histórica |
| `fiscal.ipi` | 11.088 | Projeção nativa de todos os campos de origem |
| `parcelamento.panorama` | 1.184 | Projeção nativa de todos os campos de origem |
| `fiscal.icms` | 358 | Projeção nativa de todos os campos de origem |
| `contabil.control` | 343 | Projeção nativa de todos os campos de origem |
| `rh.score_questions` | 26 | Projeção nativa de todos os campos de origem |
| `tecnologia.inventoryCategories` | 20 | Projeção nativa de todos os campos de origem |
| `rh.request_categories` | 7 | Projeção nativa de todos os campos de origem |
| `integracao.projectPlan` | 6 | Projeção nativa de todos os campos de origem |

Os números medem linhas de origem, não quantidade futura de INSERTs. H01 preserva histórico técnico e referências aos pais na fonte; não restaura atividade operacional nativa. R03 exige composição de grupos completos. As 13.032 projeções operacionais tiveram 80.322 campos e 2.711 referências conferidos com os artefatos disponíveis.

A próxima execução deve reconciliar identidade e conteúdo atuais, eliminar colisões em todas as representações, renovar referências/tenant e verificar schema, acesso e efeitos. Para H01, o impedimento de acesso registrado permanece uma dependência. Para R03, também falta reconciliar o snapshot completo por pedido. Todos os registros da fila mantêm `insert_ready=false` até essas verificações; não é necessária nova investigação de cada contrato já demonstrado para iniciar a reconciliação do respectivo lote.

## Por que os demais ficaram separados

Os motivos individuais distinguem contrato histórico inexistente, campo sem destino comprovado, tipo/valor não interpretado, pai ou autor não resolvido, datas inválidas, composição de agregados, credenciais/binários não verificados e operações fora das restrições vigentes.

Casos concretos mantidos fora da fila:

- Flags DP com código `3` e grupos Regularize com `A/I`: os conversores V4 genéricos produziriam valores não demonstrados pela origem.
- 34 históricos RH apontam para 11 pedidos ausentes no backup.
- O movimento Contábil 257 mantém o bloqueio de vínculo explícito já identificado na revisão B1.
- 386 contribuições de redes sociais/vencimentos têm campos com destino conhecido, mas dependem da composição do perfil, identidade, datas ou preservação de valores existentes. Não se propõe UPDATE de pais existentes.
- Dois registros de `tb_fiscal.clientes_atacadistas` não têm chave primária comprovada; preservam ordinal e hash de conteúdo, sem chave inventada.
- Históricos de outros tipos não foram promovidos automaticamente para H01; requerem representação fiel específica. Permissões, notificações e operações atuais não são reexecutadas.

Os 634 existentes correspondem a 22 e-mails, 361 movimentos contábeis, 51 modelos de tarefa e 200 termos TI. A evidência é a identidade encontrada no snapshot de 14/09; não se afirma equivalência integral de conteúdo nem se atribuem essas linhas a novas cargas desta etapa.

## Verificação e relação com os percentuais

O [resumo consolidado](./reports/goal-migracao/unconsolidated-mapping-20260914/summary.json) e a [verificação independente](./reports/goal-migracao/unconsolidated-mapping-20260914/verification.json) registram cobertura exata, listas disjuntas, hashes e apontadores individuais. A origem deste recorte é exatamente a categoria de 701.711 linhas do relatório percentual anterior; não houve interseção com as demais categorias.

O [quadro percentual atualizado](./PROGRESSO-MIGRACAO.md) incorpora esta classificação. As cargas recentes continuam em **4.603 INSERTs**; classificar uma linha não aumenta o total migrado. Os comprovantes anteriores e a lista canônica anterior de pendências foram preservados; as novas pendências estão na lista separada acima.
