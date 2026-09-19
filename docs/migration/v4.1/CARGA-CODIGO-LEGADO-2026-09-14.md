# Carga com apoio do código legado — 14/09/2026

**Rodada posterior concluída com pendências:** [Carga complementar com apoio do código legado](./CARGA-COMPLEMENTAR-LEGADO-2026-09-14.md); [percentuais atuais](./PROGRESSO-MIGRACAO.md). **86.376 linhas de origem migradas e 86.376 INSERTs físicos nesta rodada**, com recibos independentes.

O corpo abaixo permanece como registro da primeira carga com apoio do código legado, com suas contagens e seus recibos preservados.

**Rodada concluída com pendências para revisão.** Este marco não declara o encerramento do objetivo global nem que todos os dados foram migrados.

**110.331 linhas de origem migradas e 110.331 INSERTs físicos nesta rodada**, com recibos independentes. Consolidação: 14/09/2026 17:38:45 UTC. [Resumo final com hashes](./dry-run/legacy-code-load-20260914/post-load/summary.json).

| Frente | Linhas de origem migradas | INSERTs físicos | Lotes verificados | Campos conferidos |
| --- | ---: | ---: | ---: | ---: |
| Históricos de Parcelamento | 47.203 | 47.203 | 48 | 1.180.075 |
| Históricos de tarefas, Contábil e Regularize | 39.924 | 39.924 | 40 | 998.100 |
| Históricos fiscais | 23.204 | 23.204 | 24 | 580.100 |
| **Total desta rodada** | **110.331** | **110.331** | **112** | **2.758.275** |

Antes desta rodada: **125.067 fontes e 123.494 INSERTs recentes**. Agora, somando as rodadas recentes: **235.398 fontes e 233.825 INSERTs**.

Cada fonte e cada INSERT são contados uma vez. Os registros preservam históricos técnicos em `audit_requests`, com campos legados literais e sem reproduzir operações do domínio. Nenhum UPDATE ou DELETE foi registrado nos recibos de carga.

NCM: **27.233 existentes equivalentes**, **4.128 existentes divergentes preservados** e **1 pendente por data obrigatória inválida**. Nenhum novo INSERT de NCM. [Reavaliação individual NCM](./dry-run/legacy-code-load-20260914/fiscal/summary.json).

Foram reavaliadas **243.218** das **565.012** linhas da lista anterior. As outras **321.794** mantêm a análise anterior; não foram novamente examinadas nesta rodada. Pendência de mapeamento não significa impossibilidade definitiva de migração.

Permanecem **423.320 linhas sem mapeamento completo ou com dependências** e **257 mapeadas não carregadas**. As **26.123 pendências anteriores** continuam em categoria própria.

Backup de **364.052 linhas anteriores**, com [restauração integral: PASS](./dry-run/legacy-code-load-20260914/load-restore-result.json) e [preservação de todas as linhas e campos: PASS](./dry-run/legacy-code-load-20260914/load-preservation-result.json). [Acesso e ambiente finais: PASS](./dry-run/legacy-code-load-20260914/final-access-environment.json): proteção das **3 tabelas** mantida e **7 serviços** preservados. [Limpeza da base isolada e dos dois papéis de ensaio](./dry-run/legacy-code-load-20260914/load-trial-cleanup.json); contêiner compartilhado preservado.

Ensaios: [Históricos de Parcelamento: 12 casos](./dry-run/legacy-code-load-20260914/parcelamento/load/root-trial-result.json); [Históricos de tarefas, Contábil e Regularize: 12 casos](./dry-run/legacy-code-load-20260914/h01/load/root-trial-result.json); [Históricos fiscais: 12 casos](./dry-run/legacy-code-load-20260914/fiscal-history/load/root-trial-result.json); [retomada: 6 casos](./dry-run/legacy-code-load-20260914/resume-trial-result.json).

- [110.331 linhas migradas nesta rodada](./dry-run/legacy-code-load-20260914/post-load/migrados-nesta-rodada.jsonl).
- [423.320 linhas sem mapeamento completo ou com dependências](./dry-run/legacy-code-load-20260914/post-load/sem-mapeamento-completo-ou-dependencias.jsonl).
- [257 mapeadas não carregadas](./dry-run/legacy-code-load-20260914/post-load/mapeados-nao-carregados.jsonl).
- [31.361 existentes preservados nesta reavaliação](./dry-run/legacy-code-load-20260914/post-load/existentes-preservados-nesta-rodada.jsonl).
- [Partição individual completa da lista anterior](./dry-run/legacy-code-load-20260914/post-load/resultado-individual.jsonl).

[Percentuais globais atualizados](./PROGRESSO-MIGRACAO.md). [Consolidação anterior preservada](./dry-run/mapped-load-20260914/post-load/summary.json).

Resumo final SHA256: `af59a78b732394a8b33ac7c419c2a7bd54593942a5638eb8a49c2487a82f1900`.
