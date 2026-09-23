# Retomada do WIP guardado de task e reports

Data: 2026-09-23
Branch: `cf/resume-task-reports-wip`, a partir de `origin/cloudflare-migration` (`47ad9088`).
WIP: stash `090020bf` ("wip-services-sync-1790172926", 10:15), preso pela branch
`backup/wip-cloudflare-migration-services-2026-09-23b`. O stash foi criado sobre `b260d846`.

Não houve deploy, push, reset, rebase, amend, `--no-verify` nem `stash pop/drop`.

## Objetivo original

O stash troca o task-service Worker da versão que reusa os serviços do Node por
injeção (`cf/task-service`, `27d98563`) pela versão com os serviços copiados para
dentro do Worker (`cf/task-worker`, `df3828c5..b663b2dd`, descrita em
`task-remainder.md`). Para isso, desfaz a injeção de dependências no
`services/task-service`. De quebra, leva `workers/reports-service` e
`scripts/cloudflare-smoke` de volta ao estado de `cf/task-worker`.

## O que o stash contém de fato

Nenhum conteúdo inédito. Comparando as árvores:

| caminho | igual a |
|---|---|
| `workers/task-service` | `b663b2dd` (ponta de `cf/task-worker`), mais o log de token recusado do `auth.ts` de `b260d846` |
| `services/task-service`, `workers/reports-service`, `scripts/cloudflare-smoke` | `b663b2dd` |
| `workers/gateway`, `pnpm-lock.yaml` | `f7d49ce9` (lado da consolidada antes do merge `bb0ced8d`) |
| `.superpowers` | remoção de `task-and-reports-remainder.md` |

Ou seja, o stash é o inverso da resolução do merge `bb0ced8d` ("Merge branch
'cf/task-service' into cf/reports-jobs"). Aquele merge escolheu, de propósito, a
versão com injeção e tirou a cópia da árvore. Tudo que o stash traz continua
recuperável pelo histórico (`b663b2dd`).

## O que foi aplicado

Só o `schemaParity.test.ts` do stash, portado para `workers/task-service/src/`
(caminhos relativos ajustados). Ele ficou mais rígido: exige que a coluna tenha o
atributo `@updatedAt` no schema do Worker, não só que ela exista. Uma coluna
declarada sem `@updatedAt` passava no teste original, mas deixava o valor para o
banco, que não tem default. O schema da base já passa. O teste foi validado em RED:
ao remover o `@updatedAt` de `organizations.updated_at`, ele falha apontando
`organizations.updated_at`.

## O que foi descartado e por quê

1. **Trocar o task Worker pela versão com cópias.**
   - A base é o que está em produção e funciona. Seu teste de paridade usa o app
     Express do Node como oráculo: 123 casos de status, body e argumentos.
   - A versão com cópias duplica cerca de 6 mil linhas de serviço. O próprio
     `task-remainder.md` registra que elas "divergem do Node a partir de agora".
     O Node continua recebendo mudanças pela `develop` (veja o merge `47ad9088`),
     e cada uma delas teria de ser replicada à mão.
   - Nada funcional falta na base. Cookie JWT no repasse do gateway, auditoria
     `required` que falha a operação, 503 por configuração ausente e bucket de anexo
     com default já existem nela.
   - As diferenças da cópia seriam mudanças de contrato: mensagens com mojibake
     corrigidas só no Worker, 413 acima de 1 MB e rate limit por isolate.
2. **Desfazer a injeção de dependências no `services/task-service`.** Ela só fazia
   sentido junto com o item 1. A base depende dela.
3. **Reverter `workers/reports-service`.** Removeria o cron que consome a fila de
   jobs (os jobs voltariam a nunca ser processados). Também removeria o roteamento
   das origens por Service Binding: o reports voltaria a buscar o task por
   `TASK_SERVICE_URL`, que não existe com `workers_dev: false`. É regressão direta.
4. **Reverter `scripts/cloudflare-smoke`.** Removeria os checks de preview e cron do
   reports e a correção da assinatura "adulterada" do grant.
5. **Remover os casos de `/task` do `workers/gateway/src/serviceRoutes.test.ts`.**
   Seria perda de cobertura.
6. **Apagar `task-and-reports-remainder.md`.** É o registro da versão que está em
   produção.

O lockfile não mudou, porque nenhum `package.json` mudou. `pnpm install
--frozen-lockfile` passa, e o hono segue em 4.13.8 em todos os pacotes.

## Mudanças de comportamento e contrato

Nenhuma. As rotas `/task*` usadas pela UI, `/internal/commercial/*` (token
`COMMERCIAL_SERVICE_TOKEN`) e `/internal/reporting/*` ficam como na base. Os secrets
não mudam.

## Se quiserem a versão com cópias

Ela está íntegra em `cf/task-worker` (`b663b2dd`). Adotá-la exige manter o
`workers/reports-service` e o smoke da base, e aceitar replicar à mão cada mudança
da `develop` em `services/task-service/src/services`.

## Validação

| pacote | test | typecheck | check |
|---|---|---|---|
| `workers/task-service` | 141/141 | PASS | PASS |
| `workers/reports-service` | 30/30 | PASS | PASS |
| `workers/gateway` | 144/144 | PASS | PASS |
| `services/task-service` | 499 passaram, 6 skip | PASS | PASS |
| `services/reports-service` | 412/412 | PASS | PASS |

`wrangler deploy --dry-run`: task 1904 KiB gzip, reports 1779 KiB gzip, gateway
170 KiB gzip. Todos passaram.

Numa worktree nova, antes dos testes é preciso rodar o build de `shared` e
`workers/runtime`, e gerar os clients Prisma. O script `prisma-generate.mjs` pede
`DATABASE_URL`, e um valor fictício basta. O `app.test.ts` do gateway importa o
audit Worker e precisa do `prisma:generate` dele.
