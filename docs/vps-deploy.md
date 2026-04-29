# VPS Stable Stack Deploy

## Files

- `docker-compose.vps.yml`
- `docker/service.Dockerfile`
- `docker/nginx/generate-nginx-config.sh`
- `.env.vps.reverse-proxy`
- `.env.vps.gateway`
- `.env.vps.organization-service`
- `.env.vps.user-service`
- `.env.vps.task-service`
- `.env.vps.project-service`
- `.env.vps.client-service`
- `.env.vps.rh-service`
- `.env.vps.audit-service`

## First start

1. Fill the `.env.vps.*` files with the real VPS values.
2. If `NGINX_TLS_ENABLED=true`, place the certificate files in `docker/nginx/certs` on the VPS.
3. Point the frontend to `https://api.seu-dominio` with `NEXT_PUBLIC_API_URL`.
4. If you keep `NGINX_TLS_ENABLED=false`, use `http://api.seu-dominio` instead.
5. Start the stable stack:

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

6. Start the audit profile only when needed:

```bash
docker compose -f docker-compose.vps.yml --profile audit up -d --build audit-service gateway reverse-proxy
```

If you enable the audit profile, also switch `AUDIT_ENABLED=true` in `.env.vps.gateway`.

## Nginx TLS

Nginx in this stack does not provision certificates automatically.

- `NGINX_TLS_ENABLED=true`: listens on `80` and `443`, redirects HTTP to HTTPS and requires mounted cert files.
- `NGINX_TLS_ENABLED=false`: serves the API only over plain HTTP on port `80`.

## Update one service without touching the others

```bash
docker compose -f docker-compose.vps.yml up -d --build --no-deps user-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps task-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps project-service
```

The `--no-deps` flag keeps the rest of the stack running.

## Stop or remove one service

Stop only one container:

```bash
docker compose -f docker-compose.vps.yml stop user-service
```

Remove only one container:

```bash
docker compose -f docker-compose.vps.yml rm -sf user-service
```

Recreate it later without touching the rest:

```bash
docker compose -f docker-compose.vps.yml up -d --build --no-deps user-service
```

## Health checks

- Gateway: `GET /ready`
- Task service: `GET /ready`
- Client service: `GET /ready`
- Audit service: `GET /ready`
- Organization, user, project and RH services: `GET /health`

## CI/CD (GitHub Actions → VPS)

- Push em **`develop`**: workflow **Develop CI** (`.github/workflows/develop-cicd.yml`) — `build-and-push` + `vps-deploy` no slot `/data/workspace-develop` (`workspace-develop`).
- Push em **`staging`**: workflow **Staging CI/CD** (`.github/workflows/staging-cicd.yml`) — o mesmo padrão no slot `/data/workspace-staging` (`workspace-staging`).

- **Branches de teste de deploy** (mesmos segredos; paths e projetos Compose distintos na VPS):
  - `test/deploy-develop` → `test-deploy-develop-cicd.yml` — `/data/workspace-teste-develop`, `DEPLOY_SLOT=test-develop`, projeto `workspace-teste-develop` — portas **8087** (proxy) / **3013** (gateway), ficheiro `docker-compose.vps.slot-test-develop.yml`.
  - `test/deploy-staging` → `test-deploy-staging-cicd.yml` — `/data/workspace-teste-staging`, `DEPLOY_SLOT=test-staging`, projeto `workspace-teste-staging` — portas **8086** (proxy) / **3012** (gateway), ficheiro `docker-compose.vps.slot-test-staging.yml`.

  Slots **reais**: develop **8086**/**3011**, staging **8085**/**3010** (ver `vps-remote-deploy.sh`). Os slots de teste usam portas acima para reduzir choque com produção; ainda assim **8086** no teste-staging coincide com o proxy do **develop** real — não corras os dois no mesmo host sem ajustar um deles.

Em ambos: build/push de imagens para o registry e deploy por SSH com rollback em falha.

### Segredos no repositório (Actions)

| Segredo | Uso |
|---------|-----|
| `DOCKER_REGISTRY_URL`, `DOCKER_REGISTRY_USERNAME`, `DOCKER_REGISTRY_PASSWORD` | URL **com namespace** (ex.: `ghcr.io/meu-org`, `docker.io/meuuser` — não use só `ghcr.io`). Push/pull normalizam em minúsculas. |
| `ENV_VPS_*` | Igual ao manifest `scripts/ci/vps-secrets.manifest` — `.env.vps.*` copiados para a VPS em cada deploy |
| `VPS_HOST`, `VPS_USER` | SSH |
| `VPS_SSH_PRIVATE_KEY` | Preferencial (chave privada PEM) |
| `VPS_SSH_PASSWORD` | Alternativa (requer `sshpass` no runner — instalado no job) |

### Primeira vez na VPS

1. Instalar Docker e Compose plugin.
2. Clonar o repositório nos paths usados pelo CI (ajuste conforme o seu fork):

   - **develop:** `/data/workspace-develop` (branch `develop`)
   - **staging:** `/data/workspace-staging` (branch `staging`)
   - **teste develop:** `/data/workspace-teste-develop` (branch `test/deploy-develop`)
   - **teste staging:** `/data/workspace-teste-staging` (branch `test/deploy-staging`)

3. Com **develop** e **staging** na mesma VPS: **staging** usa só `docker-compose.vps.yml` (proxy **8085**, gateway **3010**). **develop** usa `docker-compose.vps.yml` + `docker-compose.vps.slot-develop.yml` (proxy **8086**, gateway **3011**). O `vps-remote-deploy.sh` aplica o override quando `DEPLOY_SLOT=develop`.

### Smoke / logs

O deploy remoto corre na VPS; se falhar, o script tenta reverter as imagens `workspace-*:vps` anteriores e imprime `docker compose ps` e `docker compose logs` no log do GitHub Actions.

## Current scope

This VPS stack is meant for the stable microservices only:

- `/user`
- `/organizations`
- `/task`
- `/project`
- `/client`
- `/rh`
- `/health`
- `/audit` when the audit profile is enabled

Legacy routes are intentionally out of scope for this deployment.
