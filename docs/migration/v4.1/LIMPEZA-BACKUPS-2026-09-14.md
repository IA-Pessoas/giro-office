# Limpeza de backups — 14/09/2026

Pedido do usuário: remover backups das cargas concluídas antes de continuar a migração.

Foram removidos 14 dumps compactados das rodadas L01, mapeados, código legado e complementar, incluindo tentativas incompletas. Total de blocos dos arquivos removidos: **361.107.456 bytes** (361 MB; 344,4 MiB). Nenhum desses arquivos estava aberto por processos no momento da conferência.

- [Manifesto com caminhos, tamanhos e hashes](./dry-run/cleanup-backups-20260914/manifest.json).
- [Recibo da remoção e verificação](./dry-run/cleanup-backups-20260914/completion.json).

O ZIP original do legado, o backup integral inicial do banco (42.229.104 bytes), o resumo final e a lista atual de pendências foram preservados e conferidos por SHA-256. Os recibos e manifestos anteriores também permanecem inalterados.

**As referências históricas aos 14 dumps removidos não indicam mais arquivos disponíveis para restauração.** Antes de uma nova carga em produção, capturar um novo backup consistente do escopo afetado. O backup integral inicial é anterior às cargas e não representa o estado atual.

Após a remoção: raiz em **91%**, com **10.067.247.104 bytes livres** (9,4 GiB). Os mesmos 44 contêineres permaneciam ativos; nenhuma operação de escrita no Docker ou no banco foi executada nesta limpeza. As alterações Git anteriores foram preservadas.

Opções adicionais identificadas na primeira etapa:

- Cache de build: 1,789 GB privados recuperáveis; outros 3,4 GB são compartilhados com imagens e não devem ser somados como ganho garantido.
- Base local de ensaio `dry-run/termos-ti3-2026-09-14/pg-trial`: aproximadamente 840 MiB, sem montagem em nenhum contêiner existente.
- Imagens Docker sem contêineres associados: estimativa agregada do Docker de 11,3 GB recuperáveis. Selecionar imagens de desenvolvimento e versões antigas, preservando imagens ativas e as necessárias para recuperação; a estimativa não equivale a uma autorização de exclusão.

Os aproximadamente 21 GiB de artefatos de migração incluem mapeamentos, índices e evidências individuais. Não são todos backups descartáveis.

## Limpeza ampliada autorizada e executada

Após o pedido “o que pode ser excluído deve ser excluído”, foram removidos:

- Cache de build Docker e pacotes baixados no cache APT.
- 26 imagens antigas sem referência por contêineres, incluindo desenvolvimento e rollbacks fora da retenção de 24 horas. Imagens ativas e tags de produção foram preservadas.
- A base PostgreSQL local de ensaio já encerrada.
- Oito diretórios de caches de pnpm, Playwright e compilação, sem processos usando-os durante a conferência.
- Dois volumes de dependências do antigo desenvolvimento Nexus, comprovados sem contêineres associados: `nexus_nexus_node_modules` e `nexus_nexus_pnpm_store`.

**Resultado: 91% → 66% de uso; 34.566.692.864 bytes disponíveis (32,2 GiB).** Aumento de aproximadamente **24,5 GB** no espaço disponível em relação à medição ao fim da primeira etapa.

Os 44 contêineres mantiveram IDs, imagens, horários de início, estado e montagens. A comparação inicial das montagens acusou diferença por ordem dos elementos; a conferência de todos os campos ordenados por destino, origem e tipo passou, sem repetir as remoções. A dependência `pg` dos scripts de migração continuou carregando normalmente.

O ZIP original, o backup integral inicial, o resumo final e as pendências conservaram seus hashes. Para o próximo ensaio, a base temporária precisa ser recriada; para a próxima carga, continua necessária uma nova captura consistente do destino.

[Resumo final da limpeza ampliada](./dry-run/cleanup-disk-20260914/final-summary.json), [inventário e seleção](./dry-run/cleanup-disk-20260914/plan.json) e [verificação dos contêineres](./dry-run/cleanup-disk-20260914/verification.json).
