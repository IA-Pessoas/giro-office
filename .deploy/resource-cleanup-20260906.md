# Recuperação de RAM e disco após o deploy

- Pedido: reduzir memória e disco altos no VPS.
- Diagnóstico inicial: RAM usada 5,8 GiB de 7,8 GiB; disponível 2,0 GiB; swap usada 2,6 GiB. Disco usado 77 GB (81%), livre 18 GB.
- BuildKit: 26,45 GB de cache; 24,7 GB recuperáveis. Daemon Docker: aproximadamente 1,9 GiB de RSS.

## Ações

1. Removido apenas cache de build reconstruível com `docker builder prune --all --force`: ferramenta reportou 24,7 GB recuperados. Imagens, containers, volumes, logs e rollback recente preservados.
2. Coleta de lixo solicitada pelo endpoint local pprof; o daemon continuou com RSS próximo de 1,9 GiB.
3. Validado suporte a live-restore: standalone, Swarm inativo, systemd KillMode=process e reload disponível.
4. Adicionado somente `live-restore: true` a `/etc/docker/daemon.json`, preservando logging e pools de endereços. Configuração validada antes da instalação.
5. Aplicado reload; confirmado LiveRestoreEnabled=true antes de reiniciar apenas o daemon Docker.

## Verificação

- 41 containers antes e depois, com mesmos IDs, PIDs, StartedAt e contadores de reinícios.
- Certificados preservado e saudável.
- 40 consultas HTTP aos endpoints públicos Giro/Nexus durante a operação, sem falhas.
- RAM após a operação: cerca de 3,7 GiB usados e 4,1 GiB disponíveis.
- Disco após a limpeza: 56 GB usados (59%), 40 GB livres.
- Swap permaneceu habilitada; não foi executado swapoff nem descarte artificial do cache de páginas.
- Cache Docker restante reportado após prune: 1,754 GB ativos, 0 B recuperáveis.

## Evidências e recuperação

- Log da limpeza: `/tmp/giro-build-cache-cleanup-20260905.log`.
- Backup do daemon: `/tmp/docker-memory-recovery-mGwMrM/daemon-before.json`.
- Snapshot anterior e verificação: `/tmp/docker-memory-recovery-mGwMrM/`.
- Script executado: `/tmp/giro-docker-memory-recovery-20260906.mjs`.
- Live restore permanece habilitado. Não foram instaladas tarefas automáticas de limpeza.
- Cache removido pode ser reconstruído em futuros builds.

Referência: https://docs.docker.com/engine/daemon/live-restore/
