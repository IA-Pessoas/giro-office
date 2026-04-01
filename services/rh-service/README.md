# rh-service

Funcionalidades de RH (ex.: configuração de ponto). Montado no gateway no prefixo **`/rh`**.

## Porta local

Por defeito: **3339** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`.

## Gateway

- URL upstream: `RH_SERVICE_URL` (ex.: `http://localhost:3339`).
- O micro expõe rotas sob o prefixo `/rh` (ex.: `PUT /rh/point-config`). O cliente usa o mesmo path através do gateway: `/rh/...`.

## Desenvolvimento

```bash
pnpm --filter @workspace/rh-service dev
```
