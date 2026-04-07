# client-service

Gestao de clientes (criacao, listagem, atualizacao, desativar/reativar, integracao, verticais de negocio, historicos e rotina de competencia). Montado no gateway no prefixo **`/clients`**.

## Porta local

Por defeito: **3410** (`PORT`).

## Variaveis de ambiente

Ver `src/config/env.ts`:

- `DATABASE_URL`, `JWT_SECRET`
- `CLIENT_HISTORY_STORAGE_DIR` - diretorio base para uploads de historico (alternativa ao Firebase do legado)
- `CLIENT_SERVICE_INTERNAL_TOKEN` - token para `POST /internal/competence-output-update` (header `x-internal-service-token`)

## Gateway

- URL upstream: `CLIENT_SERVICE_URL` (ex.: `http://localhost:3410`).

## Contrato HTTP (via gateway)

Todas as rotas abaixo exigem `Authorization: Bearer <jwt>` com `organization_id` coerente quando aplicavel. O claim opcional `permission` (numero) e usado para alinhar ao legado: **`DELETE /clients/:id`** e **`DELETE /clients/histories/pending/:pendingId`** exigem **`permission === 2`** (admin).

| Metodo | Caminho | Descricao |
|--------|---------|-----------|
| `GET` | `/clients` | Listagem paginada. Query: `page`, `limit`, `search`, `status`, `ref` (`integracao` \| `deps`), `organization_id` opcional. |
| `GET` | `/clients/:id` | Detalhe. |
| `POST` | `/clients` | Criar (campos estendidos alinhados ao Prisma: endereco, fiscal, modulos, datas, etc.). |
| `PATCH` | `/clients/:id` | Atualizar parcial. |
| `DELETE` | `/clients/:id` | Desativar (soft): `status` Inativo + `deletion_date`. Requer `permission: 2`. |
| `POST` | `/clients/:id/activate` | Reativar. |
| `POST` | `/clients/integration` | Fluxo integracao (cadastro). |
| `PATCH` | `/clients/:id/integration` | Atualizacao integracao. |
| `PATCH` | `/clients/:id/commercial` | Comercial (prospeccao + efeitos em tarefas). |
| `PATCH` | `/clients/:id/termination` | Distrato. |
| `PATCH` | `/clients/:id/finance` | Contrato (`contract`). |
| `PATCH` | `/clients/:id/regularize` | Regularize (dados cadastrais estendidos). |
| `POST` | `/clients/:id/histories` | multipart: `date`, `history`, `pending_id` opcional, `file` opcional. |
| `GET` | `/clients/:id/histories` | Lista historicos do cliente. |
| `GET` | `/clients/:id/histories/:historyId` | Detalhe de historico. |
| `PATCH` | `/clients/:id/histories/:historyId` | Atualizar (autor = criador do registo). |
| `POST` | `/clients/:id/histories/pending` | Criar pendencia. |
| `GET` | `/clients/histories/pending` | Lista pendencias; query opcional `user_id`. |
| `DELETE` | `/clients/histories/pending/:pendingId` | Remover pendencia (admin). |
| `POST` | `/internal/competence-output-update` | Rotina batch (token interno). |

## Competencia via Supabase Edge Function

O `client-service` nao agenda mais a rotina no processo HTTP. O agendamento deve ser feito por uma Edge Function em [supabase/functions/client-competence-output-update/index.ts](/c:/Users/Bruno.Silva.175CASTELO/Documents/BRUNO/DOCUMENTOS/workspace/supabase/functions/client-competence-output-update/index.ts), que chama `POST /internal/competence-output-update`.

Variaveis esperadas na Edge Function:

- `CLIENT_SERVICE_BASE_URL` - base URL do `client-service` (ex.: `https://api.exemplo.com` ou `http://host.docker.internal:3410`)
- `CLIENT_SERVICE_INTERNAL_TOKEN` - mesmo token configurado no `client-service`
- `EDGE_FUNCTION_SECRET` - opcional, para restringir chamadas manuais a function

Sugestao de agenda: diariamente as 07:00 em `America/Sao_Paulo`.

### Listagem (`GET /clients`)

- Sem `ref`: `status` em `Ativo`, `Inativo`, `Prospect` (mapeado para `Prospeccao` na BD), `Prospeccao`, `Fechado`, ou omitido / `Todos`.
- `ref=integracao`: filtros alinhados ao legado (ex.: `Ativo` com `dominio_code` preenchido, `Ativo e Prospeccao`, `Ativo PJ`, etc.).
- `ref=deps`: `status` no formato `Departamento contabil` \| `fiscal` \| `pessoal` \| `infoproduto` \| `consultoria` \| `castelo_med`, ou `Todos`.

O DTO publico de cliente inclui `deletion_date` (ISO ou `null`). Respostas usam o envelope `createSuccessResponse` do shared.

## Desenvolvimento

```bash
pnpm --filter @workspace/client-service dev
```

Testes: `pnpm --filter @workspace/client-service test`. Integracao Postgres opcional: `CLIENT_SERVICE_INTEGRATION=1` e `DATABASE_URL`.
