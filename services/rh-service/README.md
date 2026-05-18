# rh-service

Funcionalidades de RH, incluindo ponto, banco de horas, folhas de ponto, chamados e score.
Montado no gateway no prefixo **`/rh`**.

## Porta local

Por defeito: **3034** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`.

## Gateway

- URL upstream: `RH_SERVICE_URL` (ex.: `http://localhost:3034`).
- O micro expoe rotas sob o prefixo `/rh`.
- Exemplos publicos: `GET /rh/time-bank/summary`, `GET /rh/timesheets/{id}`,
  `GET /rh/score/quarters/{id}`.

## Desenvolvimento

```bash
pnpm --filter @workspace/rh-service dev
```
