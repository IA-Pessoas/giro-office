# organization-service

CRUD e operações de organizações. Montado no gateway no prefixo **`/organizations`**.

## Porta local

Por defeito: **3031** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `DATABASE_POOL_MAX` (default `1`), `JWT_SECRET` (alinhado com o gateway para validação JWT).

## Gateway

- URL upstream: `ORGANIZATION_SERVICE_URL` (ex.: `http://localhost:3031`), definida no [env do gateway](../gateway/src/config/env.ts).
- O cliente chama o gateway em caminhos como `GET /organizations/organizations` (o micro expõe rotas sob `/organizations`).

## Desenvolvimento

```bash
pnpm --filter @workspace/organization-service dev
```

Gerar Prisma: `pnpm prisma:generate` no pacote (delega ao `@workspace/infra`).
