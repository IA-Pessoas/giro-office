# Department-service — paridade do Worker

Data: 2026-09-22

## Comparação de rotas

As rotas do serviço Node foram comparadas com `workers/department-service`:

- `GET /department/list`;
- `GET /department?dep_id=:id`;
- `POST /department`;
- `PUT /department`.

Todas estão presentes no Worker, com os mesmos envelopes, paginação, autenticação, tenant, permissões e erros. As consultas e mutações continuam limitadas por `organization_id`; o papel `ti` exige permissão 1 para leitura e 2 para escrita, com o bypass de owner já existente.

## Ciclo TDD e implementação

O RED foi criado antes da implementação para uma autenticação de organização sem `organization_id`: o Worker respondia `200` e alcançava o serviço. O GREEN adicionou a guarda no contexto autenticado e passou a responder `401` sem executar a operação. Isso fecha o isolamento de tenant na fronteira de autenticação sem alterar `shared`, `services/**` ou o gateway.

Commit de código: `0916ea10` (`fix(department-worker): reject organizationless auth`).

Arquivos de código:

- `workers/department-service/src/auth.ts`;
- `workers/department-service/src/app.test.ts`.

## Validações

- testes completos: 2 arquivos, 14 testes aprovados;
- typecheck: aprovado;
- build: aprovado;
- check: aprovado;
- `prisma validate`: aprovado;
- `wrangler deploy --dry-run`: aprovado, sem deploy;
- `git diff --check`: aprovado para o escopo trabalhado.

Graphify foi tentado antes da edição. O primeiro contexto não tinha grafo local, então a descoberta foi concluída pelo fallback manual com `rg`; a atualização de Graphify de `services` foi executada ao final.

## Lacunas e risco de staging

Não houve smoke autenticado contra PostgreSQL/Supabase real nem teste publicado de isolamento entre tenants. Não houve deploy, push, reset, rebase ou force-push. Alterações staged de Fiscal/Parcelamento de outra execução foram preservadas e não fazem parte deste commit.
