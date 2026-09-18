# Retomada da carga de históricos legados — 15/09/2026

**Rodada concluída com pendências para revisão.** Este marco não declara o encerramento do objetivo global nem que todos os dados foram migrados.

**5.951 linhas de origem migradas e 5.951 INSERTs físicos nesta rodada**, com recibos independentes. Consolidação: 15/09/2026 02:55:59 UTC. [Resumo final com hashes](./dry-run/legacy-resume-20260915/post-load/summary.json).

| Frente | Linhas de origem migradas | INSERTs físicos | Lotes verificados | Campos conferidos |
| --- | ---: | ---: | ---: | ---: |
| Históricos do Contábil | 442 | 442 | 1 | 11.050 |
| Históricos de Regularize | 2.525 | 2.525 | 3 | 63.125 |
| Históricos de Tarefas | 2.984 | 2.984 | 3 | 74.600 |
| **Total desta rodada** | **5.951** | **5.951** | **7** | **148.775** |

Antes desta rodada: **321.774 fontes e 320.201 INSERTs recentes**. Agora, somando as rodadas recentes: **327.725 fontes e 326.152 INSERTs**.

Cada fonte e cada INSERT são contados uma vez. Os registros preservam históricos técnicos em `audit_requests`, com campos legados literais e sem reproduzir operações do domínio. Nenhum UPDATE ou DELETE foi registrado nos recibos de carga.

Foram reavaliadas **66.439** das **325.432** linhas da lista anterior. As outras **258.993** mantêm a análise anterior; não foram novamente examinadas nesta rodada. Pendência de mapeamento não significa impossibilidade definitiva de migração.

Permanecem **319.481 linhas sem mapeamento completo ou com dependências** e **257 mapeadas não carregadas**. As **26.123 pendências anteriores** continuam em categoria própria.

Backup de **560.914 linhas anteriores**, com [restauração integral: PASS](./dry-run/legacy-resume-20260915/load-restore-result.json) e [preservação de todas as linhas e campos: PASS](./dry-run/legacy-resume-20260915/load-preservation-result.json). [Acesso e ambiente finais: PASS](./dry-run/legacy-resume-20260915/final-access-environment.json): proteção das **3 tabelas** mantida e **7 serviços** preservados. [Base isolada e dois papéis de ensaio removidos](./dry-run/legacy-resume-20260915/load-trial-cleanup.json); [contêiner e PGDATA próprios removidos](./dry-run/legacy-resume-20260915/owned-trial-cleanup.json).

Ensaios: [Históricos do Contábil: 12 casos](./dry-run/legacy-resume-20260915/accounting-history/load/root-trial-result.json); [Históricos de Regularize: 12 casos](./dry-run/legacy-resume-20260915/regularize-history/load/root-trial-result.json); [Históricos de Tarefas: 12 casos](./dry-run/legacy-resume-20260915/task-history/load/root-trial-result.json)

- [5.951 linhas migradas nesta rodada](./dry-run/legacy-resume-20260915/post-load/migrados-nesta-rodada.jsonl).
- [319.481 linhas sem mapeamento completo ou com dependências](./dry-run/legacy-resume-20260915/post-load/sem-mapeamento-completo-ou-dependencias.jsonl).
- [257 mapeadas não carregadas](./dry-run/legacy-resume-20260915/post-load/mapeados-nao-carregados.jsonl).
- [0 existentes preservados nesta reavaliação](./dry-run/legacy-resume-20260915/post-load/existentes-preservados-nesta-rodada.jsonl).
- [Partição individual completa da lista anterior](./dry-run/legacy-resume-20260915/post-load/resultado-individual.jsonl).

[Percentuais globais atualizados](./PROGRESSO-MIGRACAO.md). [Consolidação anterior preservada](./dry-run/legacy-followup-20260914/post-load/summary.json).

Resumo final SHA256: `42d0c6b8b74da1f78d55bfc9b853b26c7ccdb437bb2e5a1f5a00e905dfe020fc`.
