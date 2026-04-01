# client-service

Gestão de clientes (criação, listagem, atualização, desativar/reativar). Montado no gateway no prefixo **`/clients`**.

## Porta local

Por defeito: **3410** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET`.

## Gateway

- URL upstream: `CLIENT_SERVICE_URL` (ex.: `http://localhost:3410`).

## Contrato HTTP (via gateway)

Todas as rotas abaixo exigem `Authorization: Bearer <jwt>` com `organization_id` coerente quando aplicável.

| Método | Caminho (no gateway) | Descrição |
|--------|-------------------------|-----------|
| `GET` | `/clients` | Listagem paginada. Query: `page`, `limit`, `search`, `status` (`Ativo`, `Inativo`, `Prospect`, `Prospecção`, `Fechado`). Resposta: `items`, `total`, `page`, `pageSize`, `hasMore`. |
| `GET` | `/clients/:id` | Detalhe. |
| `POST` | `/clients` | Criar. |
| `PATCH` | `/clients/:id` | Atualizar parcial. |
| `DELETE` | `/clients/:id` | Desativar (soft): `status` Inativo + `deletion_date`. |
| `POST` | `/clients/:id/activate` | Reativar: `status` Ativo, `deletion_date` null. |

O DTO público inclui `deletion_date` (ISO ou `null`). Respostas usam o envelope `createSuccessResponse` do shared.

## Desenvolvimento

```bash
pnpm --filter @workspace/client-service dev
```

Testes: `pnpm --filter @workspace/client-service test`. Integração Postgres opcional: `CLIENT_SERVICE_INTEGRATION=1` e `DATABASE_URL`.
