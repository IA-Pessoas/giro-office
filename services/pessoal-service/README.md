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
- `INTERNAL_SERVICE_TOKEN` (opcional; usa `AUDIT_SERVICE_TOKEN` como fallback; recomendado em deploy para rotas internas)
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

## Rotinas internas

- `POST /internal/pessoal/union-notifications/run`

O servico nao agenda cron no processo Node. A rotina de notificacoes de sindicatos deve ser
acionada por um scheduler externo, como Supabase/Vercel, usando `x-internal-service-token`.
Em VPS, configure `INTERNAL_SERVICE_TOKEN` em `.env.vps.pessoal-service` e use o mesmo valor nesse header.

## Desenvolvimento

```bash
pnpm --filter @workspace/pessoal-service dev
```
