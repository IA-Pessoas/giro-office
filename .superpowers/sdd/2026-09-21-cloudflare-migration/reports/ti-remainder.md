# Relatório — correções TDD do TI Worker

## Escopo executado

Implementado somente em `workers/ti-service/**`, com este relatório como
único artefato fora do Worker:

- `CategoryStock.id` e `LocationStock.id` agora usam `@default(uuid())`; o
  cliente Prisma foi regenerado e os handlers de criação continuam sem exigir
  `id`.
- Autorização de TI valida `claims.modules.ti`. Chamadas encaminhadas pelo
  gateway continuam aceitas pelo token interno; cookies diretos exigem CSRF e
  validação de sessão pelo `USER_SERVICE` service binding.
- Transferência de chamado preserva a exceção de owner com TI Viewer e usa
  `assigned_to_id` no `updateMany`, retornando conflito (`409`) em corrida.
- Reporting usa `withReportingSnapshot` com `RepeatableRead` para consultas
  paginadas e grava o replay guard em `reports.grant_uses`, tabela já definida
  no schema/migration canônico de `infra/prisma`; não foi criada tabela D1.
- `P2002` de categoria de estoque é convertido em `409`.
- O adaptador de imagem ganhou `remove`; falha em `createMessage` remove o
  upload já realizado sem mascarar o erro original.

As decisões foram comparadas com `services/ti-service` e os helpers
compartilhados de runtime/reporting. Não foram alterados `services/ti-service`,
`shared`, gateway ou outros Workers.

## TDD e validação

Os testes foram escritos antes da implementação em dois ciclos RED/GREEN.
O RED observou falhas nos contratos de `modules.ti`, UUID, `P2002`, owner
Viewer/concurrency, CSRF/sessão, snapshot, replay persistente e compensação de
upload. A implementação mínima foi aplicada e os testes ficaram verdes.

Evidências finais locais em 2026-09-22:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @workspace/ti-worker test` | PASS — 20/20 |
| `pnpm --filter @workspace/ti-worker typecheck` | PASS |
| `pnpm --filter @workspace/ti-worker build` | PASS |
| `pnpm --filter @workspace/ti-worker check` | PASS — Biome |
| `pnpm --filter @workspace/ti-worker exec prisma validate --schema prisma/schema.prisma` | PASS |
| `pnpm graphify:update:services` | PASS — grafo escopado atualizado |
| `pnpm exec wrangler deploy --dry-run --config workers/ti-service/wrangler.jsonc` | PASS — 6512.98 KiB, binding `USER_SERVICE`, sem publicação |
| `git diff --check` | PASS |

Os scripts de teste, typecheck e build também executaram `prisma generate` com
sucesso. O hook de commit de segurança passou sem findings.

## Limites e lacunas honestas

- Não houve deploy real, push, smoke autenticado contra Postgres/Supabase nem
  teste de URL pública.
- O dry-run valida empacotamento e binding declarado, não a configuração real
  de Hyperdrive, secrets, `USER_SERVICE`, grants ou Supabase Storage.
- O Worker não foi validado com dados reais; portanto este relatório não
  afirma equivalência funcional de produção.

## Isolamento de mudanças

Mudanças concorrentes/preexistentes em `app/next-env.d.ts`,
`workers/pessoal-service/**`, `workers/rh-service/**` e relatórios fora de TI
foram preservadas e não fazem parte dos commits TI. Também não foram tocados
`reports/user-remainder.md` nem os demais arquivos de Pessoal, Reports, User,
RH ou app.

## Commits

- `0dfe4207 fix(ti-worker): close migration gaps` — código, schema, ambiente,
  testes e validações do TI Worker.
- commit seguinte — atualização deste relatório TI, separada do commit de
  código conforme solicitado.

Não houve deploy nem push.
