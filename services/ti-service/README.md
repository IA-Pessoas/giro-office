# ti-service

Microservico do modulo Tecnologia. Centraliza chamados de TI, inventario, senhas, ramais, termos, estoque filtrado para o departamento Tecnologia e robos/automacoes.

## Porta local

Por padrao: **3040** (`PORT`).

## Variaveis de ambiente

As variaveis sao lidas em `src/config/env.ts`.

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `AUDIT_SERVICE_URL`
- `AUDIT_SERVICE_TOKEN`
- `TI_SERVICE_INTERNAL_TOKEN`
- `SERVICE_ALLOWED_ORIGINS`
- `ENABLE_API_DOCS`
- `LOG_LEVEL`
- `LOG_PRETTY`

## Gateway

- URL upstream: `TI_SERVICE_URL` (ex.: `http://localhost:3040`)
- Prefixo publico: `/ti`
- Exemplo: `GET /ti/requests/list`
- Exemplo: `GET /ti/inventory/list`
- Exemplo: `POST /ti/inventory`

## Desenvolvimento

```bash
pnpm --filter @workspace/ti-service dev
```

## Testes

```bash
pnpm --filter @workspace/ti-service test
pnpm --filter @workspace/ti-service typecheck
pnpm turbo run build --filter=@workspace/ti-service
```
