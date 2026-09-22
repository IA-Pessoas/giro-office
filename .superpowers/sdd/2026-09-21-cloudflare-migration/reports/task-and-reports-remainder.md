# task-service e reports-service: fechamento

Branch `cf/task-service` sobre `24363061`. Commits:

| commit | o quê |
|---|---|
| `b4f4633f` | Worker do task-service |
| `b3dcf1ad` | gateway: `/task` → `TASK_SERVICE` |
| `03b59115` | commercial: binding `TASK_SERVICE` reposto |
| `227a5626` | smoke: task-service |
| `d43ce81b` | reports: fila de jobs por cron e origens por Service Binding |
| `c72bc246` | smoke: preview e cron do reports |

Nenhum deploy e nenhum push.

## task-service

Não é porte. O Worker roda o `createTaskApp` do Node no workerd, via
`httpServerHandler` de `cloudflare:node`. As 55 rotas, a validação e os
envelopes de erro são os do Node. O `alias` do wrangler (espelhado no
`vitest.config.ts`) troca só estes módulos:

| módulo Node | no Worker |
|---|---|
| `prisma/index` | client por requisição via AsyncLocalStorage (I/O não atravessa requisições no workerd) |
| `config/env` | bindings do Worker, com as mesmas recusas de produção do Node |
| `middlewares/isAuthenticated` | auth dos Workers: contexto encaminhado com `INTERNAL_SERVICE_TOKEN`, Bearer, cookie + CSRF + validação de sessão |
| `integrations/audit` | binding `AUDIT_SERVICE` |
| `integrations/projectProgress` | binding `PROJECT_SERVICE`, token interno |
| `iconv-lite` | 0.7 (a 0.4 do body-parser 1.x derruba o workerd no load) |

A `integrations/projectWizard` não entra no bundle: o wizard cria o projeto
na própria transação (`createProjectInTransaction`), e esse módulo é
importado só como tipo.

Diferenças deliberadas em relação ao Node:

- Token do gateway: o Node aceitava o contexto encaminhado com o
  `AUDIT_SERVICE_TOKEN`. O Worker usa o `INTERNAL_SERVICE_TOKEN`, como os
  outros 17.
- Chamada ao project-service: o Node enviava o `AUDIT_SERVICE_TOKEN`. O
  Worker envia o `INTERNAL_SERVICE_TOKEN`, que é o que o project Worker
  valida.
- Auditoria best-effort: o recorder Node reenfileira falhas em background,
  o que o Worker perderia ao responder. Aqui a falha só é registrada, como
  nos outros Workers. A auditoria `required` continua falhando a operação.
- Rate limit de upload e de extração por IA: em memória, então vale por
  isolate e não é global.

Tamanho: 8,96 MB, 2,26 MB gzip (schema canônico inteiro).

## reports-service

Duas lacunas anteriores, fechadas:

1. **Fila de jobs sem consumidor.** O Node rodava `worker.ts` à parte, com
   polling a cada 5 s. O Worker não tinha nada, então job enfileirado nunca
   era processado. Agora há cron `*/1 * * * *` com o mesmo
   `ReportWorkerService`. Cada tick drena a fila até esvaziar ou até 50 s,
   e a latência passa a ser de até 1 min.
2. **Origens inalcançáveis.** Os adapters chamam `fetch(url)` com URLs que,
   no Worker, caíam no default `127.0.0.1:9`. Com binding, a URL vira
   `https://<svc>-service.binding` e um `fetch` roteador a entrega ao
   binding. São 11 bindings novos. Os 25 adapters Node ficaram intocados.

Continua como estava: o preview síncrono usa as claims do JWT para o
access context (`app.ts`, `accessContextClient`). O job revalida no
user-service pelo banco, como no Node.

## Validação

- task-worker: 24 testes, typecheck, build, check, dry-run.
- reports-worker: 30 testes, typecheck, build, check, dry-run (1,80 MB gzip).
- gateway: 92 testes. commercial: 18 testes.
- Smoke local contra Postgres real, 9 Workers: **26/27**. A única falha é
  `cleanup.dados_de_teste`, que é anterior a este trabalho. Checks novos:
  CRUD de tarefa pelo gateway, isolamento de tenant, `ENTITY_CHANGE`,
  token do commercial, preview reports → fiscal por binding, e job
  `queued → completed` pelo cron.
- Corrigido no smoke: a assinatura "adulterada" do grant era igual à válida
  sempre que já terminava em `0` (1 em 16 execuções).

## Bloqueios para deploy (credencial, só o usuário)

`giro-task-service`: `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`,
`AUDIT_SERVICE_TOKEN`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET`,
`USER_SERVICE_INTERNAL_TOKEN` e `COMMERCIAL_SERVICE_TOKEN` (os dois
últimos com o valor do token interno), mais `OPENAI_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
`TASK_ATTACHMENT_STORAGE_BUCKET`. Sem esses quatro últimos o Worker recusa
servir, como o Node em produção.

`giro-commercial-service`: faltam `TASK_SERVICE_INTERNAL_TOKEN` e
`INTERNAL_REQUEST_ORIGIN`. Sem eles o cron do outbox continua parado mesmo
com o binding reposto. O relatório final atribuía a parada só ao binding.

Ordem de deploy: task → commercial, reports → gateway. Todos declaram
binding para o task.

## Dívidas

- A branch ainda não foi integrada a `cf/integracao-consolidada`. O
  `/platform` está sendo feito em outra sessão, na worktree `cf-integracao`.
- `reports` sobe com `NODE_ENV=development` nos vars (herdado, não mexido).
- A tabela de jobs de relatório não está na limpeza do smoke.
