# VPS Stable Stack Deploy

## Files

- `docker-compose.vps.yml`
- `docker/service.Dockerfile`
- `docker/app.Dockerfile` (Next.js UI, serviço `web`)
- `docker/nginx/generate-nginx-config.sh`
- `.env.vps.reverse-proxy`
- `.env.vps.gateway`
- `.env.vps.organization-service`
- `.env.vps.user-service`
- `.env.vps.task-service`
- `.env.vps.project-service`
- `.env.vps.client-service`
- `.env.vps.rh-service`
- `.env.vps.department-service`
- `.env.vps.fiscal-service`
- `.env.vps.contabil-service`
- `.env.vps.regularize-service`
- `.env.vps.ti-service`
- `.env.vps.certificate-service`
- `.env.vps.pessoal-service`
- `.env.vps.web` (Next: `NEXT_PUBLIC_API_URL` + `API_INTERNAL_URL` — ver secção CI)
- `.env.vps.audit-service`

## First start

1. Fill the `.env.vps.*` files with the real VPS values.
2. If `NGINX_TLS_ENABLED=true`, place the certificate files in `docker/nginx/certs` on the VPS.
3. Configure o secret **`ENV_VPS_WEB`** (corpo = ficheiro `.env.vps.web`): `NEXT_PUBLIC_API_URL=<URL pública do API para o browser>` (ex.: `https://api.seu-dominio` ou `http://IP:3010`) e `API_INTERNAL_URL=http://gateway:3010` para os rewrites `/api/*` do Next dentro da rede Docker.
4. If you keep `NGINX_TLS_ENABLED=false`, use `http://api.seu-dominio` instead.
5. Start the stable stack:

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

6. `certificate-service`, `pessoal-service` and `audit-service` are part of the default stack. Configure `CERTIFICATE_SERVICE_URL=http://certificate-service:3041` and `PESSOAL_SERVICE_URL=http://pessoal-service:3042` in `.env.vps.gateway`; control whether actions are audited with `AUDIT_ENABLED` in the gateway and service `.env.vps.*` files.

## Nginx TLS

Nginx in this stack does not provision certificates automatically.

- `NGINX_TLS_ENABLED=true`: listens on `80` and `443`, redirects HTTP to HTTPS and requires mounted cert files.
- `NGINX_TLS_ENABLED=false`: serves the API only over plain HTTP on port `80`.

## Update one service without touching the others

```bash
docker compose -f docker-compose.vps.yml up -d --build --no-deps organization-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps user-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps task-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps project-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps client-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps rh-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps department-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps fiscal-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps contabil-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps regularize-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps ti-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps certificate-service
docker compose -f docker-compose.vps.yml up -d --build --no-deps pessoal-service
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
- Organization service: `GET /health`
- User service: `GET /health`
- Project service: `GET /health`
- RH service: `GET /health`
- Department service: `GET /health`
- Fiscal service: `GET /health`
- Contabil service: `GET /health`
- Regularize service: `GET /health`
- TI service: `GET /ready`
- Certificate service: `GET /health`
- Pessoal service: `GET /health`
- **Web (Next.js):** `GET /` (container escuta na porta **3000**; no host, ver portas por slot abaixo)

## CI/CD (GitHub Actions → VPS)

- Push em **`develop`**: workflow **Develop CI** (`.github/workflows/develop-cicd.yml`) — `build-and-push` + `vps-deploy` no slot `/data/workspace-develop` (`workspace-develop`).
- Push em **`staging`**: workflow **Staging CI/CD** (`.github/workflows/staging-cicd.yml`) — o mesmo padrão no slot `/data/workspace-staging` (`workspace-staging`).

- **Branches de teste de deploy** (paths e projetos Compose distintos na VPS; `ENV_VPS_*` por **GitHub Environment**, ver abaixo):
  - `test/deploy-develop` → `test-deploy-develop-cicd.yml` — `/data/workspace-teste-develop`, `DEPLOY_SLOT=test-develop`, projeto `workspace-teste-develop` — portas **8087** (proxy) / **3013** (gateway) / **3002** (web UI), ficheiro `docker-compose.vps.slot-test-develop.yml`.
  - `test/deploy-staging` → `test-deploy-staging-cicd.yml` — `/data/workspace-teste-staging`, `DEPLOY_SLOT=test-staging`, projeto `workspace-teste-staging` — portas **8086** (proxy) / **3012** (gateway) / **3003** (web UI), ficheiro `docker-compose.vps.slot-test-staging.yml`.

  Slots **reais**: develop **8086**/**3011**/**3001** (web), staging **8085**/**3010**/**3000** (web no host 3000), ver `vps-remote-deploy.sh`. Os slots de teste usam portas acima para reduzir choque com produção; ainda assim **8086** no teste-staging coincide com o proxy do **develop** real — não corras os dois no mesmo host sem ajustar um deles.

Em ambos: build/push de imagens para o registry e deploy por SSH com rollback em falha.

### Segredos no repositório (Actions)

| Segredo | Uso |
|---------|-----|
| `ENV_VPS_GATEWAY` | Inclua `REGULARIZE_SERVICE_URL=http://regularize-service:3039`, `CERTIFICATE_SERVICE_URL=http://certificate-service:3041` e `PESSOAL_SERVICE_URL=http://pessoal-service:3042` para as rotas `/regularize`, `/certificate` e `/pessoal` dentro da rede Docker. |
| `ENV_VPS_CERTIFICATE_SERVICE` | Corpo de `.env.vps.certificate-service`; alem das variaveis base do service, inclua `CERTIFICATE_STORAGE_MODE=supabase`, `CERTIFICATE_STORAGE_BUCKET`, `CERTIFICATE_FILE_MAX_SIZE_BYTES`, `CERTIFICATE_FILE_ENCRYPTION_KEY`, `CERTIFICATE_FILE_ENCRYPTION_KEY_VERSION`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPLOAD_RATE_LIMIT_MAX` e `UPLOAD_RATE_LIMIT_WINDOW_MS` para upload/download criptografado de arquivos. |
| `ENV_VPS_PESSOAL_SERVICE` | Corpo de `.env.vps.pessoal-service`; inclua `DATABASE_URL`, `JWT_SECRET`, `AUDIT_SERVICE_URL=http://audit-service:3020`, `AUDIT_SERVICE_TOKEN`, `INTERNAL_SERVICE_TOKEN`, `PESSOAL_PASSWORD_ENCRYPTION_KEY`, `PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION` e `PESSOAL_DOMAIN_AUDIT_ENABLED`. |
| `DOCKER_REGISTRY_URL`, `DOCKER_REGISTRY_USERNAME`, `DOCKER_REGISTRY_PASSWORD` | URL **com namespace** (ex.: `ghcr.io/meu-org`, `docker.io/meuuser` — não use só `ghcr.io`). Push/pull normalizam em minúsculas. |
| `ENV_VPS_*` | Igual ao manifest `scripts/ci/vps-secrets.manifest` — `.env.vps.*` copiados para a VPS em cada deploy |
| `ENV_VPS_WEB` | Corpo do ficheiro **`.env.vps.web`**: pelo menos `NEXT_PUBLIC_API_URL=<URL pública do API para o browser>` e `API_INTERNAL_URL=http://gateway:3010` (rede Docker). O valor de `NEXT_PUBLIC_API_URL` é embutido no bundle no `docker compose build`. |
| `VPS_HOST`, `VPS_USER` | SSH |
| `VPS_SSH_PRIVATE_KEY` | Preferencial (chave privada PEM) |
| `VPS_SSH_PASSWORD` | Alternativa (requer `sshpass` no runner — instalado no job) |

Os serviços estáveis promovidos também exigem segredos de GitHub Environment para materializar os respetivos ficheiros ignorados na VPS: `ENV_VPS_DEPARTMENT_SERVICE`, `ENV_VPS_FISCAL_SERVICE`, `ENV_VPS_CONTABIL_SERVICE`, `ENV_VPS_REGULARIZE_SERVICE`, `ENV_VPS_TI_SERVICE`, `ENV_VPS_CERTIFICATE_SERVICE` e `ENV_VPS_PESSOAL_SERVICE`. Não faça stage nem commit dos ficheiros reais `.env.vps.*`.

### GitHub Environments (`ENV_VPS_*` por slot)

Os jobs de **build/push** e **deploy na VPS** usam `environment:` para que os mesmos nomes de segredo (ex.: `ENV_VPS_WEB`, `ENV_VPS_REVERSE_PROXY`) tenham **valores diferentes** por stack, sem renomear variáveis no workflow.

Crie os environments em **Settings → Environments** e adicione os segredos listados em `scripts/ci/vps-secrets.manifest` (pelo menos os `ENV_VPS_*` que o deploy materializa). `DOCKER_REGISTRY_*`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_*` podem continuar só ao nível do repositório; o job com `environment` continua a vê-los.

| Environment | Onde é usado |
|-------------|----------------|
| `vps-develop` | `.github/workflows/develop-cicd.yml` — jobs `build-and-push` e `vps-deploy` |
| `vps-staging` | `.github/workflows/staging-cicd.yml` — jobs `build-and-push` e `vps-deploy` |
| `vps-test-develop` | `.github/workflows/test-deploy-develop-cicd.yml` — jobs `build-and-push` e `vps-deploy` |
| `vps-test-staging` | `.github/workflows/test-deploy-staging-cicd.yml` — jobs `build-and-push` e `vps-deploy` |
| `production` | `.github/workflows/main-cicd.yml` — jobs `promote-image`, `main-candidate`, `dast` (e `database-migrations`, já existente) |

Em **teste staging**, o gateway público no host costuma ser a porta **3012** (não **3010** do staging “real”); o `ENV_VPS_WEB` desse environment deve refletir a URL que o browser usa para falar com o gateway desse slot.

Workflows que **não** definem `environment` (ex.: `test-cicd.yml` em branch de teste) continuam a usar apenas segredos ao nível do repositório.

### Primeira vez na VPS

1. Instalar Docker e Compose plugin.
2. Clonar o repositório nos paths usados pelo CI (ajuste conforme o seu fork):

   - **develop:** `/data/workspace-develop` (branch `develop`)
   - **staging:** `/data/workspace-staging` (branch `staging`)
   - **teste develop:** `/data/workspace-teste-develop` (branch `test/deploy-develop`)
   - **teste staging:** `/data/workspace-teste-staging` (branch `test/deploy-staging`)

3. Com **develop** e **staging** na mesma VPS: **staging** usa só `docker-compose.vps.yml` (proxy **8085**, gateway **3010**). **develop** usa `docker-compose.vps.yml` + `docker-compose.vps.slot-develop.yml` (proxy **8086**, gateway **3011**). O `vps-remote-deploy.sh` aplica o override quando `DEPLOY_SLOT=develop`.

### Healthchecks (VPS persistente vs CI/DAST)

O `docker-compose.vps.yml` define `healthcheck` com `node -e fetch(...)` a cada 30s. Isso é útil para `docker compose up --wait` em DAST/local (`scripts/ci/dast-local-stack.sh`), mas na VPS persistente gera muitos `runc exec` e sobrecarrega o `dockerd`.

### Rotinas internas do pessoal-service

O `pessoal-service` expõe `POST /internal/pessoal/union-notifications/run` para execução por scheduler externo, por exemplo Supabase ou Vercel. Não há cron job dentro do processo Node do serviço.

Configure `INTERNAL_SERVICE_TOKEN` em `.env.vps.pessoal-service` e envie o mesmo valor no header `x-internal-service-token` do scheduler. Se `INTERNAL_SERVICE_TOKEN` não for definido, o serviço usa `AUDIT_SERVICE_TOKEN` como fallback, mas para deploy recomenda-se manter um token explícito para rotas internas.

O deploy remoto (`vps-remote-deploy.sh`) aplica sempre:

- `docker-compose.vps.runtime-override.yml` — desativa healthchecks contínuos e troca `depends_on: service_healthy` por `service_started`
- `scripts/ci/vps-wait-endpoints.sh` — após `compose up -d`, verifica endpoints **uma vez** (loop com timeout, default 900s) via `curl` no host e `curlimages/curl` na rede `backend`

Comandos manuais na VPS devem incluir o runtime override, por exemplo:

```bash
docker compose -f docker-compose.vps.yml -f docker-compose.vps.runtime-override.yml -p workspace-develop up -d
```

### Smoke / logs

O deploy remoto corre na VPS; se falhar, o script tenta reverter as imagens `workspace-*:<WORKSPACE_VPS_IMAGE_TAG>` anteriores e imprime `docker compose ps` e `docker compose logs` no log do GitHub Actions.

### Tag local das imagens (`WORKSPACE_VPS_IMAGE_TAG`)

No mesmo host Docker, **vários clones** (develop, staging, testes) não devem partilhar a mesma tag local `workspace-*:vps`, senão um `docker pull` + `docker tag` de um slot sobrescreve a imagem que outro slot usa.

O `docker-compose.vps.yml` usa `image: workspace-<serviço>:${WORKSPACE_VPS_IMAGE_TAG:-vps}`. O CI define a variável no job `vps-deploy` e o `vps-remote-deploy.sh` grava-a em `.env` no diretório do clone na VPS para `docker compose` manual alinhar com o CI.

| Diretório na VPS (exemplo) | Workflow | Valor usado no CI |
|----------------------------|----------|-------------------|
| `/data/workspace-staging` | `staging-cicd.yml` | `vps-staging` |
| `/data/workspace-develop` | `develop-cicd.yml` | `vps-develop` |
| `/data/workspace-teste-develop` | `test-deploy-develop-cicd.yml` | `vps-test-develop` |
| `/data/workspace-teste-staging` | `test-deploy-staging-cicd.yml` | `vps-test-staging` |

O **registry** continua a usar tags por commit (ex.: `{registry}/gateway:<GITHUB_SHA>`); só a etiqueta **local** na VPS muda por stack.

### Deploy incremental (paths ignorados)

O script `scripts/ci/detect-changed-vps-services.sh` emite **`NONE`** quando o diff entre commits **só** inclui ficheiros sob `.agent/`, `.cursor/`, `.husky/`, `vscode/`, `.vscode/` ou `docs/` — nesse caso o job de build/push **não** reconstrói imagens workspace e o deploy **não** refaz pull completo (evita reiniciar serviços só por mudanças de tooling ou documentação). Se o mesmo commit tocar fora destes paths, aplica-se a lógica normal (lista de serviços ou `ALL`).

## Current scope

This VPS stack is meant for the stable microservices only:

- `/user`
- `/organizations`
- `/task`
- `/project`
- `/client`
- `/rh`
- `/department`
- `/fiscal`
- `/contabil`
- `/regularize`
- `/ti`
- `/pessoal`
- `/health`
- `/audit` when `AUDIT_ENABLED=true`

Legacy routes are intentionally out of scope for this deployment.

## Otimizacao de build e deploy

Os workflows `develop`, `staging`, `test/deploy-develop` e `test/deploy-staging` usam o escopo produzido por `scripts/ci/detect-changed-vps-services.sh` para reduzir trabalho depois da etapa de qualidade.

Escopos:

- `NONE`: nao ha imagem VPS afetada. O workflow pula Buildx, login no registry, limpeza de disco, push e deploy SSH.
- Lista de servicos: o workflow constroi e publica apenas as imagens selecionadas usando `scripts/ci/compose-vps-buildx-push.sh` com cache Buildx por servico.
- `ALL`: o workflow constroi todas as imagens workspace e mantem limpeza agressiva de disco antes do build.

O deploy remoto preserva rollback. Antes de puxar novas imagens, `scripts/ci/vps-remote-deploy.sh` grava os IDs locais em `.deploy/image-ids-before-<tag>.txt`. Se `compose up` ou a verificação pontual de endpoints falhar, o script reetiqueta as imagens anteriores e tenta subir novamente o mesmo escopo.

Rollback nao e fallback. Falha em deploy seletivo nao vira deploy `ALL` automaticamente. Deploy completo acontece quando o detector retorna `ALL` ou quando o workflow e ajustado explicitamente para isso.
