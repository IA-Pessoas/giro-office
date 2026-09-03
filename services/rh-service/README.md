# rh-service

Funcionalidades de RH, incluindo ponto, banco de horas, folhas de ponto, chamados e score.
Montado no gateway no prefixo **`/rh`**.

## Porta local

Por defeito: **3034** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `DATABASE_POOL_MAX` (inteiro positivo, default 1), `JWT_SECRET`, `REPORTS_INTERNAL_TOKEN` e `REPORTS_GRANT_SECRET`.

## Gateway

- URL upstream: `RH_SERVICE_URL` (ex.: `http://localhost:3034`).
- O micro expoe rotas sob o prefixo `/rh`.
- Exemplos publicos: `GET /rh/time-bank/summary`, `GET /rh/timesheets/{id}`,
  `GET /rh/score/quarters/{id}`.
- `POST /rh/requests` aceita criacao sem `assigned_to_user_id`; nesse caso o backend atribui automaticamente um responsavel RH elegivel antes de persistir.
- `GET /rh/operational-users` lista colaboradores ativos da organizacao com payload minimo para seletores operacionais de RH.

## Reporting interno

`GET /internal/reporting/catalog` e `POST /internal/reporting/extract` são rotas internas chamadas
diretamente pelo reports-service. Elas não passam pelo gateway público, exigem token interno e
grant HMAC curto, filtram sempre por `organization_id` do grant e publicam somente os campos
seguros de `rh.requests` e `rh.holidays`. IDs de solicitante e responsável ficam disponíveis
apenas como chaves de autorização no catálogo, nunca como colunas de saída; `rh.holidays` não
publica chaves nem relações e expõe somente nome e data.

## Desenvolvimento

```bash
pnpm --filter @workspace/rh-service dev
```
