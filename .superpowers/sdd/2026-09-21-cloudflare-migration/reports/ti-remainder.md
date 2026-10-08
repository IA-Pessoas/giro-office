# Relatório — correções TDD do TI Worker

## Escopo executado

Implementado somente em `workers/ti-service/**`, no contrato necessário de
`workers/gateway/**` e neste relatório TI:

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
- O adaptador de imagem ganhou `remove`; falha na validação do path, em
  `createMessage` ou na geração posterior da URL assinada remove o upload já
  realizado sem mascarar o erro original.
- `workers/gateway/src/auth.ts` reutiliza as constantes compartilhadas para
  limpar headers de identidade encaminhados pelo cliente e repassar somente
  claims de sessão autenticados (`session_id`, `session_version` e
  `csrf_hash`). O TI reconstrói esses claims e preserva o token de sessão do
  cookie para a validação pelo `USER_SERVICE` binding.
- O teste de integração cobre Gateway→TI com segredos e sessões distintos:
  leitura e mutação corretas passam com CSRF válido, CSRF incorreto é rejeitado
  antes do TI, headers de sessão forjados são sobrescritos e acesso direto
  continua protegido.

As decisões foram comparadas com `services/ti-service` e os helpers
compartilhados de runtime/reporting. Não foram alterados
`services/ti-service`, `shared` ou outros Workers.

## TDD e validação

Os testes deste ciclo foram escritos antes da implementação. O RED observou:

- Gateway repassando `spoofed-session` em vez do claim autenticado;
- mutação correta via Gateway retornando `403` por falta dos claims de sessão;
- ausência de `remove` após path de upload inválido e após falha na URL assinada.

A implementação mínima foi aplicada e os testes ficaram verdes, preservando
também as coberturas RED/GREEN do ciclo anterior para `modules.ti`, UUID,
`P2002`, owner Viewer/concurrency, snapshot e replay persistente.

Evidências finais locais em 2026-09-22:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @workspace/ti-worker test` | PASS — 24/24 |
| `pnpm --filter @workspace/gateway-worker test` | PASS — 6/6 |
| `pnpm --filter @workspace/ti-worker typecheck` | PASS |
| `pnpm --filter @workspace/gateway-worker typecheck` | PASS |
| `pnpm --filter @workspace/ti-worker build` | PASS |
| `pnpm --filter @workspace/gateway-worker build` | PASS |
| `pnpm --filter @workspace/ti-worker check` | PASS — Biome |
| `pnpm --filter @workspace/gateway-worker check` | PASS — Biome |
| `pnpm --filter @workspace/ti-worker exec prisma validate --schema prisma/schema.prisma` | PASS |
| `pnpm graphify:update:services` | PASS — grafo escopado atualizado |
| `pnpm exec wrangler deploy --dry-run --config workers/ti-service/wrangler.jsonc` | PASS — 6513.94 KiB, binding `USER_SERVICE`, sem publicação |
| `pnpm exec wrangler deploy --dry-run --config workers/gateway/wrangler.jsonc` | PASS — 82.10 KiB, sem publicação |
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
`workers/pessoal-service/**` e relatórios fora de TI foram preservadas e não
fazem parte dos commits. Também não foram tocados `reports/user-remainder.md`
nem os demais arquivos de Pessoal, Reports, User, RH ou app.

## Commits

- `0dfe4207 fix(ti-worker): close migration gaps` — código, schema, ambiente,
  testes e validações do TI Worker.
- `63a56384 fix(ti): forward authenticated gateway session claims` — contrato
  Gateway→TI, teste de integração e compensação completa de upload.
- commit seguinte — atualização deste relatório TI, separada do commit de
  código conforme solicitado.

Não houve deploy nem push.
