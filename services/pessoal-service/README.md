# pessoal-service

Microservico de Pessoal. O gateway encaminhara esse servico pelo prefixo publico **`/pessoal`**.

## Porta local

Por defeito: **3042** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `JWT_SECRET`
- `AUDIT_SERVICE_URL`
- `AUDIT_SERVICE_TOKEN`
- `PESSOAL_PASSWORD_ENCRYPTION_KEY`
- `PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION`
- `PESSOAL_DOMAIN_AUDIT_ENABLED`
- `SERVICE_ALLOWED_ORIGINS`
- `ENABLE_API_DOCS`

## Gateway

- URL upstream: `PESSOAL_SERVICE_URL` (ex.: `http://localhost:3042`)
- Prefixo publico: `/pessoal`

Exemplos de paths publicos planejados:

- `/pessoal/ldd`
- `/pessoal/situations`
- `/pessoal/unions`
- `/pessoal/payroll`
- `/pessoal/obrigations`
- `/pessoal/passwords`

## Desenvolvimento

```bash
pnpm --filter @workspace/pessoal-service dev
```
