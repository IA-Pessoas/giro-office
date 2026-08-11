# Produção single-slot em useoffice.com.br

Este ambiente executa imagens Docker sem bind mount do checkout. Atualizar o Git não altera os
containers ativos:

```bash
git pull --ff-only
```

Somente o comando abaixo inicia build, migrations e a janela explícita de atualização:

```bash
pnpm deploy:production
```

## Topologia

- Projeto Compose: `giro-office-production`.
- Compose base: `docker-compose.vps.yml`.
- Override: `docker-compose.production.yml`.
- Entrada pública: Caddy existente nas portas 80/443.
- UI: serviço `web` na rede Docker externa `public-edge`.
- API: `/api/*` passa pelo rewrite do Next.js para `gateway:3010`.
- Gateway e serviços de domínio não publicam portas no host.

O DNS deve ter o registro A `useoffice.com.br` apontando para `187.77.48.15`. O host `www`
permanece CNAME do domínio raiz e o Caddy o redireciona para `https://useoffice.com.br`.

## Primeiro deploy

1. Crie a rede externa uma única vez:

   ```bash
   docker network inspect public-edge >/dev/null 2>&1 || docker network create public-edge
   ```

2. Materialize todos os `.env.vps.*` listados em `scripts/ci/vps-secrets.manifest` e aplique
   modo `0600`.
3. Conecte o Caddy à rede externa e configure os dois hosts.
4. Execute `pnpm deploy:production`.
5. Confira o runtime:

   ```bash
   docker compose -p giro-office-production \
     -f docker-compose.vps.yml \
     -f docker-compose.production.yml ps
   ```

O script valida os envs e o Compose, constrói as 17 imagens sequencialmente antes da troca,
aplica migrations, recria a stack e aguarda endpoints. Em falha, restaura as tags anteriores e
tenta reiniciar a versão anterior.

## Logs e diagnóstico

```bash
docker compose -p giro-office-production \
  -f docker-compose.vps.yml \
  -f docker-compose.production.yml logs --tail=200
```

Os arquivos `.env.vps.*` não podem ser adicionados ao Git nem copiados para logs.

## Rotação obrigatória

A senha PostgreSQL e a chave secreta Supabase usadas no primeiro deploy foram compartilhadas
durante a preparação operacional. Rotacione ambas após a validação e atualize os envs backend.
Nunca coloque a chave secreta em variável `NEXT_PUBLIC_*`.

## Migração futura para Supabase local

A migração deve ser coordenada: copiar os dados, aplicar migrations no destino, trocar
`DATABASE_URL`, `SUPABASE_URL` e a chave backend, recriar a stack e repetir health checks e o
smoke autenticado. As imagens não precisam ser redesenhadas para essa troca.
