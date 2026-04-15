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
