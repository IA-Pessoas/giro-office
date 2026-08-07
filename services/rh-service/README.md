# rh-service

Funcionalidades de RH, incluindo ponto, banco de horas, folhas de ponto, chamados e score.
Montado no gateway no prefixo **`/rh`**.

## Porta local

Por defeito: **3034** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `DATABASE_POOL_MAX` (inteiro positivo, default 5) e `JWT_SECRET`.

## Gateway

- URL upstream: `RH_SERVICE_URL` (ex.: `http://localhost:3034`).
- O micro expoe rotas sob o prefixo `/rh`.
- Exemplos publicos: `GET /rh/time-bank/summary`, `GET /rh/timesheets/{id}`,
  `GET /rh/score/quarters/{id}`.
- `POST /rh/requests` aceita criacao sem `assigned_to_user_id`; nesse caso o backend atribui automaticamente um responsavel RH elegivel antes de persistir.
- `GET /rh/operational-users` lista colaboradores ativos da organizacao com payload minimo para seletores operacionais de RH.

## Desenvolvimento

```bash
pnpm --filter @workspace/rh-service dev
```
