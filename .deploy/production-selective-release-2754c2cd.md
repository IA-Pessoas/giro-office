# Implantação seletiva: 2754c2cd

## Resultado

- Atualizados 18 containers: todos os containers Giro existentes, exceto certificate-service.
- Todos usam as imagens construídas do commit 2754c2cd, com tags `:production`.
- 17 containers atualizados com healthcheck saudável; reports-worker em execução, sem healthcheck configurado.
- Zero reinícios, zero OOM e zero ocorrências de EMAXCONNSESSION nos logs consultados desde a inicialização da versão nova (até 1.000 linhas por container).
- Certificados preservado: mesmo ID, imagem, StartedAt e contador de reinícios; continua saudável.
- Nenhuma migration pendente: 128 já aplicadas; nenhuma alteração de banco realizada neste rollout.
- Supabase Pool Size não foi confirmado nem alterado. O usuário autorizou prosseguir sem essa confirmação. Cada serviço foi parado antes de iniciar sua substituição, evitando duplicar os pools por sobreposição de containers.
- Caddy e containers dos demais sistemas não foram alterados. A rota existente via rede backend permaneceu em uso; não foi criado o reverse-proxy novo, cuja porta TLS padrão conflita com supabase-kong.

## Verificação pública

- `/api/health`: success=true, status=ok.
- `/api/ready`: success=true, status=ready, 16 serviços de domínio.
- `/login` e `/super-admin/login`: HTTP 200; formulários com campo de senha visíveis em navegador Chromium; nenhum erro JavaScript ou resposta 5xx durante o smoke.
- Não foi executado login com credenciais nem navegação autenticada pelos módulos.

## Procedimento e recuperação

- O script oficial não suporta a exclusão de Certificados. A autorização específica do usuário foi executada por um procedimento seletivo com validação de Compose/env, imagens previamente construídas, backup de imagens, stop/up por serviço, espera de healthcheck e verificação do digest.
- Script utilizado: `/tmp/giro-cutover-2754c2cd.sh`.
- Log: `/tmp/giro-cutover-2754c2cd.log`.
- Checkpoint das imagens anteriores: `/tmp/giro-cutover-2754c2cd-WWvsXM/images-before.txt`.
- Baseline de Certificados: `/tmp/giro-cutover-2754c2cd-WWvsXM/certificate-before.txt`.
- Imagens anteriores mantidas com tags de rollback. Nenhuma limpeza ampla foi executada.
- Env backups e detalhes de preparação: `/tmp/giro-release-2754c2cd-status.md`.
- Não foi alterado `production-last-good-commit`, pois esta é uma release mista com Certificados preservado.

## Limites conhecidos

- A issue de Certificados continua fora do escopo, conforme solicitado.
- O relatório de Pessoal tem incompatibilidade entre REPORTS_INTERNAL_TOKEN do adapter e INTERNAL_SERVICE_TOKEN do serviço receptor, já registrada na preparação; o smoke de infraestrutura não valida esse fluxo autenticado.
- Após a atualização, o VPS tinha aproximadamente 2 GiB de RAM disponível, 2,2 GiB de swap ocupada e 18 GB livres em disco.
