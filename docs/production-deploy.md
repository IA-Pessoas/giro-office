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
- Borda: `reverse-proxy` na rede Docker externa `public-edge`, publicado somente em
  `127.0.0.1:${REVERSE_PROXY_PORT:-8080}` (HTTP) e
  `127.0.0.1:${REVERSE_PROXY_TLS_PORT:-8443}` (TLS, quando habilitado).
- UI: `/` e assets são encaminhados pelo reverse-proxy para `web:3000`.
- API: `/api/*` é encaminhado ao `gateway:3010` com o prefixo `/api` removido.
- Documentação: `/docs/*` e `/openapi.json` são encaminhados ao gateway sem remover o prefixo.
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
3. Com `NGINX_TLS_ENABLED=false`, configure o Caddy existente para encaminhar
   `useoffice.com.br` ao endpoint local `127.0.0.1:${REVERSE_PROXY_PORT:-8080}`.
   Com TLS no Nginx, use `https://127.0.0.1:${REVERSE_PROXY_TLS_PORT:-8443}` como upstream.
   Não altere o apontamento DNS do domínio.
4. Execute `pnpm deploy:production`.
5. Confira o runtime:

   ```bash
   docker compose -p giro-office-production \
     -f docker-compose.vps.yml \
     -f docker-compose.production.yml ps
   ```

O script valida os envs e o Compose, constrói as 19 imagens sequencialmente antes da troca,
aplica migrations, recria a stack e aguarda endpoints. Em falha, restaura as tags anteriores e
tenta reiniciar a versão anterior.

Para expor a documentação deliberadamente, configure `ENABLE_API_DOCS=true`,
`GATEWAY_PUBLIC_URL=https://useoffice.com.br` e `GATEWAY_ALLOWED_ORIGINS=https://useoffice.com.br`
no `.env.vps.gateway`. O web continua usando `NEXT_PUBLIC_API_URL=/api` e
`API_INTERNAL_URL=http://gateway:3010`; `AUTH_COOKIE_SECURE` permanece `true`.

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
