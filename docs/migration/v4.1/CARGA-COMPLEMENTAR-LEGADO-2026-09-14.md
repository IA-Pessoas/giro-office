# Carga complementar com apoio do código legado — 14/09/2026

**Rodada concluída com pendências para revisão.** Este marco não declara o encerramento do objetivo global nem que todos os dados foram migrados.

**86.376 linhas de origem migradas e 86.376 INSERTs físicos nesta rodada**, com recibos independentes. Consolidação: 14/09/2026 20:24:40 UTC. [Resumo final com hashes](./dry-run/legacy-followup-20260914/post-load/summary.json).

| Frente | Linhas de origem migradas | INSERTs físicos | Lotes verificados | Campos conferidos |
| --- | ---: | ---: | ---: | ---: |
| Observações e justificativas de tarefas | 17.339 | 17.339 | 18 | 433.475 |
| Históricos de Prospecção e Clientes | 21.472 | 21.472 | 22 | 536.800 |
| Históricos de Pessoal e RH | 22.541 | 22.541 | 23 | 563.525 |
| Datas de previsão de tarefas | 7.223 | 7.223 | 8 | 180.575 |
| Históricos de Tecnologia | 12.436 | 12.436 | 13 | 310.900 |
| Históricos de Regularize | 5.365 | 5.365 | 6 | 134.125 |
| **Total desta rodada** | **86.376** | **86.376** | **90** | **2.159.400** |

Antes desta rodada: **235.398 fontes e 233.825 INSERTs recentes**. Agora, somando as rodadas recentes: **321.774 fontes e 320.201 INSERTs**.

Cada fonte e cada INSERT são contados uma vez. Os registros preservam históricos técnicos em `audit_requests`, com campos legados literais e sem reproduzir operações do domínio. Nenhum UPDATE ou DELETE foi registrado nos recibos de carga.

Foram reavaliadas **158.568** das **423.320** linhas da lista anterior. As outras **264.752** mantêm a análise anterior; não foram novamente examinadas nesta rodada. Pendência de mapeamento não significa impossibilidade definitiva de migração.

Permanecem **325.432 linhas sem mapeamento completo ou com dependências** e **257 mapeadas não carregadas**. As **26.123 pendências anteriores** continuam em categoria própria.

Backup de **474.405 linhas anteriores**, com [restauração integral: PASS](./dry-run/legacy-followup-20260914/load-restore-result.json) e [preservação de todas as linhas e campos: PASS](./dry-run/legacy-followup-20260914/load-preservation-result.json). [Acesso e ambiente finais: PASS](./dry-run/legacy-followup-20260914/final-access-environment.json): proteção das **3 tabelas** mantida e **7 serviços** preservados. [Limpeza da base isolada e dos dois papéis de ensaio](./dry-run/legacy-followup-20260914/load-trial-cleanup.json); contêiner compartilhado preservado.

Ensaios: [Observações e justificativas de tarefas: 12 casos](./dry-run/legacy-followup-20260914/h01-free-text/load/root-trial-result.json); [Históricos de Prospecção e Clientes: 12 casos](./dry-run/legacy-followup-20260914/commercial-client-history/load/root-trial-result.json); [Históricos de Pessoal e RH: 12 casos](./dry-run/legacy-followup-20260914/personnel-history/load/root-trial-result.json); [Datas de previsão de tarefas: 12 casos](./dry-run/legacy-followup-20260914/h01-forecast/load/root-trial-result.json); [Históricos de Tecnologia: 12 casos](./dry-run/legacy-followup-20260914/technology-history/load/root-trial-result.json); [Históricos de Regularize: 12 casos](./dry-run/legacy-followup-20260914/regularize-history/load/root-trial-result.json)

- [86.376 linhas migradas nesta rodada](./dry-run/legacy-followup-20260914/post-load/migrados-nesta-rodada.jsonl).
- [325.432 linhas sem mapeamento completo ou com dependências](./dry-run/legacy-followup-20260914/post-load/sem-mapeamento-completo-ou-dependencias.jsonl).
- [257 mapeadas não carregadas](./dry-run/legacy-followup-20260914/post-load/mapeados-nao-carregados.jsonl).
- [0 existentes preservados nesta reavaliação](./dry-run/legacy-followup-20260914/post-load/existentes-preservados-nesta-rodada.jsonl).
- [Partição individual completa da lista anterior](./dry-run/legacy-followup-20260914/post-load/resultado-individual.jsonl).

[Percentuais globais atualizados](./PROGRESSO-MIGRACAO.md). [Consolidação anterior preservada](./dry-run/legacy-code-load-20260914/post-load/summary.json).

Resumo final SHA256: `65a4d5322443e5c20a9cdd7b323574fed0461bd000a3ced11a0ea798f5ed2a58`.
