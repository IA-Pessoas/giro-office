# Carga da fila de mapeados — 14/09/2026

**Rodada posterior concluída com pendências:** [Carga com apoio do código legado](./CARGA-CODIGO-LEGADO-2026-09-14.md); [percentuais atuais](./PROGRESSO-MIGRACAO.md). **110.331 linhas de origem migradas e 110.331 INSERTs físicos nesta rodada**, com recibos independentes.

O corpo abaixo permanece como registro da carga anterior da fila de mapeados, com suas contagens e seus recibos preservados.

**120.464 linhas de origem migradas nesta rodada, representadas por 118.891 INSERTs físicos.** As três frentes terminaram com verificação independente; a preservação final passou. Consolidação: 14/09/2026 15:42:16 UTC. [resumo final com hashes](./dry-run/mapped-load-20260914/post-load/summary.json).

| Frente | Linhas de origem migradas | INSERTs físicos | Lotes verificados |
| --- | ---: | ---: | ---: |
| H01 | 118.024 | 118.024 | 119 |
| RH | 2.435 | 862 | 1 |
| Operacional | 5 | 5 | 2 |
| **Total desta rodada** | **120.464** | **118.891** | **122** |

No RH, **2.435 históricos de origem correspondem a 862 snapshots técnicos**. Cada linha de origem e cada INSERT são contados uma vez. Pedidos e mensagens preservados dentro dos snapshots não foram somados como novas linhas deste recorte.

Os **4.603 registros e 4.603 INSERTs dos quatro lotes recentes anteriores** permanecem separados. Incluindo esta rodada, são 125.067 linhas de origem e 123.494 INSERTs físicos recentes.

## Preservação e execução

Proteção autorizada de **3 tabelas**, aplicada e conferida: [autorização](./dry-run/mapped-load-20260914/access-approval.json) e [resultado](./dry-run/mapped-load-20260914/protection-completion.json). A alteração ficou restrita a RLS/ACL de `audit_requests`, `contabil.control` e `parcelamento.panorama`; serviços e dados existentes foram preservados.

Backup com **245.153 linhas anteriores**, restaurado integralmente no ensaio: [manifesto](./dry-run/mapped-load-20260914/backup-current-manifest.json), [restauração: PASS](./dry-run/mapped-load-20260914/load-restore-result.json) e [preservação final: PASS](./dry-run/mapped-load-20260914/load-preservation-result.json). Todas as linhas e todos os campos anteriores das três tabelas foram conferidos.

Ensaios: [H01: 12 casos](./dry-run/mapped-load-20260914/h01/load/root-trial-result.json), [RH: 12 casos](./dry-run/mapped-load-20260914/rh/load/v2/root-trial-result.json), [Operacional: 12 casos](./dry-run/mapped-load-20260914/operational/load/root-trial-result.json); [retomada: 6 casos](./dry-run/mapped-load-20260914/resume-trial-result.json). H01 interrompeu por `lock_timeout` (`55P03`) depois de **9.000 INSERTs já verificados**. A [retomada concluída](./dry-run/mapped-load-20260914/h01/load/root-completion.json) reconferiu os lotes anteriores em conexão independente, sem repeti-los.

A primeira tentativa RH foi revertida com **zero INSERTs** após timeout de **12 segundos** (`57014`) na busca de aliases: [recibo original preservado](./dry-run/mapped-load-20260914/rh/load/batches/0001-error.json). A [execução RH v2](./dry-run/mapped-load-20260914/rh/load/v2/root-completion.json) foi concluída e verificada, com os recibos originais preservados. A busca passou a filtrar os campos físicos antes de examinar os metadados. [Medição somente leitura: PASS](./dry-run/mapped-load-20260914/rh/read-only-diagnosis-v2.json).

Resumo final SHA256: `14f616bdb90fcdafdd6d8d45f9e4e9a2f1b1288586951f8cae5c6d236f20fc3c`.

## Listas finais

- [120.464 linhas de origem migradas nesta rodada](./dry-run/mapped-load-20260914/post-load/migrados-nesta-rodada.jsonl).
- [257 mapeadas não carregadas](./dry-run/mapped-load-20260914/post-load/mapeados-nao-carregados.jsonl).
- [565.012 sem mapeamento completo ou com dependências](./dry-run/mapped-load-20260914/post-load/sem-mapeamento-completo-ou-dependencias.jsonl).
- [13.697 existentes preservadas neste recorte](./dry-run/mapped-load-20260914/post-load/existentes-preservados.jsonl).
- [2.281 exclusões de escopo neste recorte](./dry-run/mapped-load-20260914/post-load/exclusoes-de-escopo.jsonl).
- [Resultado individual dos 137.818 mapeados](./dry-run/mapped-load-20260914/post-load/resultado-dos-mapeados.jsonl) e [partição das 701.711 linhas do recorte](./dry-run/mapped-load-20260914/post-load/resultado-individual.jsonl).

| Mapeadas não carregadas | Linhas de origem |
| --- | ---: |
| H01 | 211 |
| RH | 39 |
| Operacional | 7 |
| **Total** | **257** |

As listas mantêm os motivos e referências individuais. Falta de mapeamento completo não significa descarte definitivo. Conflitos, repetições históricas ambíguas e grupos sem preservação integral continuam separados. A proteção aplicada não transformou essas pendências em cargas concluídas.

Cobertura do recorte: **701.711 linhas**, zero duplicidades e zero omissões. Os [percentuais globais](./PROGRESSO-MIGRACAO.md) usam **1.410.923 linhas de origem**, sem misturar contagens de INSERTs. Arquivos individuais permanecem privados; os recibos anteriores foram preservados.
