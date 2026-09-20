# Percentuais da migração — 15/09/2026

Base: **1.410.923 linhas de origem**. Atualização: 15/09/2026 02:55:59 UTC. [Resumo final com hashes](./dry-run/legacy-resume-20260915/post-load/summary.json).

| Situação da linha de origem | Quantidade | Percentual da origem |
| --- | ---: | ---: |
| Existentes com conteúdo conferido | 38.662 | 2,74% |
| Existentes identificados; conteúdo integral ainda não certificado | 469.909 | 33,31% |
| Existentes com diferenças, preservados | 17.571 | 1,25% |
| Migradas nas rodadas recentes anteriores | 321.774 | 22,81% |
| Migradas nesta rodada, com recibos verificados | 5.951 | 0,42% |
| Exclusões de escopo por decisão vigente | 211.195 | 14,97% |
| Pendências anteriores, mantidas separadas | 26.123 | 1,85% |
| Sem mapeamento completo ou com dependências | 319.481 | 22,64% |
| Mapeadas não carregadas | 257 | 0,02% |
| **Total** | **1.410.923** | **100,00%** |

Categorias mutuamente exclusivas; percentuais arredondados individualmente. O quadro mede evidência por linha de origem e não equivale ao número de INSERTs nem à conclusão de todas as etapas.

**5.951 linhas de origem migradas e 5.951 INSERTs físicos nesta rodada**, com recibos independentes.

Antes desta rodada: **321.774 fontes e 320.201 INSERTs recentes**. Agora, somando as rodadas recentes: **327.725 fontes e 326.152 INSERTs**.

Permanecem **319.481 linhas sem mapeamento completo ou com dependências** e **257 mapeadas não carregadas**. As **26.123 pendências anteriores** continuam em categoria própria.

Foram reavaliadas **66.439** das **325.432** linhas da lista anterior. As outras **258.993** mantêm a análise anterior; não foram novamente examinadas nesta rodada. Pendência de mapeamento não significa impossibilidade definitiva de migração.

- [5.951 linhas migradas nesta rodada](./dry-run/legacy-resume-20260915/post-load/migrados-nesta-rodada.jsonl).
- [319.481 linhas sem mapeamento completo ou com dependências](./dry-run/legacy-resume-20260915/post-load/sem-mapeamento-completo-ou-dependencias.jsonl).
- [257 mapeadas não carregadas](./dry-run/legacy-resume-20260915/post-load/mapeados-nao-carregados.jsonl).
- [0 existentes preservados nesta reavaliação](./dry-run/legacy-resume-20260915/post-load/existentes-preservados-nesta-rodada.jsonl).
- [Partição individual completa da lista anterior](./dry-run/legacy-resume-20260915/post-load/resultado-individual.jsonl).

Backup de **560.914 linhas anteriores**, com [restauração integral: PASS](./dry-run/legacy-resume-20260915/load-restore-result.json) e [preservação de todas as linhas e campos: PASS](./dry-run/legacy-resume-20260915/load-preservation-result.json). [Acesso e ambiente finais: PASS](./dry-run/legacy-resume-20260915/final-access-environment.json): proteção das **3 tabelas** mantida e **7 serviços** preservados. [Base isolada e dois papéis de ensaio removidos](./dry-run/legacy-resume-20260915/load-trial-cleanup.json); [contêiner e PGDATA próprios removidos](./dry-run/legacy-resume-20260915/owned-trial-cleanup.json).

[Retomada da carga de históricos legados em 15/09](./CARGA-RETOMADA-LEGADO-2026-09-15.md). A consolidação anterior e seus recibos permanecem preservados: [rodada anterior](./dry-run/legacy-followup-20260914/post-load/summary.json).

**Rodada concluída com pendências para revisão.** Este marco não declara o encerramento do objetivo global nem que todos os dados foram migrados.

Resumo final SHA256: `42d0c6b8b74da1f78d55bfc9b853b26c7ccdb437bb2e5a1f5a00e905dfe020fc`.
