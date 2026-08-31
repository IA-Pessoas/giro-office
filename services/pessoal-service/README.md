# pessoal-service

Microservico de Pessoal. O gateway encaminhara esse servico pelo prefixo publico **`/pessoal`**.

## Porta local

Por defeito: **3042** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `DATABASE_POOL_MAX` (default `1`)
- `JWT_SECRET`
- `AUDIT_SERVICE_URL`
- `AUDIT_SERVICE_TOKEN`
- `INTERNAL_SERVICE_TOKEN` (obrigatorio em producao; em dev/test usa `AUDIT_SERVICE_TOKEN` como fallback)
- `REPORTS_GRANT_SECRET` (segredo compartilhado com o reports-service para grants de reporting)
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
- `GET /internal/reporting/catalog`
- `POST /internal/reporting/extract`

O catálogo interno publica `pessoal.ldd`, `pessoal.payroll` e `pessoal.obligations`. Os
identificadores de cliente, responsável e sindicato ficam exclusivamente em `keys`; a extração só
aceita campos publicados e sempre usa a organização contida no grant HMAC de curta duração.

O servico nao agenda cron no processo Node. A rotina de notificacoes de sindicatos deve ser
acionada por um scheduler externo, como Supabase/Vercel, usando `x-internal-service-token`.
Em VPS, configure `INTERNAL_SERVICE_TOKEN` em `.env.vps.pessoal-service` e use o mesmo valor nesse header. O fallback para `AUDIT_SERVICE_TOKEN` fica restrito a dev/test.

## Desenvolvimento

```bash
pnpm --filter @workspace/pessoal-service dev
```
