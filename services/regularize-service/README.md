# regularize-service

Micro-servico de regularize. Centraliza rotas, validacao, OpenAPI e rotinas internas de reconciliacao do modulo legado.

## Porta local

Por defeito: **3411** (`PORT`).

## Variaveis de ambiente

- `DATABASE_URL`
- `JWT_SECRET`
- `MTK_ENCRYPTION_KEY`
- `AUDIT_SERVICE_TOKEN`
- `REGULARIZE_SERVICE_INTERNAL_TOKEN`

## Gateway

- URL upstream: `REGULARIZE_SERVICE_URL` (ex.: `http://localhost:3411`)
- prefixo publico: `/regularize`
- endpoints internos `/internal/*` nao devem ser expostos via gateway

## Desenvolvimento

```bash
pnpm --filter @workspace/regularize-service dev
```

Testes:

```bash
pnpm --filter @workspace/regularize-service test
```
