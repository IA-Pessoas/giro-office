# Project-service — re-review TDD: Client e conflitos CRUD

Data: 2026-09-22
Commit de código: `4927b4f6` (`fix(project-worker): align client table and conflict handling`)

## Escopo

Este ciclo alterou somente:

- `workers/project-service/prisma/schema.prisma`
- `workers/project-service/src/app.ts`
- `workers/project-service/src/app.test.ts`

O relatório é o único artefato fora de `workers/project-service/**` autorizado. Não
houve deploy nem push; `app/next-env.d.ts` permaneceu com sua alteração preexistente.

Graphify foi consultado antes da edição e atualizado depois. O grafo AST terminou com
9.305 nós, 16.952 arestas e 377 comunidades; a visualização HTML foi omitida pelo
limite de 5.000 nós.

## Correções do re-review

### Schema Client e Project.client

O schema canônico define `model Client` com `@@map("clients")`; `model ClientPF` é o
modelo separado que usa `@@map("clients.pf")`. O Worker agora usa `@@map("clients")`
para `Client`, preservando `Project.client @relation(fields: [client_id], references:
[id])` e as relações `Client.projects`, `Client.tasks` e `Task.client`.

Foram conferidos no bloco canônico e mantidos no Worker os campos realmente usados por
CRUD, progresso e detalhe/UI: `id`, `name`, `company_name`, `fantasy_name`, `cpf_cnpj`,
`organization_id`, `status`, `service_unique` e `deletion_date`, além das relações de
projeto/tarefa. Prisma foi regenerado e os dois schemas passaram `prisma validate`.

### PUT

O handler agora converte para `409` os conflitos `P2002`, `P2034`, `P2025` e mensagens
de serialização/deadlock (`could not serialize access`, `serialization failure`,
`deadlock detected`). Um `P2025` durante o `update`, depois do precheck, é tratado como
concorrência; ausência observada no precheck continua `404`.

### DELETE

`P2025` após a checagem de existência é idempotente: responde `200` com
`data.response: null` e não gera auditoria de uma exclusão que já não existe. O erro de
dependência `P2003` continua `409`; conflitos de serialização/`P2034` continuam `409`.
O DELETE com JSON vazio e `project_id` na query permanece coberto.

RepeatableRead do progresso, reporting com `client_id`/`sponsor_id`, guard `503` sem
Hyperdrive/`DATABASE_URL` e criação `Serializable` permanecem sem regressão.

## TDD

RED foi observado antes da implementação: 25 testes, 6 falhas e 19 passando — mapa
incorreto `clients.pf`, quatro variantes de conflito no PUT e `P2025` no DELETE.

GREEN final: 25/25 testes passando, incluindo os testes públicos do handler, e não
apenas helpers internos.

## Validação

- `pnpm --filter @workspace/project-worker test` — PASS, 25/25.
- `pnpm --filter @workspace/project-worker typecheck` — PASS.
- `pnpm --filter @workspace/project-worker build` — PASS.
- `pnpm --filter @workspace/project-worker check` — PASS.
- `pnpm --filter @workspace/project-worker exec prisma validate --schema prisma/schema.prisma` — PASS.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma` — PASS.
- `pnpm graphify:update:services` — PASS.
- `pnpm exec wrangler deploy --dry-run` em `workers/project-service` — PASS, sem publicação.
- `git diff --check` — PASS.
- Hooks dos commits — PASS, supply-chain scan sem findings.

O dry-run do Wrangler mostrou somente `AUDIT_SERVICE` e `USER_SERVICE`; nenhum binding
Hyperdrive foi inventado.

## Gaps operacionais

- **Hyperdrive:** continua sem binding configurado. O Worker mantém fallback explícito
  para `DATABASE_URL` e retorna `503` se não houver `HYPERDRIVE.connectionString` nem
  `DATABASE_URL`. Produção/CI ainda precisam provisionar o binding ou secret autorizado.
- **Constraint de projeto:** o schema canônico continua sem unique física para
  `(organization_id, name, client_id)`. A proteção de criação permanece transacional
  (`Serializable`) e nenhuma migration foi criada sem autorização.
- **Queue:** não há rota/job do project-service que exija Queue; nenhum binding foi
  inventado.
