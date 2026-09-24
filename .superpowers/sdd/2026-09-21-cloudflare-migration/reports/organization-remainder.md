# Organization-service — paridade do Worker

Data: 2026-09-22

## Comparação de rotas

As rotas do serviço Node foram comparadas com `workers/organization-service`:

- organização: `GET /organizations`, `POST /organizations`, `GET /organizations/:id`, `PATCH /organizations/:id/status`, `PATCH /organizations/:id/subscription-plan` e `PATCH /organizations/:id/logo-url`;
- plataforma: `GET /platform/organizations`, `POST /platform/organizations`, `GET /platform/organizations/:id`, `PATCH /platform/organizations/:id/status`, `PATCH /platform/organizations/:id/subscription-plan` e `PATCH /platform/organizations/:id/logo-url`;
- saúde: `GET /health`.

Todas estão presentes no Worker. `GET /ready` e `GET /openapi` são superfícies adicionais do Worker e não substituem rotas do Node.

As rotas de organização preservam autenticação, sessão de plataforma, CSRF nas mutações, tenant, permissões, envelopes e mapeamento de erros. As operações de plataforma continuam separadas das operações do tenant.

## Resultado desta execução

Não houve alteração de código neste serviço nesta rodada: a paridade já estava fechada no histórico existente (`be4b8919`). Este arquivo é o registro separado da comparação e da revalidação.

Validações do Worker:

- testes completos: 1 arquivo, 6 testes aprovados;
- typecheck: aprovado;
- build: aprovado;
- check: aprovado;
- `prisma validate`: aprovado;
- `wrangler deploy --dry-run`: aprovado, sem deploy;
- `git diff --check`: aprovado para o escopo trabalhado.

Graphify foi tentado antes da edição. Como não havia grafo local no primeiro contexto, foi usado o fallback manual com `rg`; depois foi executado `pnpm graphify:update:services`, e o grafo de `services` ficou disponível para a verificação final.

## Lacunas e risco de staging

Não foram executados nesta rodada smoke autenticado contra PostgreSQL/Supabase real, sessão de plataforma real ou isolamento multi-tenant em ambiente publicado. Não houve deploy, push, reset, rebase ou force-push.

O worktree mantém, deliberadamente, alterações staged de Fiscal/Parcelamento feitas por outra execução. Elas não pertencem a este serviço e não foram incluídas no commit deste relatório.
