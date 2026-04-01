# client-service

Gestão de clientes (criação, listagem, atualização, desativar/reativar, integração, verticais de negócio, históricos e rotina de competência). Montado no gateway no prefixo **`/clients`**.

## Porta local

Por defeito: **3410** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`, `JWT_SECRET`
- `CLIENT_HISTORY_STORAGE_DIR` — diretório base para uploads de histórico (alternativa ao Firebase do legado)
- `CLIENT_SERVICE_INTERNAL_TOKEN` — token para `POST /internal/competence-output-update` (header `x-internal-service-token`)
- `CLIENT_ENABLE_COMPETENCE_OUTPUT_CRON` — `true` para agendar a rotina diária (07:00 `America/Sao_Paulo`) no processo

## Gateway

- URL upstream: `CLIENT_SERVICE_URL` (ex.: `http://localhost:3410`).
- Rollback para o legado: no gateway, `GATEWAY_USE_CLIENT_SERVICE_FOR_CLIENTS=false` encaminha `/clients` para `LEGACY_API_URL`.

## Contrato HTTP (via gateway)

Todas as rotas abaixo exigem `Authorization: Bearer <jwt>` com `organization_id` coerente quando aplicável. O claim opcional `permission` (número) é usado para alinhar ao legado: **`DELETE /clients/:id`** e **`DELETE /clients/histories/pending/:pendingId`** exigem **`permission === 2`** (admin).

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/clients` | Listagem paginada. Query: `page`, `limit`, `search`, `status`, `ref` (`integracao` \| `deps`), `organization_id` opcional. |
| `GET` | `/clients/:id` | Detalhe. |
| `POST` | `/clients` | Criar (campos estendidos alinhados ao Prisma: endereço, fiscal, módulos, datas, etc.). |
| `PATCH` | `/clients/:id` | Atualizar parcial. |
| `DELETE` | `/clients/:id` | Desativar (soft): `status` Inativo + `deletion_date`. Requer `permission: 2`. |
| `POST` | `/clients/:id/activate` | Reativar. |
| `POST` | `/clients/integration` | Fluxo integração (cadastro). |
| `PATCH` | `/clients/:id/integration` | Atualização integração. |
| `PATCH` | `/clients/:id/commercial` | Comercial (prospecção + efeitos em tarefas). |
| `PATCH` | `/clients/:id/termination` | Distrato. |
| `PATCH` | `/clients/:id/finance` | Contrato (`contract`). |
| `PATCH` | `/clients/:id/regularize` | Regularize (dados cadastrais estendidos). |
| `POST` | `/clients/:id/histories` | multipart: `date`, `history`, `pending_id` opcional, `file` opcional. |
| `GET` | `/clients/:id/histories` | Lista históricos do cliente. |
| `GET` | `/clients/:id/histories/:historyId` | Detalhe de histórico. |
| `PATCH` | `/clients/:id/histories/:historyId` | Atualizar (autor = criador do registo). |
| `POST` | `/clients/:id/histories/pending` | Criar pendência. |
| `GET` | `/clients/histories/pending` | Lista pendências; query opcional `user_id`. |
| `DELETE` | `/clients/histories/pending/:pendingId` | Remover pendência (admin). |
| `POST` | `/internal/competence-output-update` | Rotina batch (token interno). |

### Listagem (`GET /clients`)

- Sem `ref`: `status` ∈ `Ativo`, `Inativo`, `Prospect` (mapeado para `Prospecção` na BD), `Prospecção`, `Fechado`, ou omitido / `Todos`.
- `ref=integracao`: filtros alinhados ao legado (ex.: `Ativo` com `dominio_code` preenchido, `Ativo e Prospecção`, `Ativo PJ`, …).
- `ref=deps`: `status` no formato `Departamento contabil` \| `fiscal` \| `pessoal` \| `infoproduto` \| `consultoria` \| `castelo_med`, ou `Todos`.

O DTO público de cliente inclui `deletion_date` (ISO ou `null`). Respostas usam o envelope `createSuccessResponse` do shared.

## Desenvolvimento

```bash
pnpm --filter @workspace/client-service dev
```

Testes: `pnpm --filter @workspace/client-service test`. Integração Postgres opcional: `CLIENT_SERVICE_INTEGRATION=1` e `DATABASE_URL`.
