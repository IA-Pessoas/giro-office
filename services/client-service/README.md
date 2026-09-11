# client-service

Gestao de clientes (criacao, listagem, atualizacao, desativar/reativar, integracao, verticais de negocio, historicos e rotina de competencia). Montado no gateway no prefixo **`/client`**.

## Porta local

Por defeito: **3035** (`PORT`).

## Variaveis de ambiente

Ver `src/config/env.ts`:

- `DATABASE_URL`, `DATABASE_POOL_MAX` (default `1`), `JWT_SECRET`
- `CLIENT_HISTORY_STORAGE_DIR` - diretorio base para uploads de historico (alternativa ao Firebase do legado)
- `CLIENT_SERVICE_INTERNAL_TOKEN` - token compartilhado com o gateway para o contexto encaminhado e para `POST /internal/competence-output-update` (header `x-internal-service-token`); obrigatório em produção
- `AUDIT_SERVICE_TOKEN` - fallback local do token interno apenas fora de produção, quando `CLIENT_SERVICE_INTERNAL_TOKEN` não é informado
- `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` - token e segredo HMAC compartilhados com `reports-service` para `/internal/reporting/*`; obrigatórios e fortes em produção

## Gateway

- URL upstream: `CLIENT_SERVICE_URL` (ex.: `http://localhost:3035`).

## Contrato HTTP (via gateway)

Todas as rotas abaixo exigem `Authorization: Bearer <jwt>` com `organization_id` coerente quando aplicavel. O claim opcional `permission` (numero) e usado para alinhar ao legado: **`DELETE /client/:id`** e **`DELETE /client/histories/pending/:pendingId`** exigem **`permission >= 2`** (admin).

| Metodo | Caminho | Descricao |
|--------|---------|-----------|
| `GET` | `/client/list` | Listagem paginada. Query: `page`, `limit`, `search`, `status`, `ref` (`integracao` \| `deps`), `organization_id` opcional. |
| `GET` | `/client/:id` | Detalhe. |
| `POST` | `/client` | Criar (campos estendidos alinhados ao Prisma: endereco, fiscal, modulos, datas, etc.). |
| `PATCH` | `/client/:id` | Atualizar parcial. |
| `DELETE` | `/client/:id` | Desativar (soft): `status` Inativo + `deletion_date`. Requer `permission: 2`. |
| `POST` | `/client/:id/activate` | Reativar. |
| `POST` | `/client/integration` | Fluxo integracao (cadastro). |
| `PATCH` | `/client/:id/integration` | Atualizacao integracao. |
| `PATCH` | `/client/:id/termination` | Distrato. |
| `PATCH` | `/client/:id/finance` | Contrato (`contract`). |
| `PATCH` | `/client/:id/regularize` | Regularize (dados cadastrais estendidos). |
| `POST` | `/client/:id/histories` | multipart: `date`, `history`, `pending_id` opcional, `file` opcional. |
| `GET` | `/client/:id/histories` | Lista historicos do cliente. |
| `GET` | `/client/:id/histories/:historyId` | Detalhe de historico. |
| `PATCH` | `/client/:id/histories/:historyId` | Atualizar (autor = criador do registo). |
| `POST` | `/client/:id/histories/pending` | Criar pendencia. |
| `GET` | `/client/histories/pending` | Lista pendencias; query opcional `user_id`. |
| `DELETE` | `/client/histories/pending/:pendingId` | Remover pendencia (admin). |
| `POST` | `/internal/competence-output-update` | Rotina batch (token interno). |
| `POST` | `/internal/commercial/prospecting-transition` | Projeção idempotente de transição comercial (token interno). |

Prospecção e cobrança públicas pertencem ao `commercial-service` (`/commercial/*`). Os antigos
`GET /client/commercial/overview` e `PATCH /client/:id/commercial` foram removidos no corte; efeitos
projetados continuam entrando por `POST /internal/commercial/prospecting-transition`.

## Competencia via Supabase Edge Function

O `client-service` nao agenda mais a rotina no processo HTTP. O agendamento deve ser feito por uma Edge Function em [supabase/functions/client-competence-output-update/index.ts](/c:/Users/Bruno.Silva.175CASTELO/Documents/BRUNO/DOCUMENTOS/workspace/supabase/functions/client-competence-output-update/index.ts), que chama `POST /internal/competence-output-update`.

Variaveis esperadas na Edge Function:

- `CLIENT_SERVICE_BASE_URL` - base URL do `client-service` (ex.: `https://api.exemplo.com` ou `http://host.docker.internal:3035`)
- `CLIENT_SERVICE_INTERNAL_TOKEN` - mesmo token configurado no `client-service`
- `EDGE_FUNCTION_SECRET` - opcional, para restringir chamadas manuais a function

Sugestao de agenda: diariamente as 07:00 em `America/Sao_Paulo`.

### Listagem (`GET /client/list`)

- Sem `ref`: `status` em `Ativo`, `Inativo`, `Prospect` (mapeado para `Prospeccao` na BD), `Prospeccao`, `Fechado`, ou omitido / `Todos`.
- `ref=integracao`: filtros alinhados ao legado (ex.: `Ativo` com `dominio_code` preenchido, `Ativo e Prospeccao`, `Ativo PJ`, etc.).
- `ref=deps`: `status` no formato `Departamento contabil` \| `fiscal` \| `pessoal` \| `infoproduto` \| `consultoria` \| `castelo_med`, ou `Todos`.

O DTO publico de cliente inclui `deletion_date` (ISO ou `null`). Respostas usam o envelope `createSuccessResponse` do shared.

## Desenvolvimento

```bash
pnpm --filter @workspace/client-service dev
```

Testes: `pnpm --filter @workspace/client-service test`. Integracao Postgres opcional: `CLIENT_SERVICE_INTEGRATION=1` e `DATABASE_URL`.

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
